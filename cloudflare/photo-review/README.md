# Cloud photo review

The private review desk for [raval.in/photos.html](https://raval.in/photos.html). It accepts browser uploads, stores media in Cloudflare R2, keeps review state in D1, and publishes an approved version independently to the website and Instagram.

## Production

- Review desk: `https://ninad-photo-review.ninad-085.workers.dev/`
- Worker: `ninad-photo-review`
- D1 database: `ninad-photo-review` (`1e6dbc6d-a283-461c-a836-9ddd9d58948c`), APAC
- R2 bucket: `ninad-photo-media`, APAC, Standard storage
- Administrator: `ninad@raval.in` through Cloudflare Access
- Website feed: `https://ninad-photo-review.ninad-085.workers.dev/gallery.json`

The review desk currently uses its `workers.dev` address because `raval.in` is not managed in the connected Cloudflare account. This does not affect the `raval.in` website or its GitHub Pages custom domain.

## Everyday workflow

1. Open the review desk and complete Cloudflare Access sign-in.
2. Upload a JPEG, PNG, WebP, or MP4 file under 95 MB.
3. Choose Feed 4:5, Feed 1:1, Story 9:16, or Reel as applicable.
4. Adjust crop focus and edit the caption and visual description.
5. Select **Save draft**. Drafts remain private in R2.
6. Select **Approve exact version** after reviewing the crop and copy.
7. Select **Add to website** or **Post to Instagram**. Each destination is independent.

The website receives only items explicitly added to it. Instagram receives only items explicitly posted to it. The interface locks both controls while changes are unsaved and until the current version is approved.

## Supported publishing

| Media | Website | Instagram |
| --- | --- | --- |
| JPEG, PNG, WebP | Gallery image | Feed image or still-image Story |
| MP4 | Gallery video | Reel, shared to the feed |

Instagram captions end with `More photographs: https://raval.in/photos.html`. Instagram does not make feed-caption URLs clickable, so the profile website should point to the gallery.

## Architecture

The Worker serves the review interface from `tools/cloud-photo-review/`, handles authenticated API requests, and exposes two intentionally public routes:

- `GET /gallery.json` returns approved items added to the website.
- `GET /media/:id` returns an approved media object so the website and Meta can fetch it.

All `/api/*` routes and draft media require the Cloudflare Access identity header for `ninad@raval.in`. R2 stores originals and approved variants. D1 stores crop settings, copy, approval hashes, and destination publishing state. The Instagram token stays in the Worker secret store and is never returned to the browser.

## Development

Requirements: Node.js, npm, and access to the configured Cloudflare account.

```sh
cd cloudflare/photo-review
npm ci
npm run check
npm run dev
```

The local Worker uses the bindings in `wrangler.jsonc`. Add local-only values to `.dev.vars`; that file is ignored by Git.

## Deploy or restore

Apply the database migration before the first deployment:

```sh
cd cloudflare/photo-review
npx wrangler d1 migrations apply ninad-photo-review --remote
```

Store or rotate the Instagram credential through Wrangler. Never put its value in a tracked file:

```sh
npx wrangler secret put INSTAGRAM_ACCESS_TOKEN
```

Deploy the Worker:

```sh
npx wrangler deploy
```

The interface is part of GitHub Pages. Changes under `tools/cloud-photo-review/` go live after they are pushed to `master` and the `pages-build-deployment` workflow completes. The Worker caches these static files for up to five minutes.

## Verification

Run these checks after a deployment:

```sh
curl https://ninad-photo-review.ninad-085.workers.dev/health
curl https://ninad-photo-review.ninad-085.workers.dev/gallery.json
```

`/health` should return `{"ok":true,"storage":true}`. The dashboard root should redirect an unauthenticated browser to Cloudflare Access. After signing in, upload a disposable draft and confirm that both publishing buttons remain disabled until approval.

## Troubleshooting

- **Upload says storage is unavailable:** confirm the `MEDIA` binding points to `ninad-photo-media` and `/health` reports `storage: true`.
- **Dashboard cannot load:** confirm GitHub Pages has deployed `tools/cloud-photo-review/index.html`, `app.css`, and `app.js`.
- **Access rejects the account:** confirm the Access allow policy contains `ninad@raval.in`.
- **Instagram publishing fails:** verify the Worker secret, Instagram user ID, professional-account permissions, and token expiry. The error is stored on the item for review.
- **Website item is missing:** confirm it was approved and then added to the website; `/gallery.json` should contain it within about one minute.
- **A private-repository change breaks Pages:** restore repository visibility to public or activate GitHub Pro, then trigger a Pages rebuild. Keep the `CNAME` file and `raval.in` DNS records unchanged during recovery.
