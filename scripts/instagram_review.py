#!/usr/bin/env python3
"""Local review dashboard for preparing Instagram gallery posts."""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
import secrets
import sys
import urllib.parse
import webbrowser
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "photos.json"
STATE = ROOT / ".instagram-review-state.json"
UI = ROOT / "tools" / "instagram-review"
INSTAGRAM_ASSETS = ROOT / "assets" / "instagram"

IMAGE_FORMATS = {
    "feed_portrait": {"label": "Feed · 4:5", "size": (1080, 1350)},
    "feed_square": {"label": "Feed · 1:1", "size": (1080, 1080)},
    "story": {"label": "Story · 9:16 · prepare only", "size": (1080, 1920)},
}
VIDEO_FORMATS = {
    "reel": {"label": "Reel · original video"},
}


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not read {path.name}: {error}") from error


def write_json(path: Path, value) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def manifest_items() -> list[dict]:
    value = read_json(MANIFEST, [])
    if not isinstance(value, list):
        raise ValueError("photos.json must contain an array")
    return value


def item_id(item: dict) -> str:
    return hashlib.sha256(item["file"].encode()).hexdigest()[:16]


def find_item(identifier: str) -> dict:
    for item in manifest_items():
        if item_id(item) == identifier:
            return item
    raise KeyError("Gallery item not found")


def default_caption(item: dict) -> str:
    base = (
        item.get("instagram_caption")
        or item.get("description")
        or item.get("title")
        or item.get("alt")
        or ""
    )
    site = "https://ninad.in"
    env_file = ROOT / ".env.instagram"
    if env_file.exists():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            if raw.strip().startswith("SITE_URL="):
                site = raw.split("=", 1)[1].strip().strip("'\"").rstrip("/") or site
                break
    call_to_action = f"More photographs: {site}/photos.html"
    return f"{base}\n\n{call_to_action}" if base else call_to_action


def state_document() -> dict:
    value = read_json(STATE, {"version": 1, "drafts": {}})
    if not isinstance(value, dict) or not isinstance(value.get("drafts"), dict):
        raise ValueError(f"{STATE.name} has an invalid structure")
    value.setdefault("version", 1)
    return value


def default_draft(item: dict) -> dict:
    media_type = item.get("type", "image")
    return {
        "caption": default_caption(item),
        "alt": item.get("alt", ""),
        "format": "reel" if media_type == "video" else "feed_portrait",
        "focal_x": 50,
        "focal_y": 50,
        "status": "draft",
    }


def draft_for(item: dict, state: dict | None = None) -> dict:
    state = state or state_document()
    stored = state["drafts"].get(item_id(item), {})
    draft = default_draft(item)
    draft.update(stored)
    return draft


def public_item(item: dict, state: dict) -> dict:
    identifier = item_id(item)
    draft = draft_for(item, state)
    media_type = item.get("type", "image")
    preview_file = draft.get("rendered_file") if draft.get("status") in {"approved", "published"} else item["file"]
    preview_path = ROOT / preview_file
    if not preview_path.is_file():
        preview_file = item["file"]
    return {
        "id": identifier,
        "type": media_type,
        "file": item["file"],
        "source": item.get("source") or Path(item["file"]).name,
        "title": item.get("title", ""),
        "description": item.get("description", ""),
        "width": item.get("width"),
        "height": item.get("height"),
        "duration": item.get("duration"),
        "preview_url": f"/media/{urllib.parse.quote(preview_file, safe='')}",
        "original_url": f"/media/{urllib.parse.quote(item['file'], safe='')}",
        "poster_url": f"/media/{urllib.parse.quote(item.get('poster', item['file']), safe='')}",
        "formats": VIDEO_FORMATS if media_type == "video" else IMAGE_FORMATS,
        "draft": draft,
    }


