import type { SyncPayload } from "./types.ts";

export async function upsertUser(
  db: D1Database,
  sub: string,
  email: string
): Promise<void> {
  await db.prepare(
    `INSERT INTO users (id, email, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email`
  ).bind(sub, email, Date.now()).run();
}

export async function getSyncData(
  db: D1Database,
  userId: string
): Promise<SyncPayload | null> {
  const row = await db
    .prepare("SELECT * FROM sync_data WHERE user_id = ?")
    .bind(userId)
    .first<{
      collection_json:  string;
      wishlist_json:    string;
      locations_json:   string;
      last_modified_at: number;
      app_version:      string | null;
    }>();

  if (!row) return null;

  return {
    collection:      JSON.parse(row.collection_json),
    wishlist:        JSON.parse(row.wishlist_json),
    locations:       JSON.parse(row.locations_json),
    last_modified_at: row.last_modified_at,
    app_version:     row.app_version ?? undefined,
  };
}

export async function putSyncData(
  db: D1Database,
  userId: string,
  payload: SyncPayload
): Promise<void> {
  await db.prepare(
    `INSERT INTO sync_data (user_id, collection_json, wishlist_json, locations_json, last_modified_at, app_version)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       collection_json  = excluded.collection_json,
       wishlist_json    = excluded.wishlist_json,
       locations_json   = excluded.locations_json,
       last_modified_at = excluded.last_modified_at,
       app_version      = excluded.app_version`
  ).bind(
    userId,
    JSON.stringify(payload.collection),
    JSON.stringify(payload.wishlist),
    JSON.stringify(payload.locations),
    payload.last_modified_at,
    payload.app_version ?? null
  ).run();
}

export async function deleteUserData(
  db: D1Database,
  userId: string
): Promise<void> {
  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}
