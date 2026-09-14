# Photo inbox

Drop JPEG or PNG files into this directory. The contents are ignored by Git;
processed web images are written to `assets/photos/`.

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
`photo.json` using `photo-name.json.example` as a template. Sidecar values
override embedded metadata.

Start the watcher from the repository root:

```sh
python3 scripts/photos.py watch --publish
```

Add `--instagram` after Instagram has been configured locally.
