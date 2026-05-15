# VG Collection Tauri — CLAUDE.md

## Project Overview

A **Cardfight!! Vanguard** card database browser and personal collection tracker built with Tauri 2 (Rust + WebView). This is a rewrite of an older Electron app.

**Core motivation:** The old Electron app could not be used on mobile — users couldn't check their collection at card shops. Android APK is a long-term possibility (timeline uncertain; Windows distribution comes first).

- **Primary user:** Personal use first; potentially shared with friends later
- **UI language:** English
- **Target platforms:** Windows (.msi) primary; Android APK TBD

---

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Tauri 2.x |
| Frontend | Vanilla TypeScript + Vite (no component framework, ever) |
| Local storage | IndexedDB |
| Card data source | GitHub — `nerif7/vanguard-library-db` (`cards.json`, ~10MB, 24k+ cards) |
| Build tool | Vite |
| Type checking | TypeScript strict mode |

### Module Structure

```
src/
├── main.ts               # App orchestration, tab routing, global state
├── cache.ts              # IndexedDB abstraction (card DB cache)
├── collection-db.ts      # IndexedDB CRUD for collection + wishlist stores
├── filters.ts            # Pure filter logic — no DOM, no side effects, testable
├── filter-bar.ts         # Filter UI wiring only (reads filters.ts, writes DOM)
├── virtual-list.ts       # Generic virtualized list renderer (RAF-throttled)
├── virtual-grid.ts       # Generic virtualized grid renderer (ResizeObserver, dynamic cols)
├── card-row.ts           # Card row DOM builder (Browse list view)
├── card-tile.ts          # Card tile DOM builder (grid view — all tabs)
├── collection-row.ts     # Collection row DOM builder
├── collection-grouped.ts # Grouped view renderer (collapsible location groups)
├── card-preview.ts       # Preview pane + lightbox (Browse tab)
├── tab-nav.ts            # Tab navigation wiring
├── collection-tab.ts     # Collection tab — list/grid/grouped + edit controls
├── collection-edit.ts    # Edit section DOM builder (qty/move/remove controls + callbacks)
├── wishlist-tab.ts       # Wishlist tab view
├── location-manager.ts   # Manage Locations modal
├── confirm-dialog.ts     # Custom centered confirm dialog (replaces native popup)
├── export-import.ts      # Export/Import backup logic (Tauri invoke + import dialog)
├── types.ts              # All TypeScript interfaces and types
└── styles.css            # Light/dark theme styling

src-tauri/src/
├── lib.rs              # Tauri app builder, plugin registration, file I/O commands
└── main.rs             # Windows entry point (no console window in release)
```

### Key Architectural Decisions

- **Vanilla TS over React/Vue** — keeps bundle tiny, no framework overhead; this is a firm constraint
- **IndexedDB for everything local** — card DB cache and collection data both live here; large datasets (10MB) don't hit localStorage limits
- **Pure filter module** — `filters.ts` has zero DOM dependencies; easy to test and reuse
- **Generic `VirtualList<T>`** — parameterized by row height + render function; works with any data type

---

## Code Conventions

### Non-negotiable rules

1. **Vanilla TypeScript only** — never introduce React, Vue, Svelte, or any component framework
2. **One file, one responsibility** — never let a file become a god-file; extract a focused module when scope creeps
3. **Minimal comments** — comment only the non-obvious WHY (hidden constraint, subtle invariant, workaround); never comment WHAT the code does
4. **Strict TypeScript** — no `any`; all types must be explicit; `tsconfig.json` has `strict: true`
5. **No premature abstraction** — three similar lines > a helper function; only generalize once the pattern is proven in at least three places

### Naming

- `camelCase` for variables and functions
- `PascalCase` for types and interfaces
- `kebab-case` for file names

### File size

Keep files under ~200 lines where practical. If a file grows beyond that, extract a clearly-scoped module.

---

## Feature Roadmap

### Phase 1 — Done ✅

- Hybrid cache loader (IndexedDB-first ~33ms, GitHub fallback ~854ms)
- Auto-load on startup (no manual button click)
- Virtualized list rendering for 24k+ cards
- Search + filter (name, card code, set, nation, unit type, trigger)
- Performance stats panel (fetch/parse/load/render times, cache freshness)

### Phase 2 — Done ✅

- Card preview pane: click row → slide-in panel with card image + stats
- Card image full-width (200px height), click → lightbox overlay (Esc/backdrop to close)
- Preview pane 380px wide, 2-column tags grid, smooth transition
- Selected row highlight (inset left border)
- "Add to Collection" button stub (wired in Phase 3)

### Phase 3 — Collection Tracking ✅ Done

> Export & Import was deferred to Phase 3.5. Everything else in this spec is implemented.

#### App structure (UX direction)

The primary view is the user's **own collection** — not the card browser. Navigation uses three tabs:

| Tab | Content |
|---|---|
| **Collection** (default) | Cards owned by the user |
| **Wishlist** | Cards the user is looking for / wants to buy |
| **Browse** | All 24k+ cards — search here to add to Collection or Wishlist |