def clean_draft_input(item: dict, payload: dict) -> dict:
    media_type = item.get("type", "image")
    valid_formats = VIDEO_FORMATS if media_type == "video" else IMAGE_FORMATS
    selected_format = str(payload.get("format", ""))
    if selected_format not in valid_formats:
        raise ValueError("Unsupported Instagram format")
    caption = str(payload.get("caption", "")).strip()
    alt = str(payload.get("alt", "")).strip()
    if len(caption) > 2200:
        raise ValueError("Instagram captions can contain at most 2,200 characters")
    if len(alt) > 1000:
        raise ValueError("Alt text can contain at most 1,000 characters")
    try:
        focal_x = max(0, min(100, int(payload.get("focal_x", 50))))
        focal_y = max(0, min(100, int(payload.get("focal_y", 50))))
    except (TypeError, ValueError) as error:
        raise ValueError("Focal point must be between 0 and 100") from error
    return {
        "caption": caption,
        "alt": alt,
        "format": selected_format,
        "focal_x": focal_x,
        "focal_y": focal_y,
    }


def save_draft(identifier: str, payload: dict) -> dict:
    item = find_item(identifier)
    clean = clean_draft_input(item, payload)
    state = state_document()
    previous = draft_for(item, state)
    changed = any(previous.get(key) != value for key, value in clean.items())
    stored = {**previous, **clean}
    if changed:
        stored.update({"status": "draft"})
        for key in ("approval_hash", "approved_at", "rendered_file"):
            stored.pop(key, None)
    stored["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    state["drafts"][identifier] = stored
    write_json(STATE, state)
    return public_item(item, state)


def crop_image(item: dict, draft: dict) -> Path:
    source = ROOT / item["file"]
    target_size = IMAGE_FORMATS[draft["format"]]["size"]
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        rendered = ImageOps.fit(
            image,
            target_size,
            method=Image.Resampling.LANCZOS,
            centering=(draft["focal_x"] / 100, draft["focal_y"] / 100),
        )
        signature = hashlib.sha256()
        signature.update(source.read_bytes())
        signature.update(json.dumps({key: draft[key] for key in ("format", "focal_x", "focal_y")}, sort_keys=True).encode())
        digest = signature.hexdigest()[:10]
        destination = INSTAGRAM_ASSETS / f"{source.stem}-{draft['format']}-{digest}.jpg"
        INSTAGRAM_ASSETS.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            rendered.save(destination, "JPEG", quality=92, optimize=True, progressive=True)
    return destination


def approval_hash(item: dict, draft: dict, rendered_file: str) -> str:
    digest = hashlib.sha256()
    digest.update((ROOT / rendered_file).read_bytes())
    digest.update(json.dumps({
        "caption": draft["caption"],
        "alt": draft["alt"],
        "format": draft["format"],
    }, sort_keys=True, ensure_ascii=False).encode())
    return digest.hexdigest()


def approve_draft(identifier: str, payload: dict) -> dict:
    item = find_item(identifier)
    clean = clean_draft_input(item, payload)
    state = state_document()
    draft = {**draft_for(item, state), **clean}
    if item.get("type", "image") == "image":
        rendered = crop_image(item, draft)
    else:
        rendered = ROOT / item["file"]
    relative = rendered.relative_to(ROOT).as_posix()
    draft.update({
        "status": "approved",
        "rendered_file": relative,
        "approval_hash": approval_hash(item, draft, relative),
        "approved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    state["drafts"][identifier] = draft
    write_json(STATE, state)
    return public_item(item, state)


def verify_approval(item: dict, draft: dict) -> bool:
    rendered_file = draft.get("rendered_file", "")
    rendered = ROOT / rendered_file
    if draft.get("status") != "approved" or not rendered.is_file():
        return False
    return secrets.compare_digest(draft.get("approval_hash", ""), approval_hash(item, draft, rendered_file))


def approved_drafts() -> list[tuple[dict, dict]]:
    state = state_document()
    approved = []
    for item in manifest_items():
        draft = draft_for(item, state)
        if verify_approval(item, draft):
            approved.append((item, draft))
    return approved


def mark_published(item: dict, media_id: str) -> None:
    state = state_document()
    identifier = item_id(item)
    draft = draft_for(item, state)
    draft.update({
        "status": "published",
        "media_id": media_id,
        "published_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    state["drafts"][identifier] = draft
    write_json(STATE, state)


class ReviewHandler(BaseHTTPRequestHandler):
    server_version = "InstagramReview/1.0"

    def log_message(self, message: str, *args) -> None:
        sys.stderr.write("review: " + message % args + "\n")

    def send_json(self, value, status=HTTPStatus.OK) -> None:
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path: Path, content_type: str | None = None) -> None:
        if not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        size = path.stat().st_size
        start, end = 0, size - 1
        range_header = self.headers.get("Range", "")
        range_match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header)
        partial = bool(range_match)
        if range_match:
            if range_match.group(1):
                start = int(range_match.group(1))
                end = int(range_match.group(2)) if range_match.group(2) else end
            elif range_match.group(2):
                start = max(0, size - int(range_match.group(2)))
            end = min(end, size - 1)
            if start > end:
                self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                return
        length = end - start + 1
        self.send_response(HTTPStatus.PARTIAL_CONTENT if partial else HTTPStatus.OK)
        self.send_header("Content-Type", content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            with path.open("rb") as handle:
                handle.seek(start)
                remaining = length
                while remaining:
                    chunk = handle.read(min(64 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def valid_mutation(self) -> bool:
        expected_origin = f"http://{self.server.server_address[0]}:{self.server.server_address[1]}"
        return (
            self.headers.get("Origin") == expected_origin
            and secrets.compare_digest(self.headers.get("X-Review-Token", ""), self.server.review_token)
        )

    def read_payload(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 32_000:
            raise ValueError("Request is too large")
        value = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(value, dict):
            raise ValueError("Expected a JSON object")
        return value

    def do_GET(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path == "/":
            template = (UI / "index.html").read_text(encoding="utf-8")
            body = template.replace("__REVIEW_TOKEN__", self.server.review_token).encode()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/app.css":
            self.send_file(UI / "app.css", "text/css; charset=utf-8")
            return
        if path == "/app.js":
            self.send_file(UI / "app.js", "text/javascript; charset=utf-8")
            return
        if path == "/api/items":
            state = state_document()
            self.send_json({"items": [public_item(item, state) for item in manifest_items()]})
            return
        if path.startswith("/media/"):
            requested = urllib.parse.unquote(path.removeprefix("/media/"))
            allowed = {item["file"] for item in manifest_items()}
            allowed.update(item["poster"] for item in manifest_items() if item.get("poster"))
            allowed.update(
                draft.get("rendered_file")
                for draft in state_document()["drafts"].values()
                if draft.get("rendered_file")
            )
            if requested not in allowed:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            self.send_file(ROOT / requested)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        if not self.valid_mutation():
            self.send_json({"error": "Invalid local review session"}, HTTPStatus.FORBIDDEN)
            return
        path = urllib.parse.urlparse(self.path).path
        match = re.fullmatch(r"/api/items/([a-f0-9]{16})/(save|approve)", path)
        if not match:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            payload = self.read_payload()
            result = save_draft(match.group(1), payload) if match.group(2) == "save" else approve_draft(match.group(1), payload)
            self.send_json({"item": result})
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except Exception as error:
            self.send_json({"error": f"Could not update draft: {error}"}, HTTPStatus.INTERNAL_SERVER_ERROR)


def serve(host: str, port: int, should_open: bool) -> None:
    if host not in {"127.0.0.1", "localhost"}:
        raise ValueError("The review server may only bind to localhost")
    server = ThreadingHTTPServer((host, port), ReviewHandler)
    server.review_token = secrets.token_urlsafe(32)
    url = f"http://{server.server_address[0]}:{server.server_address[1]}/"
    print(f"Instagram review: {url}", flush=True)
    print("Press Ctrl-C to stop.", flush=True)
    if should_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="open the review page in the default browser")
    args = parser.parse_args()
    serve(args.host, args.port, args.open)


if __name__ == "__main__":
    main()
