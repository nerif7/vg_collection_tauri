# Phase 10 — Cloud Sync: Step-by-Step Implementation Guide

## Context

App berjalan di PC dan Android tapi data terisolasi. User harus update dua kali setiap ada perubahan koleksi. Phase ini menghubungkan keduanya via Cloudflare Workers sebagai "jembatan" cloud — gratis, tanpa server yang perlu di-maintain.

---

## Sebelum Mulai: Konsep Dasar yang Harus Dipahami

### Apa itu Cloudflare Workers?
Bayangkan sebuah fungsi JavaScript yang berjalan di server — tapi servernya adalah jaringan global Cloudflare (200+ kota). Kamu tidak perlu:
- Install OS
- Setup Nginx/Apache
- Bayar VPS
- Monitor uptime

Kamu cukup tulis fungsi, `wrangler deploy`, selesai. Cloudflare yang urus sisanya.

### Apa itu D1?
D1 adalah database SQLite yang di-host Cloudflare. SQLite yang sama yang biasa jalan di file lokal, tapi sekarang ada di cloud dan bisa diakses dari Worker.

### Apa itu OAuth 2.0 + PKCE?
OAuth = standar cara login "pakai akun Google/Facebook/dll".
PKCE (Proof Key for Code Exchange) = ekstensi OAuth yang aman untuk **aplikasi native** (desktop/mobile) karena:
- App native tidak bisa menyimpan client_secret dengan aman (user bisa extract APK dan baca semua string)
- PKCE mengganti kebutuhan client_secret dengan "puzzle" matematika (SHA256 hash) yang diverifikasi saat exchange token
- Google merekomendasikan PKCE untuk semua aplikasi native

### Kenapa kita issue JWT sendiri, bukan pakai token Google?
Google ID token expire dalam **1 jam**. Kalau kita pakai langsung, user harus login ulang setiap jam — sangat buruk UX-nya.
Solusi: Worker kita terima Google token sekali → verifikasi → terbitkan JWT kita sendiri yang valid **30 hari**. Ini pola standar yang dipakai hampir semua production app.

---

## Phase 10a — Infrastructure & Backend

### Langkah 1: Buat akun Cloudflare

