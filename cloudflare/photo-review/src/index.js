import { cleanText, clampFocus, extensionFor, formatFor, publicItem, sha256Hex } from './core.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};
const UI_ORIGIN = 'https://raval.in/tools/cloud-photo-review';

/** @param {unknown} value */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

/** @param {string} path */
async function uiAsset(path) {
  const filename = path === '/' ? 'index.html' : path.slice(1);
  const response = await fetch(`${UI_ORIGIN}/${filename}`);
  if (!response.ok) return json({ error: 'Review interface is still deploying' }, 503);
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'public, max-age=300');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

/** @param {Request} request @param {Env} env */
function authorized(request, env) {
  const email = request.headers.get('cf-access-authenticated-user-email');
  return Boolean(email && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
}

/** @param {Request} request */
async function form(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('multipart/form-data')) throw new Error('Expected a media upload');
  return request.formData();
}

/** @param {D1Database} db @param {string} id */
async function getRow(db, id) {
  const row = await db.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
  if (!row) throw new Response('Not found', { status: 404 });
  return row;
}

/** @param {Env} env */
function requireStorage(env) {
  if (!env.MEDIA) throw new Response(JSON.stringify({ error: 'R2 storage is not enabled yet' }), { status: 503, headers: JSON_HEADERS });
  return env.MEDIA;
}

/** @param {FormData | Record<string, unknown>} input @param {string} mediaType */
function draftValues(input, mediaType) {
  /** @param {string} key */
  const get = key => input instanceof FormData ? input.get(key) : input[key];
  return {
    format: formatFor(mediaType, String(get('format') || (mediaType === 'video' ? 'reel' : 'feed_portrait'))),
    caption: cleanText(get('caption'), 2200),
    alt: cleanText(get('alt'), 1000),
    focalX: clampFocus(get('focal_x')),
    focalY: clampFocus(get('focal_y')),
  };
}

/** @param {Request} request @param {Env} env @param {string} origin */
async function listItems(request, env, origin) {
  const result = await env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
  return json({ items: result.results.map(row => publicItem(row, origin)), storage: Boolean(env.MEDIA), identity: request.headers.get('cf-access-authenticated-user-email') });
}

/** @param {Request} request @param {Env} env @param {string} origin */
async function createItem(request, env, origin) {
  const bucket = requireStorage(env);
  const data = await form(request);
  const file = data.get('media');
  if (!(file instanceof File) || file.size === 0) return json({ error: 'Choose a media file' }, 400);
  const extension = extensionFor(file.type);
  if (!extension) return json({ error: 'Use JPEG, PNG, WebP, or an MP4 video' }, 415);
  if (file.size > 95_000_000) return json({ error: 'Keep each upload under 95 MB' }, 413);
  const mediaType = file.type === 'video/mp4' ? 'video' : 'image';
  const id = crypto.randomUUID();
  const key = `originals/${id}.${extension}`;
  const now = new Date().toISOString();
  const caption = `\n\nMore photographs: ${env.SITE_URL}`;
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { filename: file.name } });
  try {
    await env.DB.prepare(`INSERT INTO media
      (id,original_key,filename,content_type,media_type,width,height,duration,caption,format,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, key, file.name.slice(0, 240), file.type, mediaType, Number(data.get('width')) || null, Number(data.get('height')) || null, Number(data.get('duration')) || null, caption.trim(), mediaType === 'video' ? 'reel' : 'feed_portrait', now, now).run();
  } catch (error) {
    await bucket.delete(key);
    throw error;
  }
  return json({ item: publicItem(await getRow(env.DB, id), origin) }, 201);
}

/** @param {Request} request @param {Env} env @param {string} id @param {string} origin */
async function saveItem(request, env, id, origin) {
  const row = await getRow(env.DB, id);
  if (row.website_published || row.instagram_status === 'published') return json({ error: 'Published versions are locked. Upload a new version to make changes.' }, 409);
  const values = draftValues(await request.json(), String(row.media_type));
  if (row.approved_key && row.approved_key !== row.original_key) await requireStorage(env).delete(String(row.approved_key));
  await env.DB.prepare(`UPDATE media SET caption=?,alt_text=?,format=?,focal_x=?,focal_y=?,status='draft',approved_key=NULL,approval_hash=NULL,approved_at=NULL,error_message=NULL,updated_at=? WHERE id=?`)
    .bind(values.caption, values.alt, values.format, values.focalX, values.focalY, new Date().toISOString(), id).run();
  return json({ item: publicItem(await getRow(env.DB, id), origin) });
}

/** @param {Request} request @param {Env} env @param {string} id @param {string} origin */
async function approveItem(request, env, id, origin) {
  const bucket = requireStorage(env);
  const row = await getRow(env.DB, id);
  if (row.website_published || row.instagram_status === 'published') return json({ error: 'Published versions are locked.' }, 409);
  const data = await form(request);
  const values = draftValues(data, String(row.media_type));
  let approvedKey = String(row.original_key);
  let approvedBlob;
  if (row.media_type === 'image') {
    const file = data.get('media');
    if (!(file instanceof File) || file.type !== 'image/jpeg') return json({ error: 'The approved image must be a rendered JPEG' }, 415);
    if (file.size > 20_000_000) return json({ error: 'The approved image is unexpectedly large' }, 413);
    approvedKey = `approved/${id}.jpg`;
    approvedBlob = file;
    await bucket.put(approvedKey, file.stream(), { httpMetadata: { contentType: 'image/jpeg' } });
  } else {
    const original = await bucket.get(String(row.original_key));
    if (!original) throw new Response('Original video is missing', { status: 409 });
    approvedBlob = await original.blob();
  }
  const approvalHash = await sha256Hex(approvedBlob, values);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE media SET caption=?,alt_text=?,format=?,focal_x=?,focal_y=?,status='approved',approved_key=?,approval_hash=?,approved_at=?,updated_at=?,error_message=NULL WHERE id=?`)
    .bind(values.caption, values.alt, values.format, values.focalX, values.focalY, approvedKey, approvalHash, now, now, id).run();
  return json({ item: publicItem(await getRow(env.DB, id), origin) });
}

