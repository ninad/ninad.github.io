# Photo publishing workflow

This is the optional local workflow. For uploading while travelling and reviewing
from any device, use the Cloudflare review desk documented in
[`cloudflare/photo-review/README.md`](cloudflare/photo-review/README.md).

This repository includes a local photo inbox and publisher. It keeps the
website static: optimized images and videos are committed to GitHub and
`photos.html` is generated from `photos.json`.

## One-time setup

Install the image dependency:

```sh
python3 -m pip install -r requirements-photos.txt
```

Video processing also requires `ffmpeg` and `ffprobe` on your `PATH`. On macOS,
they are available together through `brew install ffmpeg`.

The default local drop folder is `photo-inbox/`. Its contents and publishing
state are ignored by Git.

## Add descriptions

The recommended embedded field is **XMP Description**. When ExifTool is
installed, the publisher reads it directly; its Pillow fallback reads EXIF
`ImageDescription`/`XPComment` and IPTC `Caption-Abstract`. It uses
the value as the note beneath the expanded image. XMP Title, EXIF `XPTitle`, or
IPTC Object Name becomes the optional title.

ExifTool is not currently installed on this Mac. If desired, install it with
`brew install exiftool`, then write metadata before dropping a photo:

```sh
exiftool -overwrite_original \
  -XMP-dc:Title="Towards the light" \
  -XMP-dc:Description="A quiet evening at the edge of the city." \
  -IPTC:ObjectName="Towards the light" \
  -IPTC:Caption-Abstract="A quiet evening at the edge of the city." \
  ~/Desktop/photo.jpg
```

For a simpler, fully visible format, put `photo.json` beside `photo.jpg`. A
video follows the same convention, so `clip.mov` uses `clip.json`:

```json
{
  "title": "Towards the light",
  "description": "A quiet evening at the edge of the city.",
  "alt": "A person walking through warm evening light",
  "instagram_caption": "A quiet evening at the edge of the city.",
  "share_instagram": true
}
```

The sidecar overrides embedded metadata. `alt` should describe what is visible,
while `description` can be a personal note.

## Preview and publish

Process everything currently in the inbox without publishing:

```sh
python3 scripts/photos.py sync
```

The publisher resizes new images to at most 2400 pixels and converts them to
optimized progressive JPEGs. MOV/MP4/M4V videos are converted to H.264/AAC MP4
at up to 1920 pixels and receive a JPEG poster frame. New media is prepended to
`photos.json`, then the marked section of `photos.html` is regenerated.

Commit and push only the generated gallery files:

```sh
python3 scripts/photos.py publish
```

Keep a watcher running so a stable file dropped into the inbox is processed and
pushed automatically:

```sh
python3 scripts/photos.py watch --publish
```

The source photo remains in the ignored inbox. A changed sidecar updates its
gallery title or note on the next run.

## Instagram publishing

Meta's publishing API works with Instagram Professional accounts (Business or
Creator). Copy `.env.instagram.example` to `.env.instagram` and add an Instagram
user ID and access token with the content-publishing permission. Tokens must
never be committed.

Open the local review dashboard:

```sh
python3 scripts/photos.py review
```

Then visit `http://127.0.0.1:8765/`. Select an item, choose its format, adjust
the crop focus, and edit the caption or visual description. **Save draft** keeps
the work local. **Approve** renders the exact Instagram JPEG and locks the
approval to a hash of that media and copy. Any later edit automatically returns
it to Draft.

The dashboard binds only to localhost. It never sends the Instagram access
token to the browser, and its review state stays in the ignored
`.instagram-review-state.json` file.

Publish only approved items:

```sh
python3 scripts/photos.py instagram
```

This commits and pushes the approved asset so Meta can fetch it, waits for the
public URL, and then creates the Instagram post. The final media ID is saved in
the local review state and `.photo-publisher-state.json`.

You can still publish the website and any already-approved Instagram items in
one command:

```sh
python3 scripts/photos.py publish --instagram
```

Or keep both automated:

```sh
python3 scripts/photos.py watch --publish --instagram
```

Feed photos and Reels are supported by the publisher. Still-image Stories can
be prepared and approved in the dashboard; their API publishing step is not yet
enabled. The publisher fetches media from its public GitHub Pages URL, so it
waits for the approved asset to become reachable. Successful post IDs are
stored locally to prevent duplicates.

Instagram feed-caption URLs are plain text rather than clickable links. Set the
Instagram profile website to `https://raval.in/photos.html`; each generated
caption also ends with `More photographs: https://raval.in/photos.html`.