1. Buka [cloudflare.com](https://cloudflare.com)
2. Klik **Sign Up** → masukkan email + password
3. Verifikasi email
4. Pilih **Free plan** (tidak butuh billing info)

> **Mengapa Cloudflare?** Free tier Workers sangat generous: 100.000 request/hari. Untuk 50 user yang masing-masing sync 10x/hari = 500 request. Limit tidak akan tercapai bahkan kalau user kamu bertambah 100x lipat.

---

### Langkah 2: Install Wrangler CLI

Buka terminal, jalankan:
```bash
npm install -g wrangler
```

Lalu login ke Cloudflare:
```bash
wrangler login
```
Browser akan terbuka → authorize → kembali ke terminal.

> **Wrangler** adalah CLI resmi Cloudflare untuk manage Workers. Sama seperti `gh` adalah CLI untuk GitHub.

---

### Langkah 3: Buat D1 Database

```bash
wrangler d1 create vg-collection-sync
```

Output akan seperti ini:
```
✅ Successfully created DB 'vg-collection-sync' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "vg-collection-sync"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   ← CATAT INI
```

Simpan `database_id` — akan dipakai di `wrangler.toml`.

---

### Langkah 4: Setup Google Cloud Console

1. Buka [console.cloud.google.com](https://console.cloud.google.com)
2. Klik dropdown project di atas → **New Project** → nama: `VG Collection` → Create
3. Tunggu project dibuat, pastikan sudah dipilih di dropdown

**Enable Google Identity API:**
4. Pergi ke **APIs & Services → Library**
5. Cari "Google Identity" → pilih **Google Identity Toolkit API** → Enable

**Buat OAuth credentials:**
6. Pergi ke **APIs & Services → Credentials**
7. Klik **+ Create Credentials** → **OAuth client ID**
8. Jika diminta configure consent screen: pilih **External** → isi App name: "VG Collection", email kamu, → Save
9. Kembali buat credentials: Application type → **Desktop app** → Name: "VG Collection Native" → Create
10. Catat **Client ID** (format: `XXXXXXXX.apps.googleusercontent.com`)
    - **Tidak ada Client Secret** untuk Desktop app dengan PKCE — ini memang benar dan aman

> **Mengapa "Desktop app" bukan "Web application"?** Desktop app type tidak memerlukan redirect URI yang terdaftar di server — cocok untuk custom protocol seperti `vgcollection://`. Web application type lebih ketat soal redirect URI.

---

### Langkah 5: Buat project Cloudflare Worker

Di terminal, dari root project:
```bash
mkdir cloudflare-worker
cd cloudflare-worker
npm init -y
npm install hono jose
npm install -D wrangler @cloudflare/workers-types typescript
```

> **Hono** = micro-framework router untuk Cloudflare Workers (sangat ringan, ~13KB).
> **jose** = library untuk JWT (JSON Web Token) — sign dan verify.

Buat `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true
  }
}
```

---

### Langkah 6: Buat `wrangler.toml`

```toml
name = "vg-collection-sync"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "vg-collection-sync"
database_id = "GANTI_DENGAN_DATABASE_ID_DARI_LANGKAH_3"

[vars]
GOOGLE_CLIENT_ID = "GANTI_DENGAN_CLIENT_ID_DARI_LANGKAH_4"
```

Untuk `WORKER_SECRET` (dipakai sign JWT), jangan taruh di file — gunakan environment secret:
```bash
wrangler secret put WORKER_SECRET
# masukkan random string panjang, misal: openssl rand -base64 32
```

> **Mengapa secret dipisah?** `wrangler.toml` masuk ke git. Kalau secret ditaruh di sana, semua orang yang clone repo bisa baca. Wrangler secrets dienkripsi di Cloudflare dan tidak pernah terlihat di git.

---

### Langkah 7: Buat schema D1

Buat file `cloudflare-worker/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS users (
  id         TEXT    PRIMARY KEY,   -- Google "sub" (unique user ID dari Google)
  email      TEXT    NOT NULL,
  created_at INTEGER NOT NULL       -- Unix timestamp ms
);

CREATE TABLE IF NOT EXISTS sync_data (
  user_id          TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  collection_json  TEXT    NOT NULL DEFAULT '[]',
  wishlist_json    TEXT    NOT NULL DEFAULT '[]',
  locations_json   TEXT    NOT NULL DEFAULT '["my collection"]',
  last_modified_at INTEGER NOT NULL,   -- Unix ms, dikirim oleh client
  app_version      TEXT                -- untuk future migration
);
```

Deploy schema ke D1:
```bash
# Local (untuk testing)
wrangler d1 execute vg-collection-sync --local --file=schema.sql

# Remote (production)
wrangler d1 execute vg-collection-sync --remote --file=schema.sql
```

> **Mengapa dua tabel?** `users` menyimpan identitas (dari Google), `sync_data` menyimpan data koleksi. Dipisah karena di masa depan kita mungkin punya data lain per-user (settings cloud, dll) — bisa tambah tabel baru tanpa ubah schema `users`.

---

### Langkah 8: Tulis Worker code

**`cloudflare-worker/src/types.ts`**:
```typescript
export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  WORKER_SECRET: string;
}

export interface JwtPayload {
  sub:   string;   // Google user ID
  email: string;
  exp:   number;   // Unix timestamp expiry
  iat:   number;   // Unix timestamp issued at
}

export interface SyncPayload {
  collection:      unknown[];
  wishlist:        unknown[];
  locations:       string[];
  last_modified_at: number;
  app_version?:   string;
}
```

**`cloudflare-worker/src/auth.ts`**:
```typescript
import { SignJWT, jwtVerify } from "jose";
import type { Env, JwtPayload } from "./types.ts";

// Verifikasi Google ID token via Google's tokeninfo endpoint
// (sederhana, cocok untuk low-traffic app; alternatif: verify signature lokal)
export async function verifyGoogleToken(
  code: string,
  codeVerifier: string,
  clientId: string
): Promise<{ sub: string; email: string }> {
  // Exchange authorization code untuk tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      redirect_uri:  "vgcollection://auth/callback",
      grant_type:    "authorization_code",
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = await tokenRes.json() as { id_token?: string };
  if (!tokens.id_token) throw new Error("No id_token in Google response");

  // Decode payload (tanpa verify signature — sudah diverifikasi oleh exchange itu sendiri)
  const [, payloadB64] = tokens.id_token.split(".");
  const payload = JSON.parse(atob(payloadB64));

  if (payload.aud !== clientId) throw new Error("Token audience mismatch");

  return { sub: payload.sub as string, email: payload.email as string };
}

// Issue JWT internal 30 hari
export async function issueJwt(
  sub: string,
  email: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  return new SignJWT({ sub, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

// Verify JWT dari request header
export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtPayload> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  const { payload } = await jwtVerify(token, key);
  return payload as unknown as JwtPayload;
}

// Helper: extract + verify JWT dari Authorization header
export async function authMiddleware(
  request: Request,
  secret: string
): Promise<JwtPayload | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  try {
    return await verifyJwt(auth.slice(7), secret);
  } catch {
    return null;
  }
}
```

**`cloudflare-worker/src/sync.ts`**:
```typescript
import type { Env, SyncPayload } from "./types.ts";

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
  // ON DELETE CASCADE di schema akan hapus sync_data otomatis
  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}
```

**`cloudflare-worker/src/index.ts`**:
```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types.ts";
import { verifyGoogleToken, issueJwt, authMiddleware } from "./auth.ts";
import { upsertUser, getSyncData, putSyncData, deleteUserData } from "./sync.ts";

const app = new Hono<{ Bindings: Env }>();

// CORS — izinkan request dari app Tauri (yang tidak punya origin tertentu)
app.use("*", cors({ origin: "*" }));

// POST /auth/google — tukar authorization code dengan JWT internal
app.post("/auth/google", async (c) => {
  const body = await c.req.json<{ code: string; codeVerifier: string }>();

  if (!body.code || !body.codeVerifier) {
    return c.json({ error: "Missing code or codeVerifier" }, 400);
  }

  try {
    const { sub, email } = await verifyGoogleToken(
      body.code,
      body.codeVerifier,
      c.env.GOOGLE_CLIENT_ID
    );

    await upsertUser(c.env.DB, sub, email);
    const token = await issueJwt(sub, email, c.env.WORKER_SECRET);

    return c.json({ token, email });
  } catch (err) {
    console.error("Auth error:", err);
    return c.json({ error: "Authentication failed" }, 401);
  }
});

// GET /sync — ambil data sync user
app.get("/sync", async (c) => {
  const user = await authMiddleware(c.req.raw, c.env.WORKER_SECRET);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const data = await getSyncData(c.env.DB, user.sub);
  return c.json(data); // null jika belum pernah sync
});

// PUT /sync — simpan data sync user
app.put("/sync", async (c) => {
  const user = await authMiddleware(c.req.raw, c.env.WORKER_SECRET);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const payload = await c.req.json();
  await putSyncData(c.env.DB, user.sub, payload);

  return c.json({ ok: true });
});

// DELETE /sync — hapus semua data user (sign out + delete)
app.delete("/sync", async (c) => {
  const user = await authMiddleware(c.req.raw, c.env.WORKER_SECRET);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  await deleteUserData(c.env.DB, user.sub);
  return c.json({ ok: true });
});

export default app;
```

---

### Langkah 9: Deploy Worker

```bash
cd cloudflare-worker
wrangler deploy
```

Output: `https://vg-collection-sync.USERNAME.workers.dev`

**Test dengan curl:**
```bash
# Test: endpoint tidak ada auth (harus return 401)
curl -X GET https://vg-collection-sync.USERNAME.workers.dev/sync
# Expected: {"error":"Unauthorized"}

# Test: auth endpoint dengan data invalid (harus return 401)
curl -X POST https://vg-collection-sync.USERNAME.workers.dev/auth/google \
  -H "Content-Type: application/json" \
  -d '{"code":"fake","codeVerifier":"fake"}'
# Expected: {"error":"Authentication failed"}
```

Kalau kedua test ini memberikan response yang benar, Worker sudah live dan berfungsi.

---

## Phase 10b — Auth di Tauri

### Langkah 10: Tambah tauri-plugin-deep-link

```bash
cd ..  # kembali ke root project
cargo add tauri-plugin-deep-link --manifest-path src-tauri/Cargo.toml
```

Atau edit `src-tauri/Cargo.toml` manually, tambahkan:
```toml
tauri-plugin-deep-link = "2"
```

> **Deep link** adalah mekanisme di mana klik URL seperti `vgcollection://auth/callback?code=...` membuka app kita dan meneruskan URL tersebut ke handler di code. Ini yang dipakai untuk menerima authorization code dari Google setelah user login di browser.

---

### Langkah 11: Register deep-link di `tauri.conf.json`

Tambahkan di bagian `app`:
```json
"app": {
  "windows": [...],
  "security": { ... },
  "deepLinkProtocols": ["vgcollection"]
}
```

Update CSP untuk allow koneksi ke Worker dan Google:
```
connect-src 'self' https://raw.githubusercontent.com https://api.github.com
            https://en.cf-vanguard.com https://cf-vanguard.com
            https://vg-collection-sync.USERNAME.workers.dev
            https://accounts.google.com
            https://oauth2.googleapis.com
```

---

### Langkah 12: Register plugin + tambah `get_file_mtime` di `lib.rs`

```rust
// 1. Tambahkan di builder:
.plugin(tauri_plugin_deep_link::init())

// 2. Tambahkan Rust command baru — baca mtime file dari OS:
#[tauri::command]
async fn get_file_mtime(path: String) -> Result<u64, String> {
    let meta  = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let mtime = meta.modified().map_err(|e| e.to_string())?;
    let ms    = mtime
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    Ok(ms)
}

// 3. Daftarkan command di .invoke_handler():
.invoke_handler(tauri::generate_handler![
    // ... command yang sudah ada ...
    get_file_mtime,   // ← tambah ini
])
```

> **Mengapa di Rust, bukan JS?** Browser/WebView tidak punya akses ke file system secara langsung. Semua operasi file harus lewat Tauri bridge (invoke → Rust). `std::fs::metadata` adalah cara standar Rust membaca metadata file termasuk `mtime` (modified time).

> **Kenapa `catch(() => 0)` di TypeScript?** Kalau file belum ada (misal app baru pertama kali diinstall, belum ada collection.json), mtime-nya kita anggap 0 — artinya "belum pernah dimodifikasi". Sync akan fetch dari remote jika ada.

---

### Langkah 13: Setup deep link di Android

Edit `src-tauri/gen/android/app/src/main/AndroidManifest.xml`, tambahkan di dalam `<activity>`:
```xml
<intent-filter android:autoVerify="false">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="vgcollection" android:host="auth" />
</intent-filter>
```

---

### Langkah 14: Buat `src/auth.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

const GOOGLE_CLIENT_ID = "GANTI_DENGAN_CLIENT_ID_KAMU";
const WORKER_URL       = "https://vg-collection-sync.USERNAME.workers.dev";

export interface AuthSession {
  token:     string;
  email:     string;
  expiresAt: number;   // Unix ms
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── Session storage ───────────────────────────────────────────────────────────

export async function loadSession(): Promise<AuthSession | null> {
  try {
    const dir  = await invoke<string>("get_userdata_dir");
    const text = await invoke<string | null>("read_text_file", { path: `${dir}/auth.json` });
    if (!text) return null;
    const session = JSON.parse(text) as AuthSession;
    if (session.expiresAt < Date.now()) return null;   // expired
    return session;
  } catch {
    return null;
  }
}

async function saveSession(session: AuthSession): Promise<void> {
  const dir = await invoke<string>("get_userdata_dir");
  await invoke<void>("write_text_file", {
    path:    `${dir}/auth.json`,
    content: JSON.stringify(session, null, 2),
  });
}

export async function clearSession(): Promise<void> {
  try {
    const dir = await invoke<string>("get_userdata_dir");
    await invoke<void>("delete_file", { path: `${dir}/auth.json` });
  } catch { /* already gone */ }
}

// ── Google OAuth PKCE flow ────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<AuthSession> {
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id:             GOOGLE_CLIENT_ID,
    redirect_uri:          "vgcollection://auth/callback",
    response_type:         "code",
    scope:                 "openid email",
    code_challenge:        codeChallenge,
    code_challenge_method: "S256",
    // Paksa tampilkan account picker (memudahkan ganti akun)
    prompt:                "select_account",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  // Buka browser
  await openUrl(authUrl);

  // Tunggu deep link callback
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unlisten();
      reject(new Error("Login timeout — browser tidak mengembalikan callback dalam 5 menit"));
    }, 5 * 60 * 1000);

    let unlisten: () => void;

    listen<string>("deep-link://new-url", async ({ payload: url }) => {
      clearTimeout(timeout);
      unlisten();

      try {
        const parsed = new URL(url);
        const code   = parsed.searchParams.get("code");
        if (!code) throw new Error("No authorization code in callback URL");

        // Exchange code + verifier ke Worker → dapat JWT kita
        const res = await fetch(`${WORKER_URL}/auth/google`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ code, codeVerifier }),
        });

        if (!res.ok) throw new Error(`Worker auth failed: ${res.status}`);

        const { token, email } = await res.json() as { token: string; email: string };

        const session: AuthSession = {
          token,
          email,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,   // 30 hari
        };

        await saveSession(session);
        resolve(session);
      } catch (err) {
        reject(err);
      }
    }).then((fn) => { unlisten = fn; });
  });
}