/** @param {Env} env @param {string} id @param {boolean} approved */
async function privateMedia(env, id, approved) {
  const row = await getRow(env.DB, id);
  const key = approved ? row.approved_key : row.original_key;
  if (!key) throw new Response('Media is not approved', { status: 404 });
  return objectResponse(await requireStorage(env).get(String(key)));
}

/** @param {R2ObjectBody | null} object */
function objectResponse(object) {
  if (!object) throw new Response('Media not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

/** @param {Env} env @param {string} id */
async function publicMedia(env, id) {
  const row = await getRow(env.DB, id);
  if (row.status !== 'approved' || !row.approved_key) throw new Response('Media is not public', { status: 404 });
  return objectResponse(await requireStorage(env).get(String(row.approved_key)));
}

/** @param {Env} env @param {string} id @param {string} origin */
async function publishWebsite(env, id, origin) {
  const row = await getRow(env.DB, id);
  if (row.status !== 'approved') return json({ error: 'Approve the exact version first' }, 409);
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE media SET website_published=1,website_published_at=?,updated_at=? WHERE id=?').bind(now, now, id).run();
  return json({ item: publicItem(await getRow(env.DB, id), origin) });
}

/** @param {Response} response */
async function graphResult(response) {
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error?.message || `Instagram returned ${response.status}`);
  return result;
}

/** @param {Env} env @param {string} path @param {URLSearchParams | undefined} body */
function graphFetch(env, path, body) {
  return fetch(`https://graph.instagram.com/${env.INSTAGRAM_API_VERSION}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
    body,
  });
}

/** @param {Env} env @param {string} id @param {string} origin */
async function publishInstagram(env, id, origin) {
  if (!env.INSTAGRAM_ACCESS_TOKEN) return json({ error: 'Instagram secret has not been added to this Worker yet' }, 503);
  const row = await getRow(env.DB, id);
  if (row.status !== 'approved') return json({ error: 'Approve the exact version first' }, 409);
  if (row.instagram_status === 'published') return json({ item: publicItem(row, origin) });
  const mediaUrl = `${origin}/media/${id}`;
  const params = new URLSearchParams({ access_token: env.INSTAGRAM_ACCESS_TOKEN });
  if (row.media_type === 'video') {
    params.set('media_type', 'REELS'); params.set('video_url', mediaUrl); params.set('caption', String(row.caption)); params.set('share_to_feed', 'true');
  } else if (row.format === 'story') {
    params.set('media_type', 'STORIES'); params.set('image_url', mediaUrl);
  } else {
    params.set('image_url', mediaUrl); params.set('caption', String(row.caption)); if (row.alt_text) params.set('alt_text', String(row.alt_text));
  }
  await env.DB.prepare("UPDATE media SET instagram_status='publishing',error_message=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
  try {
    const container = await graphResult(await graphFetch(env, `${env.INSTAGRAM_USER_ID}/media`, params));
    await env.DB.prepare('UPDATE media SET instagram_container_id=?,updated_at=? WHERE id=?').bind(container.id, new Date().toISOString(), id).run();
    if (row.media_type === 'video') {
      let ready = false;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const statusParams = new URLSearchParams({ fields: 'status_code', access_token: env.INSTAGRAM_ACCESS_TOKEN });
        const status = await graphResult(await graphFetch(env, `${container.id}?${statusParams}`, undefined));
        if (status.status_code === 'FINISHED') { ready = true; break; }
        if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') throw new Error(`Instagram could not process the Reel (${status.status_code})`);
      }
      if (!ready) throw new Error('Instagram is still processing the Reel. Try Post again in a minute.');
    }
    const publishParams = new URLSearchParams({ creation_id: container.id, access_token: env.INSTAGRAM_ACCESS_TOKEN });
    const published = await graphResult(await graphFetch(env, `${env.INSTAGRAM_USER_ID}/media_publish`, publishParams));
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE media SET instagram_status='published',instagram_media_id=?,instagram_published_at=?,updated_at=? WHERE id=?").bind(published.id, now, now, id).run();
  } catch (error) {
    await env.DB.prepare("UPDATE media SET instagram_status='failed',error_message=?,updated_at=? WHERE id=?").bind(error instanceof Error ? error.message : String(error), new Date().toISOString(), id).run();
    throw error;
  }
  return json({ item: publicItem(await getRow(env.DB, id), origin) });
}

/** @param {Env} env @param {string} origin */
async function gallery(env, origin) {
  const result = await env.DB.prepare("SELECT * FROM media WHERE website_published=1 AND status='approved' ORDER BY website_published_at DESC").all();
  const items = result.results.map(row => ({
    id: row.id, type: row.media_type, file: `${origin}/media/${row.id}`, width: row.width, height: row.height,
    alt: row.alt_text, title: '', description: row.caption, added_at: row.website_published_at,
  }));
  return new Response(JSON.stringify(items), { headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=60' } });
}

export default {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = url.origin;
    try {
      if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, storage: Boolean(env.MEDIA) });
      if (request.method === 'GET' && url.pathname === '/gallery.json') return gallery(env, origin);
      if (request.method === 'GET' && url.pathname.startsWith('/media/')) return publicMedia(env, url.pathname.split('/')[2]);
      if (!authorized(request, env)) return json({ error: `Sign in as ${env.ADMIN_EMAIL} through Cloudflare Access` }, 401);
      if (request.method === 'GET' && ['/', '/app.css', '/app.js'].includes(url.pathname)) return uiAsset(url.pathname);
      if (url.pathname === '/api/items' && request.method === 'GET') return listItems(request, env, origin);
      if (url.pathname === '/api/items' && request.method === 'POST') return createItem(request, env, origin);
      const match = url.pathname.match(/^\/api\/items\/([a-f0-9-]+)(?:\/(.+))?$/);
      if (!match) return json({ error: 'Not found' }, 404);
      const [, id, action] = match;
      if (!action && request.method === 'PUT') return saveItem(request, env, id, origin);
      if (action === 'approve' && request.method === 'POST') return approveItem(request, env, id, origin);
      if (action === 'media' && request.method === 'GET') return privateMedia(env, id, false);
      if (action === 'approved-media' && request.method === 'GET') return privateMedia(env, id, true);
      if (action === 'publish-website' && request.method === 'POST') return publishWebsite(env, id, origin);
      if (action === 'publish-instagram' && request.method === 'POST') return publishInstagram(env, id, origin);
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(error);
      return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
    }
  },
};
