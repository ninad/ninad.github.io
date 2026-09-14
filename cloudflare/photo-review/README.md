# Cloud photo review

This Cloudflare Worker is the private review desk for `ninad.in/photos.html`.
It accepts browser uploads, stores originals and approved variants in R2, keeps
draft and publishing state in D1, and publishes an approved version separately
to the website feed and Instagram.

## Cloud resources

- Worker: `ninad-photo-review`
- D1: `ninad-photo-review` (`1e6dbc6d-a283-461c-a836-9ddd9d58948c`)
- R2: `ninad-photo-media`
- Administrator: `ninad@raval.in` through Cloudflare Access

The D1 database was created in Cloudflare's APAC region. R2 must be enabled once
from the Cloudflare dashboard before the bucket can be created.

## Development

```sh
npm ci
npx wrangler d1 migrations apply ninad-photo-review --remote
npm run types
npm run check
npm run dev
```

The production Instagram token is a Worker secret and must never be committed:

```sh
npx wrangler secret put INSTAGRAM_ACCESS_TOKEN
```

The Worker accepts JPEG, PNG, WebP, and MP4 uploads under 95 MB. Crop rendering
happens in the browser at Instagram's exact output size. Approved media is
immutable; any edit returns an unpublished version to Draft. Items already
published to either destination are locked so a published asset cannot silently
change.

`/gallery.json` and `/media/:id` are public because the website and Meta must be
able to fetch them. The dashboard and `/api/*` require the Access identity header
for `ninad@raval.in`.

The small browser interface lives in `tools/cloud-photo-review/` with the other
static site tools. The Worker proxies those files through its protected origin;
all media and review data stay behind the Worker API.
