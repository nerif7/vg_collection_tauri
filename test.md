# VG Collection — Test Log

Dokumen ini merekap semua test case yang sudah diverifikasi, supaya tidak ada yang diuji ulang sia-sia.

**Legend:**
- ✅ Verified — diverifikasi via static code review + tsc/cargo check
- 🔲 Manual — perlu dijalankan di app nyata
- ❌ Bug found — ditemukan dan sudah di-fix

---

## Phase 9 — Offline Image Cache (`image-cache.ts`)

### Core: `getImageSrc(cardNo, cdnUrl)`

| # | Scenario | Method | Status |
|---|---|---|---|
| 1 | `cdnUrl = null` → return null | Static | ✅ |
| 2 | Mem cache hit → return data URL instantly, no IPC | Static | ✅ |
| 3 | Disk hit (file ada) → read base64, set memCache, return data URL | Manual | ✅ verified — b64 508k chars returned, no re-download |
| 4 | Disk miss + online → return CDN URL, trigger background download | Manual | ✅ verified — files muncul di userdata/images/ |
| 5 | Disk miss + offline → return CDN URL, download fails silently, retry next open | Static | ✅ |
| 6 | Restart app → memCache kosong, disk hit → data URL ter-load kembali | Manual | ✅ verified — offline test pass |
| 7 | Preview dibuka 2× cepat sebelum download selesai → `pendingDownloads` guard, 1 download saja | Static | ✅ |
| 8 | Download selesai, preview ke-2 dibuka → memCache hit | Static | ✅ |
| 9 | Gambar ditampilkan offline setelah pernah di-cache | Manual | ✅ verified — offline restart, gambar tampil dari disk |
| 10 | Broken image saat offline + belum pernah di-cache | Manual | 🔲 |

### `arrayBufferToBase64`

| # | Scenario | Method | Status |
|---|---|---|---|
| 11 | Buffer ukuran tepat 8192 bytes (1 chunk penuh) | Static | ✅ |
| 12 | Buffer ukuran < 8192 bytes (chunk terakhir pendek) — `subarray` auto-clamp | Static | ✅ |
| 13 | Buffer ukuran > 8192 bytes (multiple chunks) | Static | ✅ |
| 14 | Buffer kosong (0 bytes) → `btoa("")` = `""` → data URL valid | Static | ✅ |

### `fileKey(cardNo)`

| # | Scenario | Method | Status |
|---|---|---|---|
| 15 | `"V-BT01/001EN"` → `"V-BT01_001EN"` (slash disanitasi) | Static | ✅ |
| 16 | `"D-BT01/001JP"` → `"D-BT01_001JP"` | Static | ✅ |
| 17 | CardNo tanpa karakter khusus → tidak berubah | Static | ✅ |
| 18 | Karakter Windows-reserved (`<>:"\\|?*`) → diganti `_` | Static | ✅ |

### `mimeFor(url)`

| # | Scenario | Method | Status |
|---|---|---|---|
| 19 | URL berisi `.png` → `image/png` | Static | ✅ |
| 20 | URL berisi `.gif` → `image/gif` | Static | ✅ |
| 21 | URL berisi `.webp` → `image/webp` | Static | ✅ |
| 22 | URL tanpa ekstensi dikenal → default `image/jpeg` | Static | ✅ |
| 23 | MIME konsisten antara write dan read (cdnUrl sama) | Static | ✅ |

### `clearAllImageCache()`

| # | Scenario | Method | Status |
|---|---|---|---|
| 24 | Dir `images/` tidak ada → `list_dir_files` return `[]`, return 0 | Static | ✅ |
| 25 | Toast "No cached images found" saat count = 0 | Static | ✅ |
| 26 | Dir ada, N file → semua dihapus, memCache.clear(), return N | Static | ✅ |
| 27 | Download aktif saat clear → file mungkin re-dibuat setelah dihapus, harmless | Static | ✅ |
| 28 | Confirm dialog muncul sebelum delete | Manual | 🔲 |
| 29 | Toast muncul setelah delete selesai | Manual | 🔲 |

### `clearOrphanedImageCache(collectionCardNos)`

| # | Scenario | Method | Status |
|---|---|---|---|
| 30 | File ada di disk, cardNo ada di collection → tidak dihapus | Static | ✅ |
| 31 | File ada di disk, cardNo tidak di collection → dihapus | Static | ✅ |
| 32 | Browse-only cached images (tidak di collection) → dihapus | Static | ✅ |
| 33 | BOTH mode: cardNo EN + JP keduanya di-protect | Static | ✅ (`getAllCollectionCardNos` all regions) |
| 34 | Tidak ada orphan → return 0, toast "No orphaned images found" | Static | ✅ |
| 35 | `orphans.length > 0` → `memCache.clear()` agar disk re-read | Static | ✅ |
| 36 | Confirm message menyebut Browse-only cards | Static | ✅ |

### CSP (Critical — pernah bug)

