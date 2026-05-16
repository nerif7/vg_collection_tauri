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
- ✅ Sort options — Collection: location/name/qty/date; Browse: name/grade↑/grade↓/owned; Wishlist: name/nation
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

**Pre-Phase 4 — Distribution Readiness (🔄 In Progress)**
- ✅ Portable storage refactor — JSON files in `{exe-dir}/userdata/` (IDB removed)
- ✅ App identity — `tauri.conf.json`: productName, identifier, window title, size
- ✅ App icon — all Tauri sizes generated (desktop + Android + iOS)
- ✅ CSP — configured in `tauri.conf.json` (image CDN: `en.cf-vanguard.com`)
- ✅ About dialog + startup progress bar + offline Browse tab UX
- ✅ Error handling audit — corrupted JSON shows toast + file path; write failures caught by global unhandledrejection handler
- 📋 Production build smoke test

**Phase 4 — Distribution (📋 Next)**
- 📋 ZIP portable `.exe` as `VGCollection-v0.1.0-win64.zip`, share with friends
- 📋 Android APK build (timeline TBD)

**Phase 5+ — Future (📋 Maybe)**
- 📋 Bulk edit: select multiple entries → change location or delete in bulk
- 📋 Manual dark/light mode toggle (currently follows OS)
- 📋 Deck Builder: Vanguard deck validation + export

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

### Build Production
```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

## 📂 Struktur Project

```
vg_collection_tauri/
├── src/                    # Frontend TypeScript
│   ├── main.ts             # App orchestration, tab routing, global state
│   ├── cache.ts            # IndexedDB abstraction (card DB cache)
│   ├── collection-db.ts    # IndexedDB CRUD for collection + wishlist stores
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
│   ├── collection-tab.ts   # Collection tab view + edit controls
│   ├── collection-edit.ts  # Edit section DOM builder (qty/move/remove controls)
│   ├── wishlist-tab.ts     # Wishlist tab view
│   ├── location-manager.ts # Location management modal
│   ├── confirm-dialog.ts   # Custom centered confirm dialog
│   ├── export-import.ts    # Export/Import backup logic (Tauri invoke + import dialog)
│   └── styles.css          # Light/dark theme
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
