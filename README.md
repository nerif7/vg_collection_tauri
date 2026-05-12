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
- ✅ IndexedDB cache (hybrid loader)
- ✅ Cache freshness tracking
- ✅ Force refresh + Clear cache controls

**Phase 2 — Browse & Filter (⏳ Next)**
- ⏳ Search by name + cardCode
- ⏳ Filter: set, nation, unitType, trigger
- ⏳ Virtualized list (handle 24k+ cards smoothly)
- ⏳ Card preview pane dengan gambar

**Phase 3 — Collection Tracker (📋 Planned)**
- 📋 Add card to collection
- 📋 Locations (binder, deck box)
- 📋 Quantity tracking
- 📋 Statistics

**Phase 4 — Distribution (📋 Planned)**
- 📋 Auto-updater
- 📋 Windows installer (.msi)
- 📋 Android APK build

## 📊 Performance (POC)

Diukur di Windows 11, dengan database 24.262 kartu (10 MB):

| Operation | Time |
|---|---|
| First fetch from GitHub | 854 ms |
| Load from IndexedDB cache | **33 ms** ⚡ |
| Parse JSON (24k cards) | 23 ms |

Speedup cache vs network: **~26× faster**

## 🛠️ Tech Stack

- **Framework**: [Tauri 2.x](https://tauri.app/)
- **Frontend**: Vanilla TypeScript + Vite
- **Storage**: IndexedDB (cards cache + collection)
- **Backend**: Rust (sentuh nanti untuk file ops)
- **Data source**: [vanguard-library-db](https://github.com/nerif7/vanguard-library-db) (auto-updated weekly)

## 🏃 Run Locally

### Prerequisites
- Node.js 18+
- Rust toolchain (https://rustup.rs/)
- MSVC C++ Build Tools (Windows) atau Xcode (Mac) atau equivalent
- WebView2 (Windows, biasanya pre-installed)

### Setup
```bash
npm install
npm run tauri dev
```

⚠️ Build pertama akan lama (~5-15 menit) karena Rust compile ~200 crates. Subsequent builds akan jauh lebih cepat (~10-30 detik).

### Build Production
```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

## 📂 Struktur Project

```
vg_collection_tauri/
├── src/                       # Frontend TypeScript
│   ├── main.ts                # Entry point + hybrid loader
│   ├── cache.ts               # IndexedDB wrapper
│   ├── types.ts               # Card schema types
│   └── styles.css
├── src-tauri/                 # Rust backend
│   ├── src/
│   ├── Cargo.toml
│   ├── tauri.conf.json        # Window config + CSP
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
