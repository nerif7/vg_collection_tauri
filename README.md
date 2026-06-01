# 🃏 VG Collection (Tauri)

Cardfight!! Vanguard collection tracker built with **Tauri 2 + TypeScript**.

Eksperimental rewrite dari [tcg_library (Electron)](https://github.com/nerif7/tcg_library) untuk eksplor:
- Bundle size yang lebih kecil (~5-8 MB vs ~85 MB Electron)
- Memory footprint lebih rendah (~80 MB vs ~250 MB Electron)
- Startup time lebih cepat (~500 ms vs ~2000 ms Electron)
- Cross-platform termasuk Android (Tauri 2.x mobile support)

## 🚀 Status

**Phase 1 — Foundation (✅ Done)**
- ✅ Tauri 2.x setup (Vanilla TypeScript + Vite)
- ✅ Fetch `cards.json` dari [vanguard-library-db](https://github.com/nerif7/vanguard-library-db) via GitHub raw
- ✅ IndexedDB cache (hybrid loader: cache-first ~33ms, GitHub fallback ~854ms)
- ✅ Cache freshness tracking + Force Refresh + Clear Cache
- ✅ Auto-load on startup (no manual button click needed)

**Phase 2 — Browse & Filter (✅ Done)**
- ✅ Virtualized list — 24k+ kartu render <1ms, scroll smooth
- ✅ Search: nama, kode kartu, race, clan, nation (debounced 200ms)
- ✅ Filter: set, nation, unit type, trigger
- ✅ Card preview pane (klik kartu → detail + gambar)
- ✅ Lightbox — klik gambar kartu untuk lihat full-size

**Phase 3 — Collection Tracker (✅ Done)**
- ✅ Three-tab navigation: **Collection** (default) | **Wishlist** | **Browse**
- ✅ Add card to collection with qty + free-form location (e.g. "Red Binder")
- ✅ Multiple entries per card — same card in different locations = separate rows
- ✅ Merge-on-duplicate — same `cardCode + location` adds qty to existing entry
- ✅ Collection stats: unique cards, total copies, wishlist count, location count
- ✅ Quantity controls with auto-save ([−] at 1 → confirm before delete)
- ✅ Partial move — move N copies from one location to another (e.g. 3 of 5 to "Box B")
- ✅ Location autocomplete from existing entries
- ✅ Wishlist — independent from collection, one-click add/remove
- ✅ Browse row badge — ×N total owned qty across all locations
- ✅ "Edit →" link in Browse preview jumps to Collection tab entry
- ✅ Search within collection (name, card code, location)
- ✅ Location management — locations stored separately; default "my collection" seeded on first run
- ✅ Manage Locations modal — add new locations from Collection toolbar
- ✅ Centered custom confirm dialog (replaces native browser popup)
- ✅ Sort options — Collection: location/name/code/qty/date; Browse: name/code/grade↑/grade↓/owned; Wishlist: name/code/nation
- ✅ Filter dropdowns — Collection: location/nation/type; Wishlist: nation/type
- ✅ Grid view toggle — all three tabs support list ↔ grid (virtualized, ~160px tiles, ×N badge)
- ✅ Grouped view — Collection tab can toggle flat list ↔ collapsible location groups (in-group sort: grade → name)

**Phase 3.5 — Export/Import + Auto-update + Polish (✅ Done)**
- ✅ Fix: `moveQtyInput.max` now syncs when qty is changed via +/− buttons
- ✅ Auto-update: startup SHA check vs GitHub → auto-refresh + toast if outdated; skip if rate-limited
- ✅ Fix: full move (move all copies) now merges with existing destination entry instead of creating duplicate
- ✅ Fix: `deduplicateCollection()` runs on startup to clean up any existing duplicates; Add button disabled during async
- ✅ Export: full backup JSON `{ collection, wishlist, meta }` via Tauri native save dialog
- ✅ Import: native open dialog → selectable Merge/Replace cards → two-step confirmation; warns about unknown card codes
- ✅ Fix: Browse tab ×N badges now update in real-time when Collection tab mutations happen (remove, qty change, move)
- ✅ Perf: replaced all estimated numbers with real measured values (cache 119ms, parse 17ms, GitHub ~9.4s)
- ✅ Refactor: extracted `buildEditSection` from `collection-tab.ts` → `collection-edit.ts` (callbacks pattern)
- ✅ Fix: grid tile image now portrait ratio (5:7, `object-fit: contain`) — full card visible, no cropping
- ✅ UX: import dialog centered + selectable mode cards + swapped button colors (Confirm=blue, Cancel=grey)

**Pre-Phase 4 — Distribution Readiness (✅ Done)**
- ✅ Portable storage refactor — JSON files in `{exe-dir}/userdata/` (IDB removed)
- ✅ App identity — `tauri.conf.json`: productName, identifier, window title, size
- ✅ App icon — all Tauri sizes generated (desktop + Android + iOS)
- ✅ CSP — configured in `tauri.conf.json` (image CDN: `en.cf-vanguard.com`)
- ✅ About dialog + startup progress bar + offline Browse tab UX
- ✅ Error handling audit — corrupted JSON shows toast + file path; write failures caught by global unhandledrejection handler
- ✅ Production build smoke test — 9.2 MB portable exe, all features verified

**Phase 4 — Distribution (✅ Done)**
- ✅ ZIP packaged as `VGCollection-v0.1.0-win64.zip` (2.8 MB)
- ✅ Published as [GitHub Release v0.1.0](https://github.com/nerif7/vg_collection_tauri/releases/tag/v0.1.0)
- ✅ Android dev build running on physical device via `npm run tauri android dev`

**Phase 5 — Mobile-first UI (✅ Done)**
- ✅ Full CSS rewrite with **Tailwind CSS v4** (`@import "tailwindcss"`, `@theme inline`)
- ✅ Mobile bottom navigation bar (Collection | Wishlist | Browse with icons)
- ✅ Preview pane: **bottom sheet** on mobile (85dvh, slides up), side panel on desktop (later changed to modal popup in Post-Phase 9)
- ✅ Collapsible stats bar on mobile — tap "Stats ›" to expand/collapse
- ✅ Filter bar: search-only by default on mobile, "⊟ Filter" button to expand dropdowns
- ✅ Header: active tab name only on mobile, full app name on desktop
- ✅ Manual dark/light mode toggle with `localStorage` persistence
- ✅ Safe area insets (`env(safe-area-inset-*)`) — bottom nav clears system nav bar
- ✅ Swipe-to-dismiss bottom sheet (scroll-aware, works from anywhere in sheet)
- ✅ Android back button: closes preview → double-tap exit with toast warning
- ✅ FOUC prevention: app hidden until JS init completes, then revealed
- ✅ Android APK: `get_userdata_dir()` uses `app_data_dir()` on Android, portrait locked

**Phase 5.5 — Refactor (✅ Done)**
- ✅ Extracted `stats-collapsible.ts` — eliminated 100% copy-paste between Collection + Wishlist tabs
- ✅ Extracted `theme.ts`, `back-button.ts`, `browse-stats.ts` — `main.ts` 558 → 353 lines
- ✅ Extracted `wishlist-row.ts` — consistent with other row builders
- ✅ Refactored `collection-db.ts` — generic `loadJsonFile<T>`/`saveJsonFile<T>`
- ✅ Moved GitHub fetch helpers to `cache.ts` — complete card data access layer in one module

**Phase 6 — UX Polish + Performance (✅ Done)**
- ✅ Animations: CSS 150ms tab fade, 200ms preview spring, button `:active` scale(0.97)
- ✅ Skeleton rows: animated shimmer while Collection/Wishlist loads from disk
- ✅ Empty states: descriptive text in all three tabs; Browse no-results shows inline "Clear filters" button
- ✅ Long-press context menu on collection rows (500ms touch / right-click) — Edit + Delete without opening preview
- ✅ Lightbox swipe-to-dismiss + Android back button support
- ✅ Filter active indicator: accent dot on "⊟ Filter" button when any filter is active
- ✅ Retry button inline in Browse status bar on fetch error
- ✅ Focus trap in all modals (confirm dialog, import dialog, location manager)
- ✅ ARIA labels on all icon-only buttons; `role="dialog"` + `aria-modal` on dialogs
- ✅ Keyboard navigation: Esc closes all modals, Enter/Space activates mode options
- ✅ `img.decoding="async"` on all card images — decode non-blocking, no main-thread jank
- ✅ Grouped view memo — skip full DOM re-render when entries+selected+collapsed unchanged
- ✅ Fix: Browse "Add to Collection" location dropdown remembers last used location across cards

**Phase 8 — JP Integration (✅ Done — v0.3.0)**
- ✅ JP card database support — load `cards_jp.json` (27.2k JP cards) alongside EN
- ✅ Unified `Card` shape — `cardNo`, `displayName`, `imageUrl`, `region` fields normalize EN + JP raw schemas
- ✅ Region preference: **EN** | **JP** | **BOTH** — persisted to `userdata/settings.json`
- ✅ Onboarding flow on first launch — region selection dialog blocks back button until choice is made
- ✅ BOTH mode: two-button header — **"Both"** opens Change Region dialog, **"EN ▾"/"JP ▾"** switches active region via context menu dropdown
- ✅ BOTH mode stats — Collection tab collapsible bar shows EN Unique/Copies/Wishlist + JP Unique/Copies/Wishlist side-by-side
- ✅ `CollectionEntry` + `WishlistEntry` now carry `region: "EN" | "JP"` — backward compat: old entries default to `"EN"`
- ✅ Stay on current tab when switching EN↔JP active region (no forced redirect to Collection)
- ✅ Default sort changed to **Code A–Z** across all three tabs
- ✅ Nation dropdown priority order: Dragon Empire → Dark States → Keter Sanctuary → Brandt Gate → Stoicheia → Lyrical Monasterio → EN + JP equivalents, rest alphabetical
- ✅ Nation filter nationless fix — Unicode-dash `nations: ["‐"]` treated as `nations: []`; **"-"** option shown when nationless cards exist
- ✅ JP scraper future-proof: `scrape_jp.js` now skips all Unicode-dash variants (not just ASCII `-`)
- ✅ Data fix: `fix_data.js` Fix 4 added; DAIGO (V-SS08/005) patched in `cards_jp.json`
- ✅ Refactor: `browse-tab.ts` extracted from `main.ts` — `main.ts` 649 → 451 lines

**Phase 9 — Offline Image Cache (✅ Done)**
- ✅ Card images cached locally in `userdata/images/` as base64 — works offline after first view
- ✅ Lazy caching: image downloaded in background when preview first opened; served from disk on subsequent opens
- ✅ Works in Collection, Wishlist, and Browse tab preview panes
- ✅ "Image Cache ▾" button in Browse toolbar → context menu: **Clear all** or **Clear orphaned** (cards not in collection)
- ✅ Rust: `list_dir_files` + `delete_file` commands added to `lib.rs`
- ✅ New module: `image-cache.ts` — `getImageSrc()`, `clearAllImageCache()`, `clearOrphanedImageCache()`

**Post-Phase 9 Fixes (✅ Done)**
- ✅ Android release APK signing — keystore + `signingConfigs` in `build.gradle.kts`; `keystore.properties` git-ignored
- ✅ Fix: `kotlin.incremental=false` in `gradle.properties` — Kotlin daemon cross-drive crash (project E:, cargo C:)
- ✅ Fix: Import backup on Android failed with "INVALID URL PATH" — added `tauri-plugin-fs`; `import_backup` now uses `app.fs().read()` to handle Android content URIs
- ✅ Fix: Browse "Add to Collection" location dropdown remembers last used location across cards
- ✅ UX: Desktop preview pane → centered modal popup (was: side panel); mobile bottom sheet unchanged
- ✅ UX: Modal 2-column layout — portrait card image left, details right; adaptive width fits card name

**Phase 10 — Cloud Sync (✅ Done — branch: `feature/cloud-sync`)**
- ✅ Google OAuth 2.0 + PKCE — Sign in with Google, no `client_secret` in client code
- ✅ Cloudflare Workers + D1 (SQLite) — serverless edge backend, free tier (~100k req/day)
- ✅ Worker-issued JWT (30 days) — Google token used once for identity; app uses own JWT so session stays alive
- ✅ Loopback OAuth redirect (`http://127.0.0.1:PORT/callback`) — works on desktop AND Android without custom URI scheme
- ✅ File-based OAuth callback fallback — writes `pending-oauth.txt` for Android background reliability
- ✅ Startup sync — auto-pull when remote is newer; auto-push when local has uncommitted changes
- ✅ Debounced push — 5s after last edit (maxWait 60s), silent background operation
- ✅ First-login dialog — shows diff summary: cards only in local, only in cloud, qty differences per card
- ✅ Per-entry conflict resolution dialog — choose local or cloud qty for each conflicting card; bulk "keep all local/cloud" option
- ✅ Clock skew fix — `lastLocalAt` snapshot (local mtime at sync time) separate from server timestamp prevents false `localDirty`
- ✅ Optimistic locking — PUT /sync with `expected_last_modified_at`; Worker returns 409 → client re-syncs
- ✅ Sync feedback — toast + sync button flashes ✓/⚠ after push/pull/error
- ✅ Sign out only clears local session — cloud data preserved; `sync-meta.json` reset so next sign-in shows dialog
- ✅ Update check sequenced before login on Android — prevents 10MB card download racing with OAuth network calls
- ✅ Auth retry with backoff — 3 attempts (0s → 2s → 6s) for Android WebView network cold start after OAuth

**Post-Phase 10 Refactor (✅ Done)**
- ✅ `main.ts` 624 → 223 lines — extracted 5 focused modules: `region.ts`, `card-loader.ts`, `sync-handlers.ts`, `startup.ts`, `collection-add-section.ts`
- ✅ `card-preview.ts` 231 → 115 lines — `buildCollectionAddSection` extracted to `collection-add-section.ts`
- ✅ Dead exports removed: `refreshWishlistTab`, `closeContextMenu`, `refreshSyncBtnState`, `computeDiff`, `handleFirstLoginSync`
- ✅ Debug logs removed from `collection-tab.ts` + `wishlist-tab.ts`
- ✅ Duplicate CSS rule removed (`styles.css`); "Gap X fix" code comments removed from Cloudflare Worker

**Phase 10+ — Future (📋 Maybe)**
- 📋 Bulk edit: select multiple entries → change location or delete in bulk
- 📋 Deck Builder: Vanguard deck validation + export
- 📋 Stats breakdown: per-set, per-nation, per-rarity collection analytics

## 📊 Performance

Diukur di Windows 11, database 24.262 kartu (10.09 MB):

| Operation | Time |
|---|---|
| First fetch from GitHub | **9405 ms** *(network-dependent)* |
| Load from IndexedDB cache | **119 ms** ⚡ |
| Parse JSON (24k cards) | **17 ms** |
| Total startup (cache hit) | **~135 ms** |
| Filter + render list | **<20 ms** *(estimated)* |

Speedup cache vs network: **~79× faster** (measured, network varies)

## 🛠️ Tech Stack

- **Framework**: [Tauri 2.x](https://tauri.app/)
- **Frontend**: Vanilla TypeScript + Vite (no component framework)
- **Styling**: Tailwind CSS v4 (utility-first, `@theme inline` for design tokens)
- **Storage**: JSON files in `{exe-dir}/userdata/` (portable — copy folder = copy data)
- **Backend**: Rust (file I/O commands for portable storage + export/import)
- **Data source**: [vanguard-library-db](https://github.com/nerif7/vanguard-library-db) (auto-updated weekly)

## 🏃 Run Locally

### Prerequisites
- Node.js 18+
- Rust toolchain (https://rustup.rs/)
- MSVC C++ Build Tools (Windows) atau Xcode (Mac)
- WebView2 (Windows, biasanya pre-installed)

### Setup
```bash
npm install
npm run tauri dev
```

⚠️ Build pertama akan lama (~5-15 menit) karena Rust compile ~200 crates. Subsequent builds jauh lebih cepat (~10-30 detik).

### Browser-only (tanpa Tauri)
```bash
npm run dev   # buka http://localhost:1420
```

### Build Production (Windows)
```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

### Android Dev (USB debugging)
```cmd
set ANDROID_HOME=C:\Android\SDK
set NDK_HOME=C:\Android\SDK\ndk\30.0.14904198
npm run tauri android dev
```

Prerequisites Android: Android Studio, SDK Platform 34, NDK 30.x, USB debugging enabled on device.

## 📂 Struktur Project

```
vg_collection_tauri/
├── src/                    # Frontend TypeScript
│   ├── main.ts             # App orchestration, tab routing, global card state + region logic
│   ├── cache.ts            # File-based card DB cache (userdata/cache/)
│   ├── collection-db.ts    # JSON file CRUD for collection + wishlist + locations
│   ├── types.ts            # All TypeScript interfaces and types
│   ├── filters.ts          # Pure filter logic (no DOM, no side effects)
│   ├── filter-bar.ts       # Filter UI wiring
│   ├── virtual-list.ts     # Generic virtualized list renderer (RAF-throttled)
│   ├── virtual-grid.ts     # Generic virtualized grid renderer (ResizeObserver, dynamic cols)
│   ├── tab-nav.ts          # Tab navigation wiring
│   ├── card-row.ts         # Card row DOM builder (Browse view)
│   ├── card-tile.ts        # Card tile DOM builder (grid view, all tabs)
│   ├── collection-row.ts   # Collection row DOM builder
│   ├── collection-grouped.ts # Grouped view renderer (collapsible location groups)
│   ├── card-preview.ts     # Preview pane + lightbox (Browse tab)
│   ├── browse-tab.ts       # Browse tab — virtual list/grid, filters, preview pane
│   ├── collection-tab.ts   # Collection tab view + edit controls
│   ├── collection-edit.ts  # Edit section DOM builder (qty/move/remove controls)
│   ├── wishlist-tab.ts     # Wishlist tab view
│   ├── location-manager.ts # Location management modal
│   ├── confirm-dialog.ts   # Custom centered confirm dialog
│   ├── export-import.ts    # Export/Import backup logic (Tauri invoke + import dialog)
│   ├── about-dialog.ts     # About dialog (version, links, GitHub)
│   ├── toast.ts            # Toast notification (shared across modules)
│   ├── theme.ts            # Dark/light mode toggle (localStorage persistence)
│   ├── back-button.ts      # Android back button handler (close previews, double-back exit)
│   ├── browse-stats.ts     # Browse tab status/stats UI helpers
│   ├── stats-collapsible.ts # Shared collapsible stats widget (Collection + Wishlist)
│   ├── context-menu.ts     # Generic floating context menu (long-press / right-click)
│   ├── focus-trap.ts       # Modal focus trap (Tab cycles within dialog)
│   ├── swipe-dismiss.ts    # Swipe-to-dismiss utility for bottom sheet (mobile)
│   ├── settings.ts         # Load/save region preference + active region to userdata/settings.json
│   ├── onboarding.ts       # First-launch region selection dialog
│   ├── auth.ts             # Google OAuth 2.0 PKCE flow, session storage (userdata/auth.json)
│   ├── sync.ts             # Cloud sync orchestrator: push/pull/debounce/conflict detection
│   ├── sync-menu.ts        # Sync button UI + sign-in/sign-out dropdown menu
│   ├── sync-dialog.ts      # First-login diff dialog + per-entry conflict resolution dialog
│   └── styles.css          # Tailwind CSS v4 — design tokens, responsive layout, dark mode
├── cloudflare-worker/      # Serverless backend (Cloudflare Workers + D1)
│   ├── src/index.ts        # Hono router: POST /auth/google, GET/PUT/DELETE /sync
│   ├── src/auth.ts         # Google token exchange + Worker-issued JWT
│   ├── src/sync.ts         # D1 CRUD (upsertUser, getSyncData, putSyncData, deleteUserData)
│   ├── schema.sql          # D1 SQLite schema (users + sync_data tables)
│   └── wrangler.toml       # Cloudflare deployment config
├── src-tauri/              # Rust backend
│   ├── src/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
├── index.html
├── package.json
└── tsconfig.json
```

## 📚 Learning Documentation

This project is also a portfolio and learning exercise. Two companion documents explain
the reasoning behind every technical decision:

- **[LEARN.md](LEARN.md)** — Architecture overview, decision log, and full code walkthroughs
  for IndexedDB, VirtualList/Grid algorithm, TypeScript module design, and Tauri internals
- **[REFLECTION.md](REFLECTION.md)** — Bugs introduced, lessons learned, and honest
  retrospective on what I'd do differently

## 📝 Catatan

Project ini **eksperimen migrasi** dari Electron ke Tauri. Tcg_library Electron tetap di-maintain sebagai versi stable saat ini.

## 🔗 Related

- [vanguard-library-db](https://github.com/nerif7/vanguard-library-db) — Database scraper + viewer
- [tcg_library](https://github.com/nerif7/tcg_library) — Electron version (stable)