**Tab state:** Browse tab preserves scroll position, active filters, and selected card when the user navigates away and returns. Preview pane closes when switching tabs (each tab has its own clean context).

---

#### Data model

```typescript
interface CollectionEntry {
  id?: number;       // autoIncrement PK (undefined when creating, assigned by IDB)
  cardCode: string;  // indexed; matches Card.enCardNo
  quantity: number;  // always >= 1
  location: string;  // free-form; empty string = "unspecified"
}

interface WishlistEntry {
  cardCode: string;  // primary key
}
```

**Key design decisions:**
- **Multiple entries per cardCode** — a card can have separate entries for different locations (e.g., 3× "Red Binder" + 2× "Storage Box A" = two separate `CollectionEntry` rows for the same cardCode).
- **Duplicate guard:** if user adds a card with a `cardCode + location` combination that already exists, quantities are **merged** automatically (no new entry created).
- **Wishlist is independent** — a card can be in both collection and wishlist simultaneously (e.g., owned 1 copy, still looking for more).
- **Empty location is valid** — means "unspecified", stored as `""`.

**IndexedDB stores:**
- `collection` store: `keyPath: "id"`, `autoIncrement: true`, indexes on `cardCode` and `location`
- `wishlist` store: `keyPath: "cardCode"`
- Neither store is affected by Force Refresh or Clear Cache (card DB cache clears never touch these)

---

#### Collection tab

**Stats bar at top:**
- Total unique cards owned (count of distinct cardCodes)
- Total copies (sum of all quantities across all entries)
- Wishlist card count
- Location count (count of distinct non-empty location strings)

**List:** Flat virtualized list using `VirtualList<CollectionEntry>` — one row per entry (not grouped by card). Default sort: **by location A–Z, then card code A–Z**. Each row shows:
- Card name (resolved from card DB) + card code
- Quantity badge (e.g. `×3`)
- Location text (or "—" if empty)

**Click a collection row:** Opens the shared preview pane on the right. Pane shows:
- Card image + stats (same layout as Browse preview)
- Edit section: `[−] N [+]` quantity controls + location free-text input (with autocomplete from existing locations)
- Changes **auto-save** on input change (quantity) or blur (location)
- `Remove from Collection` danger button — shows confirm dialog before deleting

**Quantity controls behavior:**
- `[+]` increments qty, auto-saves immediately
- `[−]` when qty > 1: decrements, auto-saves
- `[−]` when qty = 1: shows confirm dialog "Remove this entry from collection?" — if confirmed, entry is deleted; if cancelled, nothing changes

**Search within collection:** Single text input, filters across card name (resolved from card DB), card code, and location string. No dropdown filters needed.

---

#### Wishlist tab

Same layout as Collection tab. Stats bar shows total wishlist entry count.

Each row: card name + code. No quantity or location.

Click a wishlist row → preview pane shows card image + stats + `Remove from Wishlist` danger button (no confirm dialog — one-click remove).

---

#### Browse tab

Existing Phase 1+2 view with these additions:

**Preview pane — Add to Collection section (always visible):**
```
[ + Add to Collection ]
  qty: [1]  location: [__________]  (with autocomplete)

Already owned: ×3 Red Binder  ×2 Storage Box A  — Edit →
```
- "Add to Collection" form is always visible, not replaced by a different button state
- Below the form, if the card has existing collection entries: list them as compact chips + "Edit →" link
- "Edit →" switches to Collection tab, scrolls to and highlights the first matching entry
- After saving: form resets to defaults (qty=1, location=""), "Already owned" section updates
- Merge rule: if submitted `cardCode + location` already exists → add qty to existing entry; otherwise create new

**Add to Wishlist:**
- One-click button/link below the Add to Collection form
- Immediately adds to wishlist, button label changes to "Remove from Wishlist"
- Collection and wishlist are independent — adding to collection does NOT auto-remove from wishlist

**Browse row collection indicator:**
- Rows for cards already in the user's collection show a small badge (e.g. `×5`) on the right, showing total owned quantity across all locations

---

#### Export & Import *(deferred to Phase 3.5)*

Export/import uses Tauri Rust commands (`#[tauri::command]` in `lib.rs`) for native file dialogs and file I/O.

| Format | Columns / Content | Sort |
|---|---|---|
| JSON | Raw `CollectionEntry[]` array | as-is |
| CSV | Code, Quantity, Location | location → card code |
| Printable HTML | Table: Code \| Name \| Qty \| Location | location → card code |
| Full backup | `{ collection: CollectionEntry[], wishlist: WishlistEntry[], meta: CacheMeta }` | — |

**Import (JSON backup):**
- User selects a JSON file via native dialog
- App asks: **"Merge with current collection"** or **"Replace current collection"**
  - Merge: entries that share `cardCode + location` → update qty to file's value; entries not in current collection → add
  - Replace: clear all existing collection entries, then load from file
- Wishlist is handled separately in full backup imports (same merge/replace choice applies)

**Location autocomplete:** When user types in any location input, show a dropdown of previously used location strings (sourced from all current collection entries). Included in Phase 3.

### Phase 3.5 — Export/Import + Auto-update + Polish ✅ Done