| # | Scenario | Method | Status |
|---|---|---|---|
| 37 | ❌ `fetch(cdnUrl)` diblok CSP karena CDN tidak di `connect-src` | Static | ✅ Fixed |
| 38 | CDN domains ditambah ke `connect-src` di `tauri.conf.json` | Static | ✅ |
| 39 | Download image via Rust `download_image` command berhasil (bypass CORS + User-Agent) | Manual | ✅ verified — files ter-cache di userdata/images/ |

### Path & Storage

| # | Scenario | Method | Status |
|---|---|---|---|
| 40 | Windows path mixed separator `C:\userdata/images/card` → Rust `Path::new()` normalize | Static | ✅ |
| 41 | Android path `/data/.../files/images/card` (forward slash) | Static | ✅ |
| 42 | `write_text_file` auto-create dir `images/` jika belum ada | Static | ✅ (Rust `create_dir_all`) |
| 43 | Path dengan spasi (nama user Windows) | Static | ✅ |
| 44 | File yang di-cache portable (copy `userdata/` = gambar ikut) | Static | ✅ |

### Error Handling

| # | Scenario | Method | Status |
|---|---|---|---|
| 45 | Download gagal (network error) → error logged, retry next open | Static | ✅ |
| 46 | ❌ CDN return 404 tanpa User-Agent (hotlink protection) → fixed: add Chrome UA header | Manual | ✅ verified |
| 47 | `clearAllImageCache` throws → global `unhandledrejection` handler → toast | Static | ✅ |
| 48 | `clearOrphanedImageCache` throws → global handler → toast | Static | ✅ |
| 49 | File rusak/truncated di disk → broken image, user bisa manual clear | Static | ✅ (acceptable) |

---

## Phase 9 — UI: "Image Cache ▾" button

| # | Scenario | Method | Status |
|---|---|---|---|
| 50 | Button ada di Browse tab actions bar | Static | ✅ |
| 51 | Button disabled saat startup loading | Static | ✅ (`setControlsDisabled`) |
| 52 | Klik button → context menu muncul dengan 2 opsi | Manual | 🔲 |
| 53 | Context menu posisi di bawah button, tidak keluar layar | Manual | 🔲 |
| 54 | Opsi "Clear all image cache" → confirm → hapus → toast | Manual | 🔲 |
| 55 | Opsi "Clear orphaned images" → confirm → hapus → toast | Manual | 🔲 |
| 56 | Cancel confirm → tidak ada yang dihapus | Manual | 🔲 |
| 57 | Mobile (Android): context menu muncul dan bisa di-tap | Manual | 🔲 |

---

## Phase 9 — Preview image di 3 tab

| # | Scenario | Method | Status |
|---|---|---|---|
| 58 | Browse tab preview: gambar online load dari CDN, background cache | Manual | 🔲 |
| 59 | Browse tab preview: gambar offline load dari disk (data URL) | Manual | 🔲 |
| 60 | Collection tab preview: gambar ter-load (online + offline) | Manual | 🔲 |
| 61 | Wishlist tab preview: gambar ter-load (online + offline) | Manual | 🔲 |
| 62 | Lightbox (Browse): src tetap sama dengan preview (data URL atau CDN) | Static | ✅ (`src` captured as const) |
| 63 | `card.imageUrl = null` → tidak ada img element, tidak crash | Static | ✅ |
| 64 | Wishlist `renderPreview` async error → propagate ke global handler → toast | Static | ✅ (`.catch` dihapus) |

---

## Phase 8 — Browse Tab Extraction (`browse-tab.ts`)

| # | Scenario | Method | Status |
|---|---|---|---|
| 65 | `initBrowseTab` wiring: sort, view toggle, filter, guard, preview callbacks | Static | ✅ tsc |
| 66 | `loadBrowseTab` — load EN cards, filter bar muncul, list ter-render | Manual | 🔲 |
| 67 | `reloadBrowseTab` — region switch EN→JP: list destroy + dropdown repopulate | Manual | 🔲 |
| 68 | `refreshBrowseQtyMap` — collection berubah, badge ×N update tanpa rebuild list | Manual | 🔲 |
| 69 | `clearBrowseTab` — cache di-clear, filter bar hilang, meta "— cards" | Manual | 🔲 |
| 70 | `closeBrowsePreview` — preview pane tertutup saat pindah tab | Manual | 🔲 |
| 71 | `updateBrowseAvailability` — tab button unavailable saat allCards = [] | Manual | 🔲 |
| 72 | `getBrowseBackPanes` — back button menutup lightbox dulu, lalu preview | Manual | 🔲 |
| 73 | `main.ts` 451 lines (down dari 649), TypeScript clean | Static | ✅ tsc |

---

## Phase 8 — JP Integration

