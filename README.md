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
- ✅ "Add to Collection" button (siap untuk Phase 3)

**Phase 3 — Collection Tracker (📋 Planned)**
- 📋 Add card to collection
- 📋 Locations (binder, deck box, storage)
- 📋 Quantity tracking
- 📋 Export: JSON, CSV, printable HTML
- 📋 Wishlist mode

**Phase 4 — Distribution (📋 Planned)**
- 📋 Windows installer (.msi)
- 📋 Android APK build

## 📊 Performance

Diukur di Windows 11, database 24.262 kartu (10 MB):

| Operation | Time |
|---|---|
| First fetch from GitHub | ~854 ms |
| Load from IndexedDB cache | **~33 ms** ⚡ |
| Parse JSON (24k cards) | ~23 ms |
| Filter + render list | **<20 ms** |

Speedup cache vs network: **~26× faster**

## 🛠️ Tech Stack

- **Framework**: [Tauri 2.x](https://tauri.app/)
- **Frontend**: Vanilla TypeScript + Vite (no component framework)
- **Storage**: IndexedDB (card cache + collection data)
- **Backend**: Rust (file I/O untuk Phase 3 export)
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
│   ├── main.ts             # App orchestration + hybrid cache loader
│   ├── cache.ts            # IndexedDB abstraction
│   ├── types.ts            # Card schema types
│   ├── filters.ts          # Pure filter logic (no DOM)
│   ├── filter-bar.ts       # Filter UI wiring
│   ├── virtual-list.ts     # Generic virtualized list renderer
│   ├── card-row.ts         # Card row DOM builder
│   ├── card-preview.ts     # Preview pane + lightbox
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

## 📝 Catatan

Project ini **eksperimen migrasi** dari Electron ke Tauri. Tcg_library Electron tetap di-maintain sebagai versi stable saat ini.

## 🔗 Related

- [vanguard-library-db](https://github.com/nerif7/vanguard-library-db) — Database scraper + viewer
- [tcg_library](https://github.com/nerif7/tcg_library) — Electron version (stable)