- ✅ Auto-update: startup SHA check vs GitHub → auto-refresh + toast if outdated; skip if rate-limited
- ✅ Export: full backup JSON `{ collection, wishlist, meta }` via Tauri native save dialog
- ✅ Import: native open dialog → Merge or Replace dialog; warns about unknown card codes; restores wishlist
- ✅ Fix: `moveQtyInput.max` now syncs when qty is changed via +/− buttons
- ✅ Fix: full move (move all copies) now merges with existing destination entry instead of creating duplicate
- ✅ Fix: `deduplicateCollection()` runs on startup to clean up any existing duplicates; Add button disabled during async
- ✅ Fix: Browse tab ×N badges update in real-time after Collection tab mutations
- ✅ Refactor: `buildEditSection` extracted from `collection-tab.ts` → `collection-edit.ts` (callbacks pattern)
- 📋 Performance: measure real numbers with DevTools — replace estimates in README (manual task)

### Phase 4 — Distribution

- Windows `.msi` installer
- Android APK (Tauri mobile target; timeline TBD)
- **CSP must be properly configured before any public release** (currently disabled in `tauri.conf.json`)

### Phase 5+ — Future Features (maybe, not in scope now)

- **Deck Builder**: Vanguard deck validation (max 4 copies per card name, 50 cards total), deck export as text list
- **Bulk edit**: Select multiple collection entries → change location or delete in bulk
- **Manual dark/light mode toggle**: Currently follows OS. Add in-app toggle (persist to localStorage)

---

## Data & Caching

### Card Database

- **Source:** `https://raw.githubusercontent.com/nerif7/vanguard-library-db/main/cards.json`
- **Cache:** IndexedDB, single `"all"` key holds the entire array
- **Metadata store:** Caches fetch timestamp, commit SHA, card count, file size
- **Staleness threshold:** 7 days

### Update Strategy (Hybrid) ✅ Implemented

On every app startup:
1. Silently fetch the latest commit SHA from the GitHub API (non-blocking)
2. Compare against the cached SHA in IndexedDB metadata
3. If different → trigger a background refresh and show toast "Cards updated — X cards loaded."
4. Show a "Checking for updates…" spinner in the top toolbar while check runs
5. If rate-limited or network error → `fetchLatestCommitSha()` returns `null`; treated as "up to date" (silent skip)

Also provides a **manual "Force Refresh" button** for immediate re-fetch.

### Collection & Wishlist Data

- Two separate IndexedDB stores: `collection` (autoIncrement id, indexed by cardCode + location) and `wishlist` (keyed by cardCode)
- Multiple entries per cardCode are allowed — each `cardCode + location` pair is a unique entry
- Must not be affected by card DB cache clears or Force Refresh

---

## Performance Targets

> **Note:** Numbers below are unverified estimates. Actual measurement via DevTools is planned for Phase 3.5.

- **Current dataset:** 24,262 cards — this is the target; no need to over-engineer for larger datasets
- **Filter/search:** Must feel instant (target < 100ms for any filter operation)
- **Collection queries:** Search within owned cards must be instant regardless of collection size
- **Virtualized list:** Already implemented in `virtual-list.ts`; do not regress this

---

## Known Technical Debt

| Item | Location | Notes |
|---|---|---|
| CSP disabled | `src-tauri/tauri.conf.json` | Must be re-enabled and configured before distribution |
| Single `"all"` IndexedDB key | `cache.ts` | Stores 10MB as one value; fine for now, revisit if DB grows significantly |
| No error recovery UI | `main.ts` | Errors shown as inline text; no retry or recovery flow for network failures |
| Grouped view not virtualized | `collection-grouped.ts` | Full DOM re-render on each filter change; fine for typical collections, may lag at 500+ entries |
| Performance targets unverified | All | Targets in this doc are estimates; not yet measured with DevTools profiling |

---

## Git Workflow

Before every commit, update all three docs in the same commit:
1. `README.md` — phase status, new features, module structure changes
2. `LEARN.md` — add or update any Decision Log entry, Deep Dive, or "What I Would Do Differently" that reflects work done in this commit
3. `REFLECTION.md` — if any bug was fixed or lesson learned, document it here

After every commit (including push), ask: **"Apakah kita perlu review CLAUDE.md untuk arah pengembangan selanjutnya?"**

---

## Development Commands

```bash
npm run dev        # Vite dev server (port 1420) + Tauri dev window with HMR
npm run build      # TypeScript type-check + Vite bundle + Tauri production build
npm run tauri      # Direct access to Tauri CLI
```

Windows build output: `src-tauri/target/release/bundle/msi/`

---

## External Dependencies

| Dependency | Purpose |
|---|---|
| `@tauri-apps/api@2` | Frontend Tauri bridge (invoke, events) |
| `@tauri-apps/cli@2` | Build toolchain |
| `tauri-plugin-opener` | Open URLs in system browser (Rust side) |
| `tauri-plugin-dialog` | Native file save/open dialogs (Rust side, used by export/import) |
| `vite` | Frontend bundler and dev server |

Card image CDN and GitHub API are whitelisted in `index.html` CSP `<meta>` tags.