export async function signOut(): Promise<void> {
  const session = await loadSession();
  if (session) {
    try {
      await fetch(`${WORKER_URL}/sync`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    } catch { /* network error saat logout — tetap hapus lokal */ }
  }
  await clearSession();
}
```

> **Learning note — PKCE flow ini aman karena:**
> 1. `codeVerifier` hanya ada di memory app — tidak pernah dikirim ke browser
> 2. `codeChallenge` (hash dari verifier) dikirim ke Google saat request auth
> 3. Saat exchange code, kita kirim `codeVerifier` ke Worker → Worker kirim ke Google
> 4. Google verifikasi: hash(codeVerifier) === codeChallenge yang disimpan? → OK
> 5. Kalau ada orang yang intercept code dari callback URL, mereka tidak punya codeVerifier → tidak bisa exchange

---

### Langkah 15: Tambah types di `src/types.ts`

```typescript
export interface AuthSession {
  token:     string;
  email:     string;
  expiresAt: number;
}

export interface SyncPayload {
  collection:       CollectionEntry[];
  wishlist:         WishlistEntry[];
  locations:        string[];
  last_modified_at: number;
}

export interface SyncMeta {
  lastSyncedAt: number;   // Unix ms — kapan terakhir sync berhasil
  // localModifiedAt TIDAK disimpan di sini — dibaca langsung dari file mtime via OS
}

export interface ConflictEntry {
  cardCode: string;
  region:   "EN" | "JP";
  local:    CollectionEntry | null;
  remote:   CollectionEntry | null;
}
```

---

## Phase 10c — Basic Sync

### Langkah 16: Buat `src/sync.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";
import { loadSession } from "./auth.ts";
import {
  getAllCollectionEntries, getAllWishlistEntries, getAllLocations,
} from "./collection-db.ts";
import type { SyncPayload, SyncMeta, ConflictEntry, CollectionEntry, WishlistEntry } from "./types.ts";

const WORKER_URL = "https://vg-collection-sync.USERNAME.workers.dev";

// ── Sync metadata — hanya simpan lastSyncedAt ─────────────────────────────────
// localModifiedAt dibaca dari file mtime via OS (Opsi B) — collection-db.ts tidak disentuh

async function loadSyncMeta(): Promise<SyncMeta> {
  try {
    const dir  = await invoke<string>("get_userdata_dir");
    const text = await invoke<string | null>("read_text_file", { path: `${dir}/sync-meta.json` });
    if (!text) return { lastSyncedAt: 0 };
    return JSON.parse(text) as SyncMeta;
  } catch {
    return { lastSyncedAt: 0 };
  }
}

async function saveSyncMeta(lastSyncedAt: number): Promise<void> {
  const dir = await invoke<string>("get_userdata_dir");
  await invoke<void>("write_text_file", {
    path:    `${dir}/sync-meta.json`,
    content: JSON.stringify({ lastSyncedAt }, null, 2),
  });
}

// Tanya OS kapan file terakhir diubah — tidak perlu tracking manual di collection-db.ts
async function getLocalModifiedAt(): Promise<number> {
  const dir = await invoke<string>("get_userdata_dir");
  const [c, w, l] = await Promise.all([
    invoke<number>("get_file_mtime", { path: `${dir}/collection.json` }).catch(() => 0),
    invoke<number>("get_file_mtime", { path: `${dir}/wishlist.json`   }).catch(() => 0),
    invoke<number>("get_file_mtime", { path: `${dir}/locations.json`  }).catch(() => 0),
  ]);
  return Math.max(c, w, l);
}

// ── Remote API helpers ────────────────────────────────────────────────────────

async function fetchRemote(token: string): Promise<SyncPayload | null> {
  const res = await fetch(`${WORKER_URL}/sync`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /sync failed: ${res.status}`);
  return res.json() as Promise<SyncPayload | null>;
}

async function pushToRemote(token: string, payload: SyncPayload): Promise<void> {
  const res = await fetch(`${WORKER_URL}/sync`, {
    method:  "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PUT /sync failed: ${res.status}`);
}

// ── Local data helpers ────────────────────────────────────────────────────────

async function buildLocalPayload(): Promise<SyncPayload> {
  const [collection, wishlist, locations] = await Promise.all([
    getAllCollectionEntries(),
    getAllWishlistEntries(),
    getAllLocations(),
  ]);
  return { collection, wishlist, locations, last_modified_at: Date.now() };
}

async function applyRemotePayload(remote: SyncPayload): Promise<void> {
  // Overwrite local files dengan data remote
  const dir = await invoke<string>("get_userdata_dir");
  await Promise.all([
    invoke("write_text_file", { path: `${dir}/collection.json`, content: JSON.stringify(remote.collection, null, 2) }),
    invoke("write_text_file", { path: `${dir}/wishlist.json`,   content: JSON.stringify(remote.wishlist,   null, 2) }),
    invoke("write_text_file", { path: `${dir}/locations.json`,  content: JSON.stringify(remote.locations,  null, 2) }),
  ]);
}

// ── Conflict detection ────────────────────────────────────────────────────────

function makeKey(e: CollectionEntry): string {
  return `${e.cardCode}|${e.location}|${e.region}`;
}

export function detectConflicts(
  local:  CollectionEntry[],
  remote: CollectionEntry[]
): ConflictEntry[] {
  const localMap  = new Map(local.map((e)  => [makeKey(e),  e]));
  const remoteMap = new Map(remote.map((e) => [makeKey(e), e]));
  const conflicts: ConflictEntry[] = [];

  for (const [key, localEntry] of localMap) {
    const remoteEntry = remoteMap.get(key);
    if (remoteEntry && remoteEntry.quantity !== localEntry.quantity) {
      conflicts.push({
        cardCode: localEntry.cardCode,
        region:   localEntry.region,
        local:    localEntry,
        remote:   remoteEntry,
      });
    }
  }

  return conflicts;
}

// ── Main sync function ────────────────────────────────────────────────────────

export type SyncOutcome =
  | { status: "not_logged_in" }
  | { status: "up_to_date" }
  | { status: "pushed" }
  | { status: "pulled" }
  | { status: "conflict"; conflicts: ConflictEntry[]; remote: SyncPayload }
  | { status: "error"; message: string };

export async function performSync(): Promise<SyncOutcome> {
  const session = await loadSession();
  if (!session) return { status: "not_logged_in" };

  try {
    const [meta, localModifiedAt, remote] = await Promise.all([
      loadSyncMeta(),
      getLocalModifiedAt(),   // baca mtime dari OS — collection-db.ts tidak disentuh
      fetchRemote(session.token),
    ]);

    // First sync dari device ini
    if (!remote) {
      const local = await buildLocalPayload();
      await pushToRemote(session.token, local);
      await saveSyncMeta(Date.now());
      return { status: "pushed" };
    }

    const localDirty  = localModifiedAt > meta.lastSyncedAt;
    const remoteDirty = remote.last_modified_at > meta.lastSyncedAt;

    if (!localDirty && !remoteDirty) {
      return { status: "up_to_date" };
    }

    if (localDirty && !remoteDirty) {
      const local = await buildLocalPayload();
      await pushToRemote(session.token, local);
      await saveSyncMeta(Date.now());
      return { status: "pushed" };
    }

    if (!localDirty && remoteDirty) {
      await applyRemotePayload(remote);
      await saveSyncMeta(Date.now());
      return { status: "pulled" };
    }

    // Both dirty — check conflict per-entry
    const localCollection = await getAllCollectionEntries();
    const conflicts = detectConflicts(localCollection, remote.collection as CollectionEntry[]);

    if (conflicts.length === 0) {
      // Tidak ada conflict murni — push local (sudah include semua "local added" entries)
      const local = await buildLocalPayload();
      await pushToRemote(session.token, local);
      await saveSyncMeta(Date.now());
      return { status: "pushed" };
    }

    // Ada conflict — kembalikan ke caller untuk ditangani di UI
    return { status: "conflict", conflicts, remote };

  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

// Dipanggil setelah user resolve conflict
export async function resolveAndSync(
  token: string,
  resolvedCollection: CollectionEntry[],
  remote: SyncPayload
): Promise<void> {
  const [wishlist, locations] = await Promise.all([getAllWishlistEntries(), getAllLocations()]);

  const payload: SyncPayload = {
    collection:       resolvedCollection,
    wishlist,
    locations,
    last_modified_at: Date.now(),
  };

  // Simpan lokal
  const dir = await invoke<string>("get_userdata_dir");
  await invoke("write_text_file", { path: `${dir}/collection.json`, content: JSON.stringify(resolvedCollection, null, 2) });

  // Push ke remote
  await pushToRemote(token, payload);

  await saveSyncMeta(Date.now());
}
```

---

### Langkah 17: Tambah `scheduleDebounce` ke `sync.ts`

Debounce push: 5 detik setelah edit terakhir berhenti → push ke cloud.
Kalau offline/gagal → tidak perlu flag khusus, karena `localModifiedAt > lastSyncedAt` tetap true → otomatis di-push saat app dibuka lagi (Opsi 1 sebagai fallback).

```typescript
// Tambahkan di src/sync.ts

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Dipanggil dari main.ts setiap kali ada mutasi (add/edit/delete/move)
export function scheduleDebounce(): void {
  if (_debounceTimer) clearTimeout(_debounceTimer);

  _debounceTimer = setTimeout(async () => {
    _debounceTimer = null;

    const session = await loadSession();
    if (!session) return;   // belum login → skip

    const [meta, localModifiedAt] = await Promise.all([
      loadSyncMeta(),
      getLocalModifiedAt(),
    ]);

    if (localModifiedAt <= meta.lastSyncedAt) return;   // tidak ada perubahan baru

    try {
      const local = await buildLocalPayload();
      await pushToRemote(session.token, local);
      await saveSyncMeta(Date.now());
      // Tidak perlu toast — ini background push, tidak perlu ganggu user
    } catch {
      // Offline atau error → biarkan, mtime tetap lebih baru dari lastSyncedAt
      // Saat app dibuka berikutnya, performSync() akan deteksi dan push
    }
  }, 5_000);   // ← 5 detik
}
```

> **Kenapa tidak perlu `pendingPush` flag?**
> Karena kita sudah pakai Opsi B (file mtime). Kalau push gagal saat debounce,
> `localModifiedAt` tetap lebih baru dari `lastSyncedAt`. Saat app dibuka lagi,
> `performSync()` melihat ini dan push otomatis. Flag terpisah = redundant.

---

### Langkah 17b: Wire `scheduleDebounce` di `main.ts`

`scheduleDebounce` dipanggil dari callback yang sudah ada di arsitektur — tidak perlu ubah tab files.

Collection tab sudah punya `onChange` callback yang dipanggil setelah setiap mutasi:

```typescript
import { performSync, scheduleDebounce } from "./sync.ts";
import { showToast } from "./toast.ts";

// Saat init collection tab (sudah ada di main.ts):
initCollectionTab(cards, {
  onChange: () => {
    refreshCollectionQtyMap();   // sudah ada
    scheduleDebounce();          // ← tambah ini
  },
});

// Saat init wishlist (juga perlu callback onChange):
initWishlistTab(cards, {
  onChange: () => scheduleDebounce(),
});
```

> **Mengapa dari callback, bukan dari `collection-db.ts`?**
> Karena kita pakai Opsi B — `collection-db.ts` tidak tahu soal sync.
> Callback `onChange` di `main.ts` sudah jadi "pusat notifikasi" mutasi.
> Cukup tambah satu baris di sana, semua operasi collection + wishlist tertangkap.

---

### Langkah 17c: Panggil `performSync` saat app dibuka di `main.ts`

```typescript
// Di akhir fungsi init(), setelah loadCollectionTab() dll:
(async () => {
  const result = await performSync();
  switch (result.status) {
    case "pulled":
      showToast("Koleksi diperbarui dari cloud", "success");
      await loadCollectionTab();
      await loadWishlistTab();
      break;
    case "error":
      showToast("Sync gagal, bekerja offline", "error");
      break;
    case "conflict":
      // Tampilkan conflict dialog (Phase 10d)
      break;
    // "pushed", "up_to_date", "not_logged_in" → silent
  }
})();
```

**Alur lengkap Opsi 4 + 1:**
```
User edit koleksi
    ↓
onChange callback → scheduleDebounce() → timer 5 detik dimulai
    ↓
Edit lagi → timer reset
    ↓
Berhenti edit 5 detik → push ke cloud (silent, background)
    |
    ├─ Online  → push berhasil → lastSyncedAt diupdate
    └─ Offline → push gagal, timer habis → tidak ada efek
                 mtime tetap > lastSyncedAt
                 Saat buka app lagi → performSync() → push
```

---

## Phase 10d — Conflict Resolution UI

### Langkah 18: Buat `src/sync-dialog.ts`

```typescript
import type { ConflictEntry, CollectionEntry } from "./types.ts";
import { createFocusTrap } from "./focus-trap.ts";

export function showConflictDialog(
  conflicts:   ConflictEntry[],
  cardMap:     Map<string, { displayName: string }>,
  onResolve:   (resolved: Map<string, "local" | "remote">) => void,
  onCancel:    () => void
): void {
  const choices = new Map<string, "local" | "remote">(
    conflicts.map((c) => [`${c.cardCode}|${c.region}`, "local"])
  );

  const backdrop = document.createElement("div");
  backdrop.className = "confirm-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "conflict-title");

  const box = document.createElement("div");
  box.className = "confirm-box";
  box.style.maxWidth = "520px";
  box.style.maxHeight = "80vh";
  box.style.overflowY = "auto";

  const title = document.createElement("h2");
  title.id = "conflict-title";
  title.className = "confirm-title";
  title.textContent = `${conflicts.length} kartu memiliki data berbeda`;
  box.appendChild(title);

  const desc = document.createElement("p");
  desc.className = "confirm-msg";
  desc.textContent = "Pilih versi mana yang ingin disimpan untuk setiap kartu:";
  box.appendChild(desc);

  // Render satu card per konflik
  for (const conflict of conflicts) {
    const key  = `${conflict.cardCode}|${conflict.region}`;
    const name = cardMap.get(conflict.cardCode)?.displayName ?? conflict.cardCode;

    const card = document.createElement("div");
    card.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:12px;margin:8px 0";

    const cardTitle = document.createElement("div");
    cardTitle.style.cssText = "font-weight:600;margin-bottom:8px";
    cardTitle.textContent = `${name} (${conflict.cardCode})`;
    card.appendChild(cardTitle);

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px";

    const makeBtn = (label: string, choice: "local" | "remote") => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.type = "button";
      btn.className = choices.get(key) === choice ? "btn-primary" : "btn-neutral";
      btn.style.flex = "1";
      btn.addEventListener("click", () => {
        choices.set(key, choice);
        btn.className = "btn-primary";
        sibling.className = "btn-neutral";
      });
      const sibling = makeBtn === ((l: string, c: "local" | "remote") => btn)
        ? btn : btn; // patched below
      return btn;
    };

    const localBtn  = document.createElement("button");
    const remoteBtn = document.createElement("button");

    localBtn.type  = "button";
    remoteBtn.type = "button";
    localBtn.style.flex  = "1";
    remoteBtn.style.flex = "1";

    localBtn.textContent  = `Device ini: ×${conflict.local?.quantity ?? 0}`;
    remoteBtn.textContent = `Cloud: ×${conflict.remote?.quantity ?? 0}`;

    const updateStyles = () => {
      const choice = choices.get(key);
      localBtn.className  = choice === "local"  ? "btn-primary" : "btn-neutral";
      remoteBtn.className = choice === "remote" ? "btn-primary" : "btn-neutral";
    };
    updateStyles();

    localBtn.addEventListener("click",  () => { choices.set(key, "local");  updateStyles(); });
    remoteBtn.addEventListener("click", () => { choices.set(key, "remote"); updateStyles(); });

    row.append(localBtn, remoteBtn);
    card.appendChild(row);
    box.appendChild(card);
  }

  // Bulk actions
  const bulkRow = document.createElement("div");
  bulkRow.style.cssText = "display:flex;gap:8px;margin-top:12px";

  const allLocalBtn  = document.createElement("button");
  const allRemoteBtn = document.createElement("button");
  allLocalBtn.type  = "button";
  allRemoteBtn.type = "button";
  allLocalBtn.className  = "btn-neutral";
  allRemoteBtn.className = "btn-neutral";
  allLocalBtn.textContent  = "Semua: Pakai Device";
  allRemoteBtn.textContent = "Semua: Pakai Cloud";
  allLocalBtn.style.flex  = "1";
  allRemoteBtn.style.flex = "1";

  // Re-render all cards after bulk select
  allLocalBtn.addEventListener("click",  () => { for (const k of choices.keys()) choices.set(k, "local");  backdrop.remove(); showConflictDialog(conflicts, cardMap, onResolve, onCancel); });
  allRemoteBtn.addEventListener("click", () => { for (const k of choices.keys()) choices.set(k, "remote"); backdrop.remove(); showConflictDialog(conflicts, cardMap, onResolve, onCancel); });

  bulkRow.append(allLocalBtn, allRemoteBtn);
  box.appendChild(bulkRow);

  // Confirm / Cancel
  const btnRow = document.createElement("div");
  btnRow.className = "confirm-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Batalkan";
  cancelBtn.className   = "btn-neutral";
  cancelBtn.type        = "button";
  cancelBtn.addEventListener("click", () => { backdrop.remove(); onCancel(); });

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "Simpan Pilihan";
  confirmBtn.className   = "btn-primary";
  confirmBtn.type        = "button";
  confirmBtn.addEventListener("click", () => { backdrop.remove(); onResolve(choices); });

  btnRow.append(cancelBtn, confirmBtn);
  box.appendChild(btnRow);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);

  createFocusTrap(backdrop);

  document.addEventListener("keydown", function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { backdrop.remove(); document.removeEventListener("keydown", onKey); onCancel(); }
  });
}
```

---

### Langkah 19: Wire conflict dialog ke `main.ts`

```typescript
import { showConflictDialog } from "./sync-dialog.ts";
import { resolveAndSync } from "./sync.ts";
import { loadSession } from "./auth.ts";

