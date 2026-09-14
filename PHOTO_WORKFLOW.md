# Photo publishing workflow

This repository includes a local photo inbox and publisher. It keeps the
website static: optimized images are committed to GitHub and `photos.html` is
generated from `photos.json`.

## One-time setup

Install the image dependency:

```sh
python3 -m pip install -r requirements-photos.txt
```

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

For a simpler, fully visible format, put `photo.json` beside `photo.jpg`:

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

The publisher resizes new images to at most 2400 pixels, converts them to an
optimized progressive JPEG, prepends them to `photos.json`, and regenerates the
marked section of `photos.html`.

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

After configuration, publish to GitHub and Instagram together:

```sh
python3 scripts/photos.py publish --instagram
```

Or keep both automated:

```sh
python3 scripts/photos.py watch --publish --instagram
```

Instagram fetches the image from its public GitHub Pages URL, so this stage runs
after the Git push and waits for the image to become reachable. Successful post
IDs are stored only in `.photo-publisher-state.json` to prevent duplicates.

Instagram feed-caption URLs are plain text rather than clickable links. Set the
Instagram profile website to `https://ninad.in/photos.html`; each generated
caption also ends with `More photographs: https://ninad.in/photos.html`.
