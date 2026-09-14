# Photo inbox

Drop JPEG/PNG images or MOV/MP4/M4V videos into this directory. The contents are
ignored by Git; processed web media is written to `assets/photos/`. Videos are
converted to browser-friendly H.264/AAC MP4 files and receive a JPEG poster.

Add the title and description before dropping the image by embedding standard
metadata:

- title: EXIF `XPTitle`, IPTC Object Name, or XMP title
- note: EXIF `ImageDescription`/`XPComment`, IPTC Caption, or XMP description

ExifTool is the most reliable way to embed it:

```sh
exiftool -overwrite_original \
  -XMP-dc:Title="Towards the light" \
  -XMP-dc:Description="A quiet evening at the edge of the city." \
  -IPTC:ObjectName="Towards the light" \
  -IPTC:Caption-Abstract="A quiet evening at the edge of the city." \
  photo.jpg
```

The easier option is a same-named JSON sidecar. For `photo.jpg`, create
`photo.json` using `photo-name.json.example` as a template. The same pattern
works for videos: `clip.mov` uses `clip.json`. Sidecar values override embedded
metadata.

Start the watcher from the repository root:

```sh
python3 scripts/photos.py watch --publish
```

Add `--instagram` after Instagram has been configured locally.
