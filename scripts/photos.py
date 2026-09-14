#!/usr/bin/env python3
"""Build and optionally publish the photo gallery from a local drop folder."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    from PIL import Image, ImageOps, IptcImagePlugin
except ImportError:
    sys.exit("Pillow is required. Run: python3 -m pip install -r requirements-photos.txt")

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INBOX = ROOT / "photo-inbox"
MANIFEST = ROOT / "photos.json"
GALLERY = ROOT / "photos.html"
ASSETS = ROOT / "assets" / "photos"
STATE = ROOT / ".photo-publisher-state.json"
START = "<!-- PHOTOS:START -->"
END = "<!-- PHOTOS:END -->"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
VIDEO_EXTENSIONS = {".mov", ".mp4", ".m4v"}
MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS
VIDEO_PROCESSOR_VERSION = 2


def clean_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (tuple, list)):
        value = " ".join(clean_text(item) for item in value)
    if isinstance(value, bytes):
        for encoding in ("utf-16-le", "utf-8", "latin-1"):
            try:
                value = value.decode(encoding).rstrip("\x00")
                break
            except UnicodeDecodeError:
                continue
    return re.sub(r"\s+", " ", str(value)).strip()


def embedded_metadata(path: Path) -> dict[str, str]:
    result = {"title": "", "description": "", "alt": ""}
    exiftool = shutil.which("exiftool")
    if exiftool:
        completed = subprocess.run(
            [exiftool, "-json", "-Title", "-Description", "-ImageDescription", "-XPTitle", "-XPComment", "-Caption-Abstract", str(path)],
            check=True,
            capture_output=True,
            text=True,
        )
        extracted = json.loads(completed.stdout)[0]
        result["title"] = clean_text(extracted.get("Title") or extracted.get("XPTitle"))
        result["description"] = clean_text(
            extracted.get("Description")
            or extracted.get("Caption-Abstract")
            or extracted.get("XPComment")
            or extracted.get("ImageDescription")
        )
    if path.suffix.lower() in IMAGE_EXTENSIONS:
        with Image.open(path) as image:
            exif = image.getexif()
            result["title"] = result["title"] or clean_text(exif.get(40091))
            result["description"] = result["description"] or clean_text(exif.get(40092) or exif.get(270) or exif.get(37510))
            try:
                iptc = IptcImagePlugin.getiptcinfo(image) or {}
                result["title"] = result["title"] or clean_text(iptc.get((2, 5)))
                result["description"] = result["description"] or clean_text(iptc.get((2, 120)))
            except (OSError, SyntaxError):
                pass
    return result


def sidecar_metadata(path: Path) -> dict:
    sidecar = path.with_suffix(".json")
    if not sidecar.exists():
        return {}
    try:
        data = json.loads(sidecar.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Invalid sidecar {sidecar.name}: {error}") from error
    if not isinstance(data, dict):
        raise ValueError(f"Sidecar {sidecar.name} must contain a JSON object")
    return data


def slug(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "photo"


def optimize_image(source: Path) -> tuple[Path, int, int]:
    ASSETS.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "L"):
            canvas = Image.new("RGB", image.size, "#fbfbf5")
            if "A" in image.getbands():
                canvas.paste(image, mask=image.getchannel("A"))
            else:
                canvas.paste(image.convert("RGB"))
            image = canvas
        elif image.mode == "L":
            image = image.convert("RGB")
        width, height = image.size
        with tempfile.NamedTemporaryFile(suffix=".jpg", dir=ASSETS, delete=False) as handle:
            temporary = Path(handle.name)
        try:
            image.save(temporary, "JPEG", quality=88, optimize=True, progressive=True)
            digest = hashlib.sha256(temporary.read_bytes()).hexdigest()[:10]
            destination = ASSETS / f"{slug(source.stem)}-{digest}.jpg"
            if destination.exists():
                temporary.unlink()
            else:
                temporary.replace(destination)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
    return destination, width, height


def video_probe(path: Path) -> dict:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe is required for videos. Install FFmpeg, then run sync again.")
    completed = subprocess.run(
        [
            ffprobe,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height:format=duration",
            "-of", "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(completed.stdout)
    streams = data.get("streams") or []
    if not streams:
        raise ValueError(f"{path.name} does not contain a video stream")
    return {
        "width": int(streams[0]["width"]),
        "height": int(streams[0]["height"]),
        "duration": round(float(data.get("format", {}).get("duration", 0)), 3),
    }


def optimize_video(source: Path) -> tuple[Path, Path, int, int, float]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required for videos. Install FFmpeg, then run sync again.")
    ASSETS.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".mp4", dir=ASSETS, delete=False) as handle:
        temporary_video = Path(handle.name)
    temporary_video.unlink()
    temporary_poster = temporary_video.with_suffix(".jpg")
    try:
        subprocess.run(
            [
                ffmpeg, "-y", "-v", "error", "-i", str(source),
                "-map", "0:v:0", "-map", "0:a?",
                "-vf", "scale=1920:1920:force_original_aspect_ratio=decrease:force_divisible_by=2:in_range=full:out_range=tv,format=yuv420p",
                "-c:v", "libx264", "-preset", "medium", "-crf", "24",
                "-pix_fmt", "yuv420p", "-color_range", "tv",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart", str(temporary_video),
            ],
            check=True,
        )
        details = video_probe(temporary_video)
        poster_time = min(max(details["duration"] * 0.2, 0.1), 8.0)
        subprocess.run(
            [
                ffmpeg, "-y", "-v", "error", "-ss", f"{poster_time:.3f}",
                "-i", str(temporary_video), "-frames:v", "1",
                "-vf", "scale=1600:1600:force_original_aspect_ratio=decrease:force_divisible_by=2",
                "-q:v", "3", str(temporary_poster),
            ],
            check=True,
        )
        digest = hashlib.sha256(temporary_video.read_bytes()).hexdigest()[:10]
        stem = f"{slug(source.stem)}-{digest}"
        destination = ASSETS / f"{stem}.mp4"
        poster = ASSETS / f"{stem}-poster.jpg"
        if destination.exists():
            temporary_video.unlink()
        else:
            temporary_video.replace(destination)
        if poster.exists():
            temporary_poster.unlink()
        else:
            temporary_poster.replace(poster)
    except Exception:
        temporary_video.unlink(missing_ok=True)
        temporary_poster.unlink(missing_ok=True)
        raise
    return destination, poster, details["width"], details["height"], details["duration"]


def load_manifest() -> list[dict]:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("photos.json must contain a JSON array")
    return data


def render_entry(photo: dict, index: int) -> str:
    attributes = []
    if photo.get("title"):
        attributes.append(f'data-title="{html.escape(photo["title"], quote=True)}"')
    if photo.get("description"):
        attributes.append(f'data-caption="{html.escape(photo["description"], quote=True)}"')
    attrs = (" " + " ".join(attributes)) if attributes else ""
    media_type = photo.get("type", "image")
    file = html.escape(photo["file"], quote=True)
    alt = html.escape(photo["alt"], quote=True)
    eager = ' loading="eager" decoding="async" fetchpriority="high"' if index == 0 else ' loading="lazy" decoding="async"'
    if media_type == "video":
        poster = html.escape(photo["poster"], quote=True)
        attrs = f' data-type="video" data-video="{file}" data-poster="{poster}"' + attrs
        return (
            f'\t\t\t<li class="photo video"{attrs}>\n'
            f'\t\t\t\t<a href="{file}" aria-label="Open video {index + 1}: {alt}">\n'
            f'\t\t\t\t\t<img class="gallery-media" src="{poster}" alt="{alt}" width="{photo["width"]}" height="{photo["height"]}"{eager} draggable="false">\n'
            f'\t\t\t\t\t<span class="play-badge" aria-hidden="true"></span>\n'
            f'\t\t\t\t</a>\n'
            f'\t\t\t</li>'
        )
    return (
        f'\t\t\t<li class="photo"{attrs}>\n'
        f'\t\t\t\t<a href="{file}" aria-label="Open photo {index + 1}: {alt}">\n'
        f'\t\t\t\t\t<img class="gallery-media" src="{file}" alt="{alt}" width="{photo["width"]}" height="{photo["height"]}"{eager} draggable="false">\n'
        f'\t\t\t\t</a>\n'
        f'\t\t\t</li>'
    )


def write_gallery(manifest: list[dict]) -> None:
    document = GALLERY.read_text(encoding="utf-8")
    if START not in document or END not in document:
        raise ValueError(f"{GALLERY.name} is missing its generated photo markers")
    before, remainder = document.split(START, 1)
    _, after = remainder.split(END, 1)
    entries = "\n".join(render_entry(photo, index) for index, photo in enumerate(manifest))
    GALLERY.write_text(f"{before}{START}\n{entries}\n\t\t\t{END}{after}", encoding="utf-8")


def sync(inbox: Path) -> list[str]:
    manifest = load_manifest()
    by_source = {photo.get("source"): photo for photo in manifest if photo.get("source")}
    added = []
    for source in sorted(inbox.iterdir() if inbox.exists() else []):
        media_type = "video" if source.suffix.lower() in VIDEO_EXTENSIONS else "image"
        if not source.is_file() or source.suffix.lower() not in MEDIA_EXTENSIONS:
            continue
        metadata = embedded_metadata(source)
        metadata.update({key: value for key, value in sidecar_metadata(source).items() if value not in (None, "")})
        source_fingerprint = hashlib.sha256(source.read_bytes()).hexdigest()
        photo = by_source.get(source.name)
        reusable = (
            photo is not None
            and photo.get("source_fingerprint") == source_fingerprint
            and (ROOT / photo["file"]).exists()
            and (media_type == "image" or (ROOT / photo.get("poster", "")).is_file())
            and (media_type == "image" or photo.get("processor_version") == VIDEO_PROCESSOR_VERSION)
        )
        if reusable:
            destination = ROOT / photo["file"]
            width, height = photo["width"], photo["height"]
            poster = ROOT / photo["poster"] if media_type == "video" else None
            duration = photo.get("duration")
        elif media_type == "video":
            destination, poster, width, height, duration = optimize_video(source)
        else:
            destination, width, height = optimize_image(source)
            poster = None
            duration = None
        relative = destination.relative_to(ROOT).as_posix()
        title = clean_text(metadata.get("title"))
        description = clean_text(metadata.get("description"))
        alt = clean_text(metadata.get("alt")) or description or title or source.stem.replace("_", " ").replace("-", " ")
        if photo is None:
            photo = {}
            manifest.insert(0, photo)
            by_source[source.name] = photo
            added.append(source.name)
        photo.update({
            "type": media_type,
            "file": relative,
            "width": width,
            "height": height,
            "alt": alt,
            "title": title,
            "description": description,
            "instagram_caption": clean_text(metadata.get("instagram_caption")),
            "share_instagram": bool(metadata.get("share_instagram", media_type == "image")),
            "source": source.name,
            "source_fingerprint": source_fingerprint,
            "added_at": photo.get("added_at") or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })
        if media_type == "video":
            photo["poster"] = poster.relative_to(ROOT).as_posix()
            photo["duration"] = duration
            photo["processor_version"] = VIDEO_PROCESSOR_VERSION
        else:
            photo.pop("poster", None)
            photo.pop("duration", None)
            photo.pop("processor_version", None)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_gallery(manifest)
    print(f"Gallery ready: {len(manifest)} items" + (f"; added {', '.join(added)}" if added else ""))
    return added


def run_git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, check=check, text=True)


def publish_github(added: list[str]) -> bool:
    paths = ["assets/photos", "photos.json", "photos.html"]
    run_git("add", "--", *paths)
    changed = run_git("diff", "--cached", "--quiet", "--", *paths, check=False).returncode != 0
    if not changed:
        print("Nothing new to publish.")
        return False
    if len(added) == 1:
        subject = f"Add gallery item: {added[0]}"
    elif added:
        subject = f"Update gallery ({len(added)} new)"
    else:
        subject = "Update photo gallery"
    run_git("commit", "-m", subject, "--", *paths)
    run_git("push", "origin", "HEAD")
    return True


def publish_instagram_assets(approved: list[tuple[dict, dict]]) -> None:
    paths = sorted({draft["rendered_file"] for _, draft in approved})
    run_git("add", "--", *paths)
    changed = run_git("diff", "--cached", "--quiet", "--", *paths, check=False).returncode != 0
    if changed:
        subject = "Prepare approved Instagram media" if len(paths) > 1 else f"Prepare Instagram media: {Path(paths[0]).name}"
        run_git("commit", "-m", subject, "--", *paths)
    run_git("push", "origin", "HEAD")


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def json_request(url: str, data: dict[str, str]) -> dict:
    request = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Instagram API returned {error.code}: {detail}") from error


def wait_until_public(url: str, timeout: int = 300) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            request = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status < 400:
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(10)
    raise TimeoutError(f"GitHub Pages did not expose {url} within {timeout} seconds")


def publish_instagram() -> None:
    from instagram_review import approved_drafts, mark_published

    load_env_file(ROOT / ".env.instagram")
    user_id = os.environ.get("INSTAGRAM_USER_ID")
    token = os.environ.get("INSTAGRAM_ACCESS_TOKEN")
    if not user_id or not token:
        raise RuntimeError("Set INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN in .env.instagram")
    version = os.environ.get("INSTAGRAM_API_VERSION", "v25.0")
    host = os.environ.get("INSTAGRAM_GRAPH_HOST", "https://graph.instagram.com").rstrip("/")
    site = os.environ.get("SITE_URL", "https://ninad.in").rstrip("/")
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    approved = approved_drafts()
    if not approved:
        print("No approved Instagram drafts to publish. Open the review dashboard first.")
        return
    publishable = [(photo, draft) for photo, draft in approved if draft.get("format") != "story"]
    story_count = len(approved) - len(publishable)
    if story_count:
        print(f"Skipping {story_count} approved Story draft(s); Story API publishing is not enabled yet.")
    if not publishable:
        return
    publish_instagram_assets(publishable)
    for photo, draft in reversed(publishable):
        file = draft["rendered_file"]
        if file in state:
            continue
        media_url = f"{site}/{file}"
        wait_until_public(media_url)
        caption = draft["caption"]
        if photo.get("type", "image") == "video":
            created = json_request(f"{host}/{version}/{user_id}/media", {
                "media_type": "REELS",
                "video_url": media_url,
                "caption": caption,
                "share_to_feed": "true",
                "access_token": token,
            })
            deadline = time.time() + 300
            while time.time() < deadline:
                status_url = f"{host}/{version}/{created['id']}?" + urllib.parse.urlencode({
                    "fields": "status_code,status",
                    "access_token": token,
                })
                with urllib.request.urlopen(status_url, timeout=30) as response:
                    container = json.load(response)
                if container.get("status_code") == "FINISHED":
                    break
                if container.get("status_code") in {"ERROR", "EXPIRED"}:
                    raise RuntimeError(f"Instagram could not process the Reel: {container.get('status')}")
                time.sleep(5)
            else:
                raise TimeoutError("Instagram did not finish processing the Reel within 5 minutes")
        else:
            created = json_request(f"{host}/{version}/{user_id}/media", {
                "image_url": media_url,
                "caption": caption,
                "access_token": token,
            })
        media = json_request(f"{host}/{version}/{user_id}/media_publish", {
            "creation_id": created["id"],
            "access_token": token,
        })
        state[file] = {"media_id": media["id"], "posted_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        STATE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        mark_published(photo, media["id"])
        print(f"Posted {file} to Instagram as {media['id']}")


def fingerprint(inbox: Path) -> tuple:
    if not inbox.exists():
        return ()
    return tuple(sorted((item.name, item.stat().st_size, item.stat().st_mtime_ns) for item in inbox.iterdir() if item.is_file()))


def watch(inbox: Path, should_publish: bool, instagram: bool) -> None:
    print(f"Watching {inbox}. Press Ctrl-C to stop.")
    observed = None
    processed = None
    stable_polls = 0
    while True:
        current = fingerprint(inbox)
        if current != observed:
            observed = current
            stable_polls = 0
        else:
            stable_polls += 1
            if current and stable_polls >= 1 and current != processed:
                try:
                    added = sync(inbox)
                    if should_publish:
                        publish_github(added)
                    if instagram:
                        publish_instagram()
                    processed = fingerprint(inbox)
                except Exception as error:
                    print(f"Publish failed: {error}", file=sys.stderr)
                    processed = current
        time.sleep(3)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("sync", "publish", "watch", "review", "instagram"))
    parser.add_argument("--inbox", type=Path, default=DEFAULT_INBOX)
    parser.add_argument("--publish", action="store_true", help="commit and push changes while watching")
    parser.add_argument("--instagram", action="store_true", help="post eligible new photos after GitHub publishing")
    parser.add_argument("--port", type=int, default=8765, help="local port for the Instagram review dashboard")
    args = parser.parse_args()
    if args.command == "sync":
        sync(args.inbox)
    elif args.command == "publish":
        added = sync(args.inbox)
        publish_github(added)
        if args.instagram:
            publish_instagram()
    elif args.command == "instagram":
        publish_instagram()
    elif args.command == "review":
        from instagram_review import serve
        serve("127.0.0.1", args.port, False)
    else:
        try:
            watch(args.inbox, args.publish, args.instagram)
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