| # | Scenario | Method | Status |
|---|---|---|---|
| 74 | EN only mode: hanya EN cards di-load, region button "EN" | Manual | 🔲 |
| 75 | JP only mode: hanya JP cards di-load, region button "JP" | Manual | 🔲 |
| 76 | BOTH mode: EN + JP di-load, header "Both" + "EN ▾" | Manual | 🔲 |
| 77 | Switch EN↔JP di BOTH mode: list rebuild, collection reload, tab tidak berubah | Manual | 🔲 |
| 78 | Onboarding dialog muncul di first launch, back button diblok | Manual | 🔲 |
| 79 | Change Region dialog (klik "Both") → reload app | Manual | 🔲 |
| 80 | Collection entries EN + JP coexist di file yang sama | Manual | 🔲 |
| 81 | Old entries tanpa `region` field → default "EN" | Static | ✅ |
| 82 | Nation filter: Dragon Empire muncul pertama | Manual | 🔲 |
| 83 | Nation filter: nationless cards (Unicode-dash) ter-detect sebagai tidak punya nation | Static | ✅ |
| 84 | BOTH stats: EN Unique/Copies + JP Unique/Copies side-by-side | Manual | 🔲 |
| 85 | CSP: JP card image dari `cf-vanguard.com` ter-load di `<img>` | Manual | 🔲 |

---

## Rust Commands (`lib.rs`)

| # | Scenario | Method | Status |
|---|---|---|---|
| 86 | `list_dir_files` — dir tidak ada → return `[]` | Static | ✅ |
| 87 | `list_dir_files` — dir ada, berisi file → return filenames | Static | ✅ |
| 88 | `list_dir_files` — hanya file (bukan subdirectory) yang dikembalikan | Static | ✅ |
| 89 | `list_dir_files` — filename non-ASCII (karakter Jepang) | Static | ✅ (filter_map `into_string().ok()` skip invalid) |
| 90 | `delete_file` — file tidak ada → no-op, tidak error | Static | ✅ |
| 91 | `delete_file` — file ada → terhapus | Static | ✅ |
| 92 | `write_text_file` — auto-create parent dir | Static | ✅ (`create_dir_all`) |
| 93 | `read_text_file` — file tidak ada → return `None` | Static | ✅ |
| 94 | `cargo check` bersih tanpa error/warning | Static | ✅ |

---

## Regresi — Fitur Lama

| # | Scenario | Method | Status |
|---|---|---|---|
| 95 | Browse filter + sort masih berfungsi setelah extraction | Static | ✅ tsc |
| 96 | Collection add/edit/move/delete masih berfungsi | Manual | 🔲 |
| 97 | Export/import backup masih berfungsi | Manual | 🔲 |
| 98 | Dark/light mode toggle | Manual | 🔲 |
| 99 | Force Refresh card DB | Manual | 🔲 |
| 100 | Clear card DB cache (bukan image cache) | Manual | 🔲 |
| 101 | Android back button: lightbox → preview → exit double-tap | Manual | 🔲 |
| 102 | Swipe-to-dismiss bottom sheet (mobile) | Manual | 🔲 |
| 103 | Context menu collection row (long press / right-click) | Manual | 🔲 |
| 104 | `tsc --noEmit` bersih | Static | ✅ |

---

## Phase 1 — Card Database & Cache

### First Launch / Network Load

| # | Scenario | Method | Status |
|---|---|---|---|
| 105 | First launch: `userdata/cache/` tidak ada → fetch dari GitHub | Manual | 🔲 |
| 106 | Progress bar muncul selama fetch berlangsung | Manual | 🔲 |
| 107 | Status bar menampilkan "Fetching cards from GitHub…" | Manual | 🔲 |
| 108 | Selesai fetch → Browse tab ter-load, card count muncul di status | Manual | 🔲 |
| 109 | Offline first launch → error state tampil, retry button muncul | Manual | 🔲 |
| 110 | Retry button → re-trigger fetch saat kembali online | Manual | 🔲 |

### Cache Hit (Restart)

| # | Scenario | Method | Status |
|---|---|---|---|
| 111 | Restart app → load dari `userdata/cache/cards.json` (< 200 ms) | Manual | 🔲 |
| 112 | Cache status bar: "X cards · cached Y days ago · SHA abc123" | Manual | 🔲 |
| 113 | Cache age < 7 hari → tidak auto-fetch | Static | ✅ (staleness threshold logic) |
| 114 | `cards-meta.json` ada, SHA sama → tidak re-fetch | Static | ✅ |

### Force Refresh

| # | Scenario | Method | Status |
|---|---|---|---|
| 115 | Klik "Force Refresh" → fetch ulang dari GitHub, progress bar muncul | Manual | 🔲 |
| 116 | Force Refresh di-disable saat loading berlangsung | Manual | 🔲 |
| 117 | Selesai refresh → toast "Cards updated — X cards loaded" | Manual | 🔲 |
| 118 | Force Refresh tidak menghapus collection/wishlist | Manual | 🔲 |

### Clear Card DB Cache

| # | Scenario | Method | Status |
|---|---|---|---|
| 119 | Clear Cache → `cards.json` + `cards-meta.json` dihapus | Manual | 🔲 |
| 120 | Clear Cache → Browse tab cleared, status "— cards" | Manual | 🔲 |
| 121 | Clear Cache tidak menghapus collection/wishlist/image cache | Manual | 🔲 |

