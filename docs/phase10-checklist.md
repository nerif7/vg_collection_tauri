# Phase 10 — Cloud Sync: Checklist Implementasi

Checklist ini adalah ringkasan prosedural dari [phase10-cloud-sync.md](phase10-cloud-sync.md).
Untuk penjelasan detail setiap langkah, buka file tersebut.

---

## Phase 10a — Infrastructure & Backend

### Setup Akun & Tools (Manual, satu kali)

- [ ] **Langkah 1** — Buat akun Cloudflare (gratis) di cloudflare.com
- [ ] **Langkah 2** — Install Wrangler CLI: `npm install -g wrangler` → `wrangler login`
- [ ] **Langkah 3** — Buat D1 database: `wrangler d1 create vg-collection-sync` → catat `database_id`
- [ ] **Langkah 4** — Setup Google Cloud Console:
  - Buat project baru
  - Enable Google Identity Toolkit API
  - Buat OAuth Client ID → tipe **Desktop app**
  - Catat `Client ID` (tidak ada client secret — memang benar)

### Buat Worker Project

- [ ] **Langkah 5** — Buat folder `cloudflare-worker/`, init npm, install dependencies (`hono`, `jose`, `wrangler`)
- [ ] **Langkah 6** — Tulis `wrangler.toml` → isi `database_id` + `GOOGLE_CLIENT_ID`; set `WORKER_SECRET` via `wrangler secret put`
- [ ] **Langkah 7** — Buat `schema.sql` (tabel `users` + `sync_data`) → deploy ke D1
- [ ] **Langkah 8** — Tulis Worker code:
  - `cloudflare-worker/src/types.ts`
  - `cloudflare-worker/src/auth.ts` (verifyGoogleToken, issueJwt, authMiddleware)
  - `cloudflare-worker/src/sync.ts` (upsertUser, getSyncData, putSyncData, deleteUserData)
  - `cloudflare-worker/src/index.ts` (routes: POST /auth/google, GET /sync, PUT /sync, DELETE /sync)
- [ ] **Langkah 9** — Deploy: `wrangler deploy` → test dengan curl:
  - `GET /sync` tanpa token → harus return `{"error":"Unauthorized"}`
  - `POST /auth/google` dengan data fake → harus return `{"error":"Authentication failed"}`

**Checkpoint 10a selesai:** Worker live di `https://vg-collection-sync.USERNAME.workers.dev`

---

## Phase 10b — Auth di Tauri

- [ ] **Langkah 10** — Tambah `tauri-plugin-deep-link = "2"` di `src-tauri/Cargo.toml`
- [ ] **Langkah 11** — Update `tauri.conf.json`:
  - Tambah `"deepLinkProtocols": ["vgcollection"]`
  - Update CSP: tambah Worker URL + `accounts.google.com` + `oauth2.googleapis.com`
- [ ] **Langkah 12** — Update `src-tauri/src/lib.rs`:
  - Register `.plugin(tauri_plugin_deep_link::init())`
  - Tambah Rust command `get_file_mtime`
  - Daftarkan di `.invoke_handler()`
- [ ] **Langkah 13** — Edit `AndroidManifest.xml`: tambah `<intent-filter>` untuk scheme `vgcollection`
- [ ] **Langkah 14** — Buat `src/auth.ts`:
  - PKCE helpers (`generateCodeVerifier`, `generateCodeChallenge`)
  - Session load/save/clear via `userdata/auth.json`
  - `signInWithGoogle()` — buka browser → tunggu deep link callback → exchange code → simpan JWT
  - `signOut()` — DELETE /sync → hapus auth.json
- [ ] **Langkah 15** — Tambah types di `src/types.ts`: `AuthSession`, `SyncPayload`, `SyncMeta`, `ConflictEntry`

**Checkpoint 10b selesai:**
1. Klik "Sign in" → browser terbuka → login Google → app menerima callback
2. `userdata/auth.json` terisi `{token, email, expiresAt}`

---

## Phase 10c — Basic Sync

- [ ] **Langkah 16** — Buat `src/sync.ts`:
  - `loadSyncMeta` / `saveSyncMeta` via `userdata/sync-meta.json`
  - `getLocalModifiedAt()` — baca mtime 3 file via `invoke("get_file_mtime")` → max dari ketiganya
  - `fetchRemote` / `pushToRemote` — GET + PUT ke Worker
  - `buildLocalPayload()` — kumpulkan collection + wishlist + locations
  - `applyRemotePayload()` — overwrite 3 file lokal dengan data remote
  - `detectConflicts()` — bandingkan collection lokal vs remote per `cardCode|location|region`
  - `performSync()` — algoritma utama: not_logged_in / up_to_date / pushed / pulled / conflict / error
  - `resolveAndSync()` — simpan hasil pilihan conflict → push ke remote
