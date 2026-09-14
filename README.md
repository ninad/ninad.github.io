# ninad.github.io 

Hello world, this is a collection of my thoughts and bookmarks, versioned and published. 

## Photo gallery

`photos.html` is a static gallery adapted from `gallery-template`, with the site's
Lora typography and dotted paper background. The homepage links to it under Projects.

- `photos.json` is the source of truth. `scripts/photos.py` generates the marked
  photo list in `photos.html`; do not edit that generated block directly.
- Drop JPEG/PNG images or MOV/MP4/M4V videos in the ignored `photo-inbox/`
  directory. Embedded metadata or a same-named JSON sidecar supplies the title,
  expanded note, alt text, and optional Instagram caption.
- Run `python3 scripts/photos.py sync` to process locally, `publish` to commit and
  push, or `watch --publish` to process new drops automatically.
- `photos.css` keeps the gallery full screen with the dotted background and one
  back link. `photos.js` restores the template's smooth horizontal track, elastic
  gestures, shared-image expansion/collapse, and circular mouse cursor.
- Click or tap a photo or video poster to enlarge it. Expanded videos use native
  playback controls. Click or tap the canvas to collapse; Escape and the back
  link also return to the gallery.
- Swipe, drag, or scroll horizontally to browse in either view. Vertical swipes
  and vertical scrolling do not change the gallery or open/close photos.
- Motion follows the spring and drag-decay settings on mikematas.com: direct
  dragging with momentum, velocity-aware paging, and click-triggered expansion.
  Spring integration uses elapsed time for consistent motion across refresh rates.
- Keyboard: Tab to a photo, Enter/Space to enlarge, arrows or Home/End to navigate.
  The back link returns to the homepage when the gallery is already collapsed.
- Reduced motion skips animated transitions and elastic effects. The custom
  cursor only appears for a fine mouse pointer, and animation loops stop at rest.
- Without JavaScript, the image links and native scrolling still work.

Preview the site with `python3 -m http.server 8000`, then open
`http://localhost:8000/photos.html`. See `PHOTO_WORKFLOW.md` for metadata,
automatic GitHub publishing, and the optional Instagram stage.