### Auto-update (SHA Check)

| # | Scenario | Method | Status |
|---|---|---|---|
| 122 | Startup: "Checking for updates…" spinner muncul sebentar | Manual | 🔲 |
| 123 | SHA berbeda dari cache → auto-fetch + toast "Cards updated" | Manual | 🔲 |
| 124 | SHA sama → tidak fetch, spinner hilang senyap | Manual | 🔲 |
| 125 | GitHub API rate-limited (403) → `fetchLatestCommitSha` return null, silent skip | Static | ✅ |
| 126 | Network error saat SHA check → silent skip, tidak crash | Static | ✅ |
| 127 | EN + JP SHA check berjalan secara independen | Static | ✅ (terpisah per fungsi) |

---

## Phase 2 — Browse Tab: Search & Filter

### Search

| # | Scenario | Method | Status |
|---|---|---|---|
| 128 | Search by card name (case-insensitive) | Manual | 🔲 |
| 129 | Search by card code (e.g. "V-BT01") | Manual | 🔲 |
| 130 | Search by race (e.g. "Human") | Manual | 🔲 |
| 131 | Search debounce: mengetik cepat → filter hanya trigger 1× per 200ms | Manual | 🔲 |
| 132 | Hapus search text → semua kartu kembali | Manual | 🔲 |
| 133 | Search + filter gabungan (search + nation + type) | Manual | 🔲 |

### Filter Dropdowns

| # | Scenario | Method | Status |
|---|---|---|---|
| 134 | Filter by Set (dropdown) → hanya kartu dari set itu | Manual | 🔲 |
| 135 | Filter by Nation → hanya kartu dari nation itu | Manual | 🔲 |
| 136 | Filter by Unit Type → Grade, Normal Unit, Trigger Unit, etc. | Manual | 🔲 |
| 137 | Filter by Trigger → Front, Draw, Heal, Critical | Manual | 🔲 |
| 138 | Reset semua filter → semua kartu muncul kembali | Manual | 🔲 |
| 139 | "Clear filters" button muncul di empty state (no results) | Manual | 🔲 |
| 140 | Klik "Clear filters" button → filter direset, kartu muncul | Manual | 🔲 |
| 141 | Filter active dot muncul di "⊟ Filter" button saat ada filter aktif | Manual | 🔲 |
| 142 | Filter active dot hilang saat semua filter direset | Manual | 🔲 |

### Sort

| # | Scenario | Method | Status |
|---|---|---|---|
| 143 | Sort: Name A–Z | Manual | 🔲 |
| 144 | Sort: Code A–Z (default) | Manual | 🔲 |
| 145 | Sort: Grade ↑ | Manual | 🔲 |
| 146 | Sort: Grade ↓ | Manual | 🔲 |
| 147 | Sort: Owned (kartu dengan badge ×N muncul di atas) | Manual | 🔲 |

### Virtualized List Performance

| # | Scenario | Method | Status |
|---|---|---|---|
| 148 | 24k+ kartu di-render tanpa jank (scroll smooth) | Manual | 🔲 |
| 149 | Hanya ~20–30 DOM node di-render sekaligus (bisa cek devtools) | Manual | 🔲 |
| 150 | Scroll ke bawah + scroll ke atas → list konsisten | Manual | 🔲 |

### Grid View

| # | Scenario | Method | Status |
|---|---|---|---|
| 151 | Toggle "⊞ Grid" → list berganti ke grid tiles | Manual | 🔲 |
| 152 | Grid: rasio gambar portrait (5:7), tidak terpotong | Manual | 🔲 |
| 153 | Grid: badge ×N tampil di tile untuk kartu yang di-owned | Manual | 🔲 |
| 154 | Toggle "☰ List" → kembali ke list | Manual | 🔲 |

---

## Phase 2 — Browse Tab: Preview Pane & Lightbox

### Preview Pane

| # | Scenario | Method | Status |
|---|---|---|---|
| 155 | Klik row → preview pane terbuka (slide-in) | Manual | 🔲 |
| 156 | Preview: gambar kartu tampil | Manual | 🔲 |
| 157 | Preview: card name, code, grade, nation, race, clan, rarity | Manual | 🔲 |
| 158 | Preview: tombol "Add to Collection" + qty field + location field | Manual | 🔲 |
| 159 | Preview: "Add to Wishlist" button | Manual | 🔲 |
| 160 | Preview: "Already owned: ×N Location" chips jika sudah di collection | Manual | 🔲 |
| 161 | "Edit →" link di preview → switch ke Collection tab, highlight entry | Manual | 🔲 |
| 162 | Row highlight (left border) saat dipilih | Manual | 🔲 |
| 163 | Klik row lain → preview update ke kartu baru | Manual | 🔲 |
| 164 | Preview pane menutup saat pindah tab | Manual | 🔲 |

### Lightbox