// Ganti case "conflict" di sync handler:
case "conflict": {
  const session = await loadSession();
  if (!session) break;

  showConflictDialog(
    result.conflicts,
    new Map(allCards.map((c) => [c.cardNo, c])),
    async (choices) => {
      // Build resolved collection: ambil lokal atau remote per entry
      const localCollection  = await getAllCollectionEntries();
      const remoteCollection = result.remote.collection as CollectionEntry[];

      const resolved = [...localCollection];

      for (const conflict of result.conflicts) {
        const key    = `${conflict.cardCode}|${conflict.region}`;
        const choice = choices.get(key);
        const idx    = resolved.findIndex(
          (e) => e.cardCode === conflict.cardCode && e.region === conflict.region
        );

        if (choice === "remote" && conflict.remote && idx !== -1) {
          resolved[idx] = conflict.remote;
        }
      }

      await resolveAndSync(session.token, resolved, result.remote);
      showToast("Konflik diselesaikan, koleksi disinkronkan", "success");
      await loadCollectionTab();
    },
    () => {
      showToast("Sync dibatalkan, bekerja dengan data lokal", "info");
    }
  );
  break;
}
```

---

## Langkah 20: Update `.gitignore`

Tambahkan di root `.gitignore`:
```
# Sync auth & meta (private, per-device)
userdata/auth.json
userdata/sync-meta.json

