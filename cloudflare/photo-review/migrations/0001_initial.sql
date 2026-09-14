CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  original_key TEXT NOT NULL,
  approved_key TEXT,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  width INTEGER,
  height INTEGER,
  duration REAL,
  caption TEXT NOT NULL DEFAULT '',
  alt_text TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL,
  focal_x INTEGER NOT NULL DEFAULT 50 CHECK (focal_x BETWEEN 0 AND 100),
  focal_y INTEGER NOT NULL DEFAULT 50 CHECK (focal_y BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  approval_hash TEXT,
  website_published INTEGER NOT NULL DEFAULT 0,
  instagram_status TEXT NOT NULL DEFAULT 'not_published',
  instagram_container_id TEXT,
  instagram_media_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  website_published_at TEXT,
  instagram_published_at TEXT
);

CREATE INDEX IF NOT EXISTS media_created_at_idx ON media(created_at DESC);
CREATE INDEX IF NOT EXISTS media_website_idx ON media(website_published, created_at DESC);
