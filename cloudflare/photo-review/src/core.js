export const IMAGE_FORMATS = Object.freeze({
  feed_portrait: { label: 'Feed · 4:5', width: 1080, height: 1350 },
  feed_square: { label: 'Feed · 1:1', width: 1080, height: 1080 },
  story: { label: 'Story · 9:16', width: 1080, height: 1920 },
});

export const VIDEO_FORMATS = Object.freeze({
  reel: { label: 'Reel · 9:16 MP4' },
});

/** @param {unknown} value @param {number} limit */
export function cleanText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
}

/** @param {unknown} value */
export function clampFocus(value) {
  const number = Number.parseInt(String(value), 10);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 50;
}

/** @param {string} mediaType @param {string} value */
export function formatFor(mediaType, value) {
  const formats = mediaType === 'video' ? VIDEO_FORMATS : IMAGE_FORMATS;
  if (!(value in formats)) throw new Error('Unsupported publishing format');
  return value;
}

/** @param {string} contentType */
export function extensionFor(contentType) {
  return ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
  })[contentType] || '';
}

/** @param {Record<string, any>} row @param {string} origin */
export function publicItem(row, origin) {
  return {
    id: row.id,
    type: row.media_type,
    source: row.filename,
    width: row.width,
    height: row.height,
    duration: row.duration,
    original_url: `${origin}/api/items/${row.id}/media`,
    preview_url: row.approved_key ? `${origin}/api/items/${row.id}/approved-media` : `${origin}/api/items/${row.id}/media`,
    public_url: row.approved_key ? `${origin}/media/${row.id}` : null,
    formats: row.media_type === 'video' ? VIDEO_FORMATS : IMAGE_FORMATS,
    draft: {
      caption: row.caption,
      alt: row.alt_text,
      format: row.format,
      focal_x: row.focal_x,
      focal_y: row.focal_y,
      status: row.status,
      approval_hash: row.approval_hash,
      website_published: Boolean(row.website_published),
      instagram_status: row.instagram_status,
      instagram_media_id: row.instagram_media_id,
      error_message: row.error_message,
      approved_at: row.approved_at,
      website_published_at: row.website_published_at,
      instagram_published_at: row.instagram_published_at,
    },
  };
}

/** @param {Blob} blob @param {Record<string, unknown>} fields */
export async function sha256Hex(blob, fields) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const extra = new TextEncoder().encode(JSON.stringify(fields));
  const joined = new Uint8Array(bytes.length + extra.length);
  joined.set(bytes);
  joined.set(extra, bytes.length);
  const digest = await crypto.subtle.digest('SHA-256', joined);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
