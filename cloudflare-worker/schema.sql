CREATE TABLE IF NOT EXISTS users (
  id         TEXT    PRIMARY KEY,
  email      TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_data (
  user_id          TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  collection_json  TEXT    NOT NULL DEFAULT '[]',
  wishlist_json    TEXT    NOT NULL DEFAULT '[]',
  locations_json   TEXT    NOT NULL DEFAULT '["my collection"]',
  last_modified_at INTEGER NOT NULL,
  app_version      TEXT
);
