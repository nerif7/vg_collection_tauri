export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  WORKER_SECRET: string;
}

export interface JwtPayload {
  sub:   string;
  email: string;
  exp:   number;
  iat:   number;
}

export interface SyncPayload {
  collection:       unknown[];
  wishlist:         unknown[];
  locations:        string[];
  last_modified_at: number;
  app_version?:     string;
  schema_version?:  number;
}
