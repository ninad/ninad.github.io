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


def optimize(source: Path) -> tuple[Path, int, int]:
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
    file = html.escape(photo["file"], quote=True)
    alt = html.escape(photo["alt"], quote=True)
    eager = ' loading="eager" decoding="async" fetchpriority="high"' if index == 0 else ' loading="lazy" decoding="async"'
    return (
        f'\t\t\t<li class="photo"{attrs}>\n'
        f'\t\t\t\t<a href="{file}" aria-label="Open photo {index + 1}: {alt}">\n'
        f'\t\t\t\t\t<img src="{file}" alt="{alt}" width="{photo["width"]}" height="{photo["height"]}"{eager} draggable="false">\n'
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
        if not source.is_file() or source.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        metadata = embedded_metadata(source)
        metadata.update({key: value for key, value in sidecar_metadata(source).items() if value not in (None, "")})
        destination, width, height = optimize(source)
        relative = destination.relative_to(ROOT).as_posix()
        title = clean_text(metadata.get("title"))
        description = clean_text(metadata.get("description"))
        alt = clean_text(metadata.get("alt")) or description or title or source.stem.replace("_", " ").replace("-", " ")
        photo = by_source.get(source.name)
        if photo is None:
            photo = {}
            manifest.insert(0, photo)
            by_source[source.name] = photo
            added.append(source.name)
        photo.update({
            "file": relative,
            "width": width,
            "height": height,
            "alt": alt,
            "title": title,
            "description": description,
            "instagram_caption": clean_text(metadata.get("instagram_caption")),
            "share_instagram": bool(metadata.get("share_instagram", True)),
            "source": source.name,
            "added_at": photo.get("added_at") or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_gallery(manifest)
    print(f"Gallery ready: {len(manifest)} photos" + (f"; added {', '.join(added)}" if added else ""))
    return added


def run_git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, check=check, text=True)


def publish_github(added: list[str]) -> bool:
    paths = ("assets/photos", "photos.json", "photos.html")
    run_git("add", "--", *paths)
    changed = run_git("diff", "--cached", "--quiet", "--", *paths, check=False).returncode != 0
    if not changed:
        print("Nothing new to publish.")
        return False
    if len(added) == 1:
        subject = f"Add photo: {added[0]}"
    elif added:
        subject = f"Update photo gallery ({len(added)} new)"
    else:
        subject = "Update photo gallery"
    run_git("commit", "-m", subject, "--", *paths)
    run_git("push", "origin", "HEAD")
    return True


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
    load_env_file(ROOT / ".env.instagram")
    user_id = os.environ.get("INSTAGRAM_USER_ID")
    token = os.environ.get("INSTAGRAM_ACCESS_TOKEN")
    if not user_id or not token:
        raise RuntimeError("Set INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN in .env.instagram")
    version = os.environ.get("INSTAGRAM_API_VERSION", "v25.0")
    host = os.environ.get("INSTAGRAM_GRAPH_HOST", "https://graph.instagram.com").rstrip("/")
    site = os.environ.get("SITE_URL", "https://ninad.in").rstrip("/")
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    manifest = load_manifest()
    for photo in reversed(manifest):
        file = photo["file"]
        if not photo.get("share_instagram") or file in state:
            continue
        image_url = f"{site}/{file}"
        wait_until_public(image_url)
        caption = photo.get("instagram_caption") or photo.get("description") or photo.get("title") or photo.get("alt")
        caption = f"{caption}\n\nMore photographs: {site}/photos.html"
        created = json_request(f"{host}/{version}/{user_id}/media", {
            "image_url": image_url,
            "caption": caption,
            "access_token": token,
        })
        media = json_request(f"{host}/{version}/{user_id}/media_publish", {
            "creation_id": created["id"],
            "access_token": token,
        })
        state[file] = {"media_id": media["id"], "posted_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        STATE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
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
    parser.add_argument("command", choices=("sync", "publish", "watch", "instagram"))
    parser.add_argument("--inbox", type=Path, default=DEFAULT_INBOX)
    parser.add_argument("--publish", action="store_true", help="commit and push changes while watching")
    parser.add_argument("--instagram", action="store_true", help="post eligible new photos after GitHub publishing")
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
    else:
        try:
            watch(args.inbox, args.publish, args.instagram)
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