| # | Scenario | Method | Status |
|---|---|---|---|
| 165 | Klik gambar di preview → lightbox overlay terbuka (full-size) | Manual | 🔲 |
| 166 | Lightbox: gambar memenuhi layar, bisa zoom | Manual | 🔲 |
| 167 | Lightbox tutup dengan Esc | Manual | 🔲 |
| 168 | Lightbox tutup dengan klik backdrop | Manual | 🔲 |
| 169 | Lightbox tutup dengan swipe-to-dismiss (mobile) | Manual | 🔲 |
| 170 | Android back button: lightbox → close lightbox (bukan close preview) | Manual | 🔲 |

### Add to Collection from Browse

| # | Scenario | Method | Status |
|---|---|---|---|
| 171 | Isi qty + location → klik "Add to Collection" → entry terbuat | Manual | 🔲 |
| 172 | cardCode + location sudah ada → qty di-merge (tidak buat entry baru) | Manual | 🔲 |
| 173 | Setelah add: form reset (qty=1, location=""), "Already owned" update | Manual | 🔲 |
| 174 | Location autocomplete dari existing locations | Manual | 🔲 |
| 175 | "Add to Wishlist" → button label berganti "Remove from Wishlist" | Manual | 🔲 |
| 176 | Kartu bisa di collection DAN wishlist sekaligus | Manual | 🔲 |

---

## Phase 3 — Collection Tab

### Add Entry