# Cloudflare Worker deps
cloudflare-worker/node_modules/
```

---

## Known Gaps & Decisions

Status legend: ⬜ Belum diputuskan | ✅ Sudah diputuskan | 🚫 Won't fix

---

### Autentikasi & Session

**Gap 1 — Login device kedua dengan data lokal yang sudah ada** ⬜
Skenario: Android dipakai beberapa hari tanpa login (200 entry lokal). Lalu login Google. PC sudah punya cloud data. `lastSyncedAt = 0` di Android → `localDirty = true`, `remoteDirty = true` → conflict dialog untuk semua 200 entry sekaligus.
Opsi: (a) Kalau `lastSyncedAt = 0` → skip conflict, langsung pull remote + merge lokal; (b) Tanya user: "Gabungkan data lokal dengan cloud?" sebelum sync pertama.
Keputusan: ___

**Gap 2 — JWT expire saat app sedang terbuka** ⬜
Push debounce dapat 401 → silent fail terus sampai restart. Perlu handle 401 → trigger re-auth flow.
Keputusan: ___

**Gap 3 — Login dengan akun Google yang salah** ⬜
Dua akun Google → dua sync bucket → data tidak pernah bertemu. Tidak ada peringatan.
Opsi: Tampilkan email yang sedang login di header/settings supaya user bisa cek.
Keputusan: ___

---

### Algoritma Sync

**Gap 4 — Clock skew antar device** ⬜
Jam device salah → mtime perbandingan rusak → `localDirty` selalu true → push terus-menerus.
Opsi: Gunakan server timestamp (response dari Worker) sebagai referensi waktu, bukan `Date.now()` lokal.
Keputusan: ___

**Gap 5 — Race condition dua device push bersamaan** ⬜
Keduanya push di detik yang sama → satu overwrite yang lain tanpa conflict dialog.
Opsi: Worker pakai D1 transaction + optimistic locking (`WHERE last_modified_at = expected_value`). Kalau tidak cocok → return 409 Conflict → app trigger re-sync.
Keputusan: ___

**Gap 6 — Pull lalu mtime file > lastSyncedAt** ⬜
`applyRemotePayload()` tulis file (mtime = now), `saveSyncMeta(Date.now())` dipanggil sesudahnya. Jendela mikrodetik bisa buat `mtime > lastSyncedAt` → false `localDirty` di sync berikutnya.
Opsi: Setelah pull, set `lastSyncedAt` ke nilai yang sedikit lebih besar dari mtime file yang baru ditulis.
Keputusan: ___

**Gap 7 — Wishlist dan locations tidak ada conflict detection** ⬜
`detectConflicts()` hanya cek collection. Wishlist dan locations: device yang push terakhir menang, silent overwrite.
Opsi: (a) Extend conflict detection ke wishlist + locations; (b) Wishlist/locations pakai last-write-wins (acceptable karena jarang konflik).
Keputusan: ___

**Gap 8 — Move entry tidak terdeteksi dengan benar** ⬜
Move "Red Binder" → "Blue Binder" di PC, edit qty di "Red Binder" di Android (offline) → merge salah, kartu muncul di kedua binder (duplikat).
Opsi: Deteksi move dengan membandingkan cardCode across semua locations, bukan hanya exact key match.
Keputusan: ___

**Gap 11 — Debounce tidak punya maximum delay** ⬜
Edit terus-menerus selama 10 menit → timer selalu reset → tidak pernah push. Data baru di cloud setelah 10 menit + 5 detik terakhir.
Opsi: Tambah `maxWait` — push paling lambat setiap 60 detik meski masih ada aktivitas.
Keputusan: ___

---

### Network & Reliability

**Gap 9 — Partial push success** ⬜
Push sampai ke D1 tapi response timeout → app tidak update `lastSyncedAt` → sync berikutnya deteksi false conflict.
Opsi: Worker return idempotency key; atau terima false conflict sebagai acceptable (user tinggal pilih, data sama saja).
Keputusan: ___

**Gap 10 — Android kill debounce timer** ⬜
Android Doze mode matikan timer saat app di-background. Debounce 5 detik tidak reliable → fallback ke Opsi 1 (saat buka app). Ini acceptable, hanya perlu didokumentasikan.
Keputusan: ___

---

### Data Integrity

**Gap 12 — Schema mismatch antar versi app** ⬜
v0.3.0 push data lama, v0.4.0 pull → field baru hilang. `app_version` dikirim tapi Worker tidak melakukan apapun.
Opsi: Worker validasi `app_version` minimum; atau versioning di payload (`schema_version: 1`).
Keputusan: ___

**Gap 13 — Corrupted JSON di-push ke cloud** ⬜
JSON corrupt tapi syntactically valid → Worker simpan → device lain pull data rusak.
Opsi: Validasi minimal di Worker (cek `Array.isArray(collection)`) sebelum simpan.
Keputusan: ___

**Gap 14 — Tidak ada backup sebelum conflict resolution** ⬜
User salah pilih di conflict dialog → data hilang, tidak ada undo.
Opsi: Auto-export backup lokal sebelum apply conflict resolution.
Keputusan: ___

---

### UX

**Gap 16 — Tidak ada indikator "data sudah aman di cloud"** ⬜
Debounce push silent. User tidak tahu apakah data sudah di cloud.
Opsi: Update "last synced" timestamp di header setelah setiap push berhasil.
Keputusan: ___

**Gap 17 — Conflict dialog belum mobile-friendly** ⬜
Banyak kartu konflik → scroll panjang di layar kecil.
Opsi: Grouping + "Semua: Pakai Device / Pakai Cloud" di atas sebagai default, expand manual kalau mau per-entry.
Keputusan: ___

**Gap 18 — Multiple sync berjalan bersamaan** ⬜
Debounce fire saat `performSync()` on-open masih jalan → dua sync concurrent.
Opsi: Flag `_syncInProgress: boolean` — kalau true, skip atau queue sync berikutnya.
Keputusan: ___

---

### Multi-user & Distribution

**Gap 20 — Worker URL di-hardcode** ⬜
Ganti Worker URL = recompile + redistribute ke semua teman.
Opsi: (a) Terima ini sebagai tradeoff; (b) URL bisa diubah di Settings app.
Keputusan: ___

**Gap 21 — Tidak ada onboarding untuk teman** ⬜
Teman baru install: tidak tahu cara login, tidak tahu Worker URL.
Opsi: README di release page; atau in-app "Setup Sync" wizard.
Keputusan: ___

---

## Verification Plan

**Phase 10a:**
```bash
curl https://vg-collection-sync.USERNAME.workers.dev/sync
# → {"error":"Unauthorized"}  ✓
```

**Phase 10b:**
1. Klik "Sign in with Google" di settings app
2. Browser terbuka → login → browser redirect ke `vgcollection://auth/callback?code=...`
3. App menerima deep link → `userdata/auth.json` terisi dengan `{token, email, expiresAt}`
4. Settings menampilkan email Google yang login