- [ ] **Langkah 17** — Tambah debounce ke `sync.ts`:
  - `scheduleDebounce()` dengan 5 detik delay + maxWait 60 detik
  - `runSync()` wrapper dengan concurrent guard (`_syncInProgress` + `_pendingSync`)
- [ ] **Langkah 17b** — Wire ke `main.ts`:
  - `onChange` callback collection tab → tambah `scheduleDebounce()`
  - `onChange` callback wishlist tab → tambah `scheduleDebounce()`
- [ ] **Langkah 17c** — Panggil `runSync()` saat app dibuka di `main.ts`:
  - `"pulled"` → toast "Koleksi diperbarui dari cloud" + reload tab
  - `"error"` → toast "Sync gagal, bekerja offline"
  - `"conflict"` → placeholder (Phase 10d)
  - lainnya → silent

**Checkpoint 10c selesai:**
1. Login di PC → tambah kartu
2. Login Android dengan Google yang sama → buka app
3. Toast "Koleksi diperbarui dari cloud" muncul → kartu dari PC ada di Android

---

## Phase 10d — Conflict Resolution UI

- [ ] **Langkah 18** — Buat `src/sync-dialog.ts`:
  - `showConflictDialog()` — modal per-entry: tombol "Device ini: ×N" vs "Cloud: ×N"
  - Tombol bulk "Semua: Pakai Device" / "Semua: Pakai Cloud"
  - Tombol Batalkan + Simpan Pilihan
  - Focus trap + Esc to close
- [ ] **Langkah 19** — Wire conflict dialog ke `main.ts`:
  - Ganti placeholder `"conflict"` dengan panggil `showConflictDialog()`
  - Callback `onResolve`: build resolved collection → `resolveAndSync()` → toast + reload
  - Callback `onCancel`: toast "Sync dibatalkan"
- [ ] **Langkah 20** — Update `.gitignore`:
  - `userdata/auth.json`
  - `userdata/sync-meta.json`
  - `cloudflare-worker/node_modules/`

**Checkpoint 10d selesai:**
1. Edit kartu di dua device saat offline (qty berbeda)
2. Nyalakan internet di salah satu → conflict dialog muncul
3. Pilih versi untuk tiap kartu → simpan → data tersinkron

---

## File yang Dibuat / Diubah

### Baru dibuat
| File | Langkah |
|---|---|
| `cloudflare-worker/src/index.ts` | 8 |
| `cloudflare-worker/src/auth.ts` | 8 |
| `cloudflare-worker/src/sync.ts` | 8 |
| `cloudflare-worker/src/types.ts` | 8 |
| `cloudflare-worker/schema.sql` | 7 |
| `cloudflare-worker/wrangler.toml` | 6 |
| `cloudflare-worker/package.json` | 5 |
| `cloudflare-worker/tsconfig.json` | 5 |
| `src/auth.ts` | 14 |
| `src/sync.ts` | 16 |
| `src/sync-dialog.ts` | 18 |

### Dimodifikasi
| File | Langkah | Apa yang berubah |
|---|---|---|
| `src/types.ts` | 15 | Tambah AuthSession, SyncPayload, SyncMeta, ConflictEntry |
| `src/main.ts` | 17b, 17c, 19 | Wire scheduleDebounce + runSync + conflict handler |
| `tauri.conf.json` | 11 | deepLinkProtocols + CSP update |
| `src-tauri/Cargo.toml` | 10 | Tambah tauri-plugin-deep-link |
| `src-tauri/src/lib.rs` | 12 | Register deep-link plugin + get_file_mtime command |
| `src-tauri/capabilities/default.json` | 12 | Tambah deep-link:default |
| `AndroidManifest.xml` | 13 | intent-filter untuk vgcollection:// |
| `.gitignore` | 20 | auth.json + sync-meta.json + cloudflare-worker/node_modules |

### TIDAK diubah
- `src/collection-db.ts` — tracking via file mtime (OS), bukan manual

---

## Catatan Keamanan

> Jangan pernah commit file-file ini:
> - `cloudflare-worker/.dev.vars` — local Worker secrets
> - `userdata/auth.json` — session token (sudah di .gitignore setelah Langkah 20)
> - `userdata/sync-meta.json` — sudah di .gitignore setelah Langkah 20
> - `*.jks`, `*.keystore`, `keystore.properties` — Android signing (sudah di .gitignore)