| # | Scenario | Method | Status |
|---|---|---|---|
| 177 | Add dari Browse (lihat #171–#173) | — | — |
| 178 | Add button disabled selama async `addToCollection` berjalan | Static | ✅ |
| 179 | Entry muncul di Collection tab setelah add | Manual | 🔲 |
| 180 | Badge ×N di Browse row update real-time setelah add | Manual | 🔲 |

### List & Display

| # | Scenario | Method | Status |
|---|---|---|---|
| 181 | Collection tab: satu row per entry (bukan per cardCode) | Manual | 🔲 |
| 182 | Row menampilkan: card name, card code, ×N badge, location | Manual | 🔲 |
| 183 | Default sort: Code A–Z | Manual | 🔲 |
| 184 | Skeleton rows tampil selama load dari disk | Manual | 🔲 |
| 185 | Empty state: "Add cards from Browse tab" | Manual | 🔲 |

### Sort & Filter

| # | Scenario | Method | Status |
|---|---|---|---|
| 186 | Sort: Location, Name, Code, Qty, Date Added | Manual | 🔲 |
| 187 | Filter by Location | Manual | 🔲 |
| 188 | Filter by Nation | Manual | 🔲 |
| 189 | Filter by Unit Type | Manual | 🔲 |
| 190 | Search: name, card code, location | Manual | 🔲 |

### Preview & Edit

| # | Scenario | Method | Status |
|---|---|---|---|
| 191 | Klik row → preview pane terbuka dengan edit section | Manual | 🔲 |
| 192 | Qty [+] → increment, auto-save | Manual | 🔲 |
| 193 | Qty [−] saat qty > 1 → decrement, auto-save | Manual | 🔲 |
| 194 | Qty [−] saat qty = 1 → confirm dialog "Remove this entry?" | Manual | 🔲 |
| 195 | Confirm remove di qty control → entry terhapus, preview tutup | Manual | 🔲 |
| 196 | Cancel remove di qty control → tidak ada perubahan | Manual | 🔲 |
| 197 | Location edit → auto-save on blur | Manual | 🔲 |
| 198 | Location autocomplete dari existing locations | Manual | 🔲 |
| 199 | `moveQtyInput.max` sinkron dengan qty saat qty berubah via +/− | Static | ✅ |

### Move (Partial Move)

| # | Scenario | Method | Status |
|---|---|---|---|
| 200 | Move N copies → pilih qty + destination location → entry sumber berkurang | Manual | 🔲 |
| 201 | Move ke location yang sudah ada → qty di-merge (bukan buat entry baru) | Static | ✅ |
| 202 | Move semua copies (full move) → entry sumber terhapus, destination bertambah | Manual | 🔲 |

### Remove

| # | Scenario | Method | Status |
|---|---|---|---|
| 203 | "Remove from Collection" → confirm dialog | Manual | 🔲 |
| 204 | Confirm → entry dihapus, preview tutup, list update | Manual | 🔲 |
| 205 | Cancel → tidak ada perubahan | Manual | 🔲 |
| 206 | Browse ×N badge update setelah remove | Manual | 🔲 |

### Context Menu (Long-press / Right-click)

| # | Scenario | Method | Status |
|---|---|---|---|
| 207 | Long-press 500ms di collection row (mobile) → context menu muncul | Manual | 🔲 |
| 208 | Right-click di collection row (desktop) → context menu muncul | Manual | 🔲 |
| 209 | Context menu: "Edit" → preview pane terbuka | Manual | 🔲 |
| 210 | Context menu: "Delete" → confirm dialog → entry dihapus (tanpa buka preview) | Manual | 🔲 |

### Duplicate Prevention

| # | Scenario | Method | Status |
|---|---|---|---|
| 211 | `deduplicateCollection()` jalan saat startup — duplikat di-merge | Static | ✅ |
| 212 | Add dengan `cardCode + location + region` yang sama → merge, bukan entry baru | Static | ✅ |

### Grouped View

| # | Scenario | Method | Status |
|---|---|---|---|
| 213 | Toggle "⊞ Grouped" → list berganti ke collapsible location groups | Manual | 🔲 |
| 214 | Klik location header → collapse/expand group | Manual | 🔲 |
| 215 | In-group sort: grade → name | Manual | 🔲 |
| 216 | Grouped view memo: tidak re-render saat entries+selected+collapsed tidak berubah | Static | ✅ |

### Stats Bar

| # | Scenario | Method | Status |
|---|---|---|---|
| 217 | Stats: unique cards (distinct cardCodes) | Manual | 🔲 |
| 218 | Stats: total copies (sum of all qty) | Manual | 🔲 |
| 219 | Stats: wishlist count | Manual | 🔲 |
| 220 | Stats: location count (distinct non-empty locations) | Manual | 🔲 |
| 221 | BOTH mode stats: EN Unique/Copies/Wishlist + JP Unique/Copies/Wishlist side-by-side | Manual | 🔲 |
| 222 | Stats bar collapsible di mobile (tap "Stats ›" untuk expand) | Manual | 🔲 |

---

## Phase 3 — Wishlist Tab

| # | Scenario | Method | Status |
|---|---|---|---|
| 223 | Wishlist tab: row menampilkan card name + code | Manual | 🔲 |
| 224 | Skeleton rows tampil selama load | Manual | 🔲 |
| 225 | Empty state: "Wishlist is empty — add cards from Browse tab" | Manual | 🔲 |
| 226 | Klik row → preview pane dengan "Remove from Wishlist" button | Manual | 🔲 |
| 227 | "Remove from Wishlist" → langsung hapus (no confirm dialog) | Manual | 🔲 |
| 228 | Stats: wishlist count update setelah remove | Manual | 🔲 |
| 229 | Sort: Name, Code, Nation | Manual | 🔲 |
| 230 | Filter: Nation, Unit Type | Manual | 🔲 |
| 231 | Search: name, card code | Manual | 🔲 |
| 232 | Grid view toggle di Wishlist | Manual | 🔲 |
| 233 | Wishlist preview: gambar ter-load (lihat #61) | Manual | 🔲 |
| 234 | Kartu bisa di collection DAN wishlist sekaligus | Manual | 🔲 |
| 235 | EN wishlist entries tidak muncul di JP wishlist view (region filter) | Manual | 🔲 |

---

## Phase 3 — Location Manager

| # | Scenario | Method | Status |
|---|---|---|---|
| 236 | Buka "Manage Locations" dari Collection toolbar | Manual | 🔲 |
| 237 | Modal tampil dengan daftar existing locations | Manual | 🔲 |
| 238 | Tambah location baru → muncul di list dan autocomplete | Manual | 🔲 |
| 239 | Tambah location yang sudah ada → ditolak (no duplicate) | Manual | 🔲 |
| 240 | Hapus location → hilang dari list | Manual | 🔲 |
| 241 | "my collection" ada sebagai default saat first run | Manual | 🔲 |
| 242 | Focus trap: Tab cycle di dalam modal | Manual | 🔲 |
| 243 | Esc → tutup modal | Manual | 🔲 |

---

## Phase 3.5 — Export / Import

### Export

| # | Scenario | Method | Status |
|---|---|---|---|
| 244 | Klik "Export" → native save dialog terbuka | Manual | 🔲 |
| 245 | File tersimpan sebagai JSON dengan format `{ collection, wishlist, meta, exportedAt, appVersion }` | Manual | 🔲 |
| 246 | Export file: collection.json + wishlist.json dalam satu file | Manual | 🔲 |
| 247 | Cancel save dialog → tidak ada file dibuat | Manual | 🔲 |

### Import

| # | Scenario | Method | Status |
|---|---|---|---|
| 248 | Klik "Import" → native open dialog | Manual | 🔲 |
| 249 | Import dialog: mode cards "Merge" dan "Replace" selectable | Manual | 🔲 |
| 250 | Confirm button disabled sampai mode dipilih | Manual | 🔲 |
| 251 | Merge mode: qty dijumlah untuk `cardCode + location + region` yang sama | Manual | 🔲 |
| 252 | Replace mode: collection + wishlist di-clear, lalu import | Manual | 🔲 |
| 253 | Step 2 confirm dialog sebelum eksekusi | Manual | 🔲 |
| 254 | Cancel di mode selection → tidak ada yang berubah | Manual | 🔲 |
| 255 | Cancel di step 2 confirm → tidak ada yang berubah | Manual | 🔲 |
| 256 | Card codes tidak dikenal → warning toast (masih di-import) | Manual | 🔲 |
| 257 | Import file non-JSON → error message | Manual | 🔲 |
| 258 | Import file JSON malformed → error message | Manual | 🔲 |

---

## Phase 5 — Mobile UI

### Bottom Navigation

| # | Scenario | Method | Status |
|---|---|---|---|
| 259 | Bottom nav: 3 tab (Collection, Wishlist, Browse) dengan icon | Manual | 🔲 |
| 260 | Active tab: indicator (tint/underline) di bottom nav | Manual | 🔲 |
| 261 | Tap tab → switch konten, scroll position di-reset ke atas | Manual | 🔲 |
| 262 | Desktop: nav bar di atas (standard tabs), bukan bottom | Manual | 🔲 |

### Bottom Sheet (Preview Pane Mobile)

| # | Scenario | Method | Status |
|---|---|---|---|
| 263 | Preview pane di mobile: slide-up bottom sheet (85dvh) | Manual | 🔲 |
| 264 | Bottom sheet: animasi spring slide-up (200ms) | Manual | 🔲 |
| 265 | Bottom sheet: close button di pojok kanan atas | Manual | 🔲 |
| 266 | Swipe down dari header → dismiss bottom sheet | Manual | 🔲 |
| 267 | Swipe di tengah konten (scrollable): hanya dismiss saat scroll sudah di atas | Manual | 🔲 |
| 268 | Preview tutup saat pindah tab | Manual | 🔲 |

### Dark / Light Mode

| # | Scenario | Method | Status |
|---|---|---|---|
| 269 | Toggle dark/light mode via button di header | Manual | 🔲 |
| 270 | Mode dipersist ke `localStorage`, bertahan setelah restart | Manual | 🔲 |
| 271 | System default: mengikuti OS dark/light preference | Manual | 🔲 |

### Mobile Misc

| # | Scenario | Method | Status |
|---|---|---|---|
| 272 | Safe area insets: konten tidak tertutup system nav bar (Android) | Manual | 🔲 |
| 273 | FOUC prevention: app tersembunyi sampai JS init selesai | Manual | 🔲 |
| 274 | Portrait lock di Android (tidak rotate ke landscape) | Manual | 🔲 |
| 275 | Filter bar mobile: hanya search field by default, "⊟ Filter" expand dropdowns | Manual | 🔲 |
| 276 | Header mobile: hanya nama tab aktif (bukan full app name) | Manual | 🔲 |

---

## Phase 5 — Android Back Button

| # | Scenario | Method | Status |
|---|---|---|---|
| 277 | Back saat lightbox terbuka → tutup lightbox (bukan preview) | Manual | 🔲 |
| 278 | Back saat preview terbuka → tutup preview | Manual | 🔲 |
| 279 | Back saat tidak ada preview/lightbox → toast "Press back again to exit" | Manual | 🔲 |
| 280 | Back ke-2 dalam 2 detik → exit app | Manual | 🔲 |
| 281 | Back saat modal terbuka (confirm, location manager) → tutup modal | Manual | 🔲 |
| 282 | Back saat onboarding dialog → diblok (`setOnboardingMode`) | Manual | 🔲 |

---

## Phase 6 — UX Polish

### Animations

| # | Scenario | Method | Status |
|---|---|---|---|
| 283 | Tab switch: 150ms fade-in animation | Manual | 🔲 |
| 284 | Preview pane: 200ms spring slide-in | Manual | 🔲 |
| 285 | Button `:active`: scale(0.97) press feedback | Manual | 🔲 |

### Skeleton Loading

| # | Scenario | Method | Status |
|---|---|---|---|
| 286 | Collection tab: skeleton shimmer rows saat load | Manual | 🔲 |
| 287 | Wishlist tab: skeleton shimmer rows saat load | Manual | 🔲 |
| 288 | Skeleton hilang setelah data ter-load | Manual | 🔲 |

### Empty States

| # | Scenario | Method | Status |
|---|---|---|---|
| 289 | Collection empty: teks deskriptif (bukan blank) | Manual | 🔲 |
| 290 | Wishlist empty: teks deskriptif | Manual | 🔲 |
| 291 | Browse no-results: teks + "Clear filters" button inline | Manual | 🔲 |

### Focus Trap & Keyboard Nav

| # | Scenario | Method | Status |
|---|---|---|---|
| 292 | Confirm dialog: Tab cycle antara tombol dalam dialog | Manual | 🔲 |
| 293 | Import dialog: Tab cycle dalam modal | Manual | 🔲 |
| 294 | Location manager: Tab cycle dalam modal | Manual | 🔲 |
| 295 | Esc menutup confirm dialog | Manual | 🔲 |
| 296 | Esc menutup import dialog | Manual | 🔲 |
| 297 | Esc menutup location manager | Manual | 🔲 |
| 298 | Enter/Space: aktivasi mode option di import dialog | Manual | 🔲 |

### ARIA & Accessibility

| # | Scenario | Method | Status |
|---|---|---|---|
| 299 | `role="dialog"` + `aria-modal` pada semua modal | Static | ✅ |
| 300 | ARIA labels pada semua icon-only button | Static | ✅ |
| 301 | `img.decoding="async"` pada semua card images | Static | ✅ |

### Retry Button

| # | Scenario | Method | Status |
|---|---|---|---|
| 302 | Browse fetch error → retry button muncul inline di status bar | Manual | 🔲 |
| 303 | Klik retry → fetch diulang | Manual | 🔲 |

---

## Settings & Onboarding

### Onboarding (First Launch)

| # | Scenario | Method | Status |
|---|---|---|---|
| 304 | First launch (settings.json belum ada) → onboarding dialog muncul | Manual | 🔲 |
| 305 | Onboarding: back button diblok sampai pilihan dibuat | Manual | 🔲 |
| 306 | Pilih EN → settings tersimpan, app load EN cards | Manual | 🔲 |
| 307 | Pilih JP → settings tersimpan, app load JP cards | Manual | 🔲 |
| 308 | Pilih BOTH → settings tersimpan, EN + JP keduanya di-load | Manual | 🔲 |
| 309 | Onboarding tidak muncul lagi di launch berikutnya | Manual | 🔲 |

### Settings Persistence

| # | Scenario | Method | Status |
|---|---|---|---|
| 310 | `settings.json` terbuat di `userdata/` pada first run | Manual | 🔲 |
| 311 | Region preference tersimpan setelah restart | Manual | 🔲 |
| 312 | `last_active_region` tersimpan dan di-restore saat BOTH mode | Manual | 🔲 |
| 313 | Change Region dialog (klik "Both") → reload app dengan region baru | Manual | 🔲 |
| 314 | Settings.json corrupt → default fallback tanpa crash | Static | ✅ (loadJsonFile error handling) |

---

## Error Handling

### File I/O Errors

| # | Scenario | Method | Status |
|---|---|---|---|
| 315 | `collection.json` corrupt (invalid JSON) → toast error + path, load empty | Static | ✅ |
| 316 | `wishlist.json` corrupt → toast error + path, load empty | Static | ✅ |
| 317 | `settings.json` corrupt → toast error, default fallback | Static | ✅ |
| 318 | Write gagal (disk full / permission) → error dari global `unhandledrejection` → toast | Static | ✅ |
| 319 | Write gagal: path disertakan dalam error message | Static | ✅ |

### Network Errors

| # | Scenario | Method | Status |
|---|---|---|---|
| 320 | Fetch GitHub gagal (timeout/offline) → error state Browse + retry button | Manual | 🔲 |
| 321 | SHA check gagal (network) → silent skip, tidak false update | Static | ✅ |
| 322 | Image download 404 → tidak tulis file rusak, silent | Static | ✅ |
| 323 | Image download timeout → catch, silent, retry next open | Static | ✅ |

### Export/Import Errors

| # | Scenario | Method | Status |
|---|---|---|---|
| 324 | Export ke path read-only → error toast | Manual | 🔲 |
| 325 | Import file bukan JSON → error message di dialog | Manual | 🔲 |
| 326 | Import file JSON tapi bukan format backup → error/warning | Manual | 🔲 |

---

## About Dialog

| # | Scenario | Method | Status |
|---|---|---|---|
| 327 | Klik "?" button → About dialog terbuka | Manual | 🔲 |
| 328 | Dialog menampilkan version number yang benar (v0.3.0) | Manual | 🔲 |
| 329 | GitHub link → terbuka di browser eksternal (bukan WebView) | Manual | 🔲 |
| 330 | Esc → tutup dialog | Manual | 🔲 |

---

## Portable Storage (Cross-platform)

| # | Scenario | Method | Status |
|---|---|---|---|
| 331 | Copy folder `vg_collection/` ke lokasi lain → semua data ikut (collection, cache, images) | Manual | 🔲 |
| 332 | Hapus folder → tidak ada leftover data di AppData/registry | Manual | 🔲 |
| 333 | Path exe dengan spasi (`C:\My Apps\vg_collection.exe`) → tidak crash | Manual | 🔲 |
| 334 | Android: `userdata/` di `app_data_dir()` (bukan exe-dir) | Static | ✅ |
| 335 | Windows: `userdata/` di samping `.exe` | Manual | 🔲 |

---

## Test Yang Masih Perlu Manual (prioritas)

1. **#39** — `fetch()` ke CDN berhasil di Tauri production (CSP fix verification)
2. **#9/#10** — gambar muncul offline setelah cache, broken image saat belum cache
3. **#52–#57** — UI "Image Cache ▾" button dan context menu
4. **#58–#61** — preview image di 3 tab (online + offline)
5. **#67** — region switch rebuild Browse list
6. **#78/#79** — onboarding dialog + Change Region dialog
7. **#84** — BOTH mode stats side-by-side
8. **#96–#100** — regresi fitur utama (collection CRUD, export/import, dark mode, force refresh)
9. **#111/#115** — cache hit restart, force refresh
10. **#165–#170** — lightbox (buka, Esc, backdrop, swipe, back button)
11. **#171–#176** — add to collection + wishlist dari Browse preview
12. **#259–#268** — bottom nav + bottom sheet mobile
13. **#304–#309** — onboarding first launch

---

*Last updated: Phase 9 manual testing — 2026-05-24. Total: 335 test cases.*