**Phase 10c:**
1. Login di PC dengan Google
2. Tambah beberapa kartu di PC
3. Install app di Android → login dengan Google yang sama
4. Buka app Android → toast "Koleksi diperbarui dari cloud" → kartu dari PC muncul

**Phase 10d:**
1. Matikan WiFi di kedua device
2. Edit quantity kartu X di PC (offline)
3. Edit quantity kartu X yang sama di Android (offline)
4. Nyalakan WiFi di Android → buka app → conflict dialog muncul dengan card X
5. Pilih salah satu → confirm → data tersimpan + di-push ke cloud

---

## Catatan Penting Saat Implementasi

1. **Jangan commit `cloudflare-worker/.dev.vars`** — file ini untuk local development secrets
2. **Jangan commit `userdata/auth.json`** — sudah di .gitignore
3. **Test di Android dulu setelah deep link setup** — deep link lebih tricky di Android
4. **Wrangler local dev**: `wrangler dev` untuk test Worker lokal tanpa deploy
5. **D1 local**: tambahkan `--local` di semua wrangler d1 command untuk test tanpa modifikasi remote DB

---

## File Summary

### Baru dibuat
- `cloudflare-worker/src/index.ts`
- `cloudflare-worker/src/auth.ts`
- `cloudflare-worker/src/sync.ts`
- `cloudflare-worker/src/types.ts`
- `cloudflare-worker/schema.sql`
- `cloudflare-worker/wrangler.toml`
- `cloudflare-worker/package.json`
- `cloudflare-worker/tsconfig.json`
- `src/auth.ts`
- `src/sync.ts`
- `src/sync-dialog.ts`

### Dimodifikasi
- `src/types.ts` — tambah AuthSession, SyncPayload, SyncMeta (hanya lastSyncedAt), ConflictEntry
- `src/main.ts` — panggil performSync() + conflict handler
- `tauri.conf.json` — CSP update + deepLinkProtocols
- `src-tauri/Cargo.toml` — tambah tauri-plugin-deep-link
- `src-tauri/src/lib.rs` — register deep-link plugin
- `src-tauri/capabilities/default.json` — tambah deep-link:default
- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` — intent filter
- `src-tauri/src/lib.rs` — register deep-link plugin + tambah `get_file_mtime` command
- `.gitignore` — tambah auth.json + sync-meta.json
- **`src/collection-db.ts` — TIDAK DIUBAH** (Opsi B: tracking via file mtime, bukan manual)
