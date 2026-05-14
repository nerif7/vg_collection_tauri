# VG Collection Tauri — CLAUDE.md

## Project Overview

A **Cardfight!! Vanguard** card database browser and personal collection tracker built with Tauri 2 (Rust + WebView). This is a rewrite of an older Electron app.

**Core motivation:** The old Electron app could not be used on mobile — users couldn't check their collection at card shops. The Android APK target is the most important long-term goal of this rewrite.

- **Primary user:** Personal use first; potentially shared with friends later
- **UI language:** English
- **Target platforms:** Windows (.msi) and Android APK

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
├── main.ts           # App orchestration, tab routing, global state
├── cache.ts          # IndexedDB abstraction (card DB cache + collection data)
├── filters.ts        # Pure filter logic — no DOM, no side effects, testable
├── filter-bar.ts     # Filter UI wiring only (reads filters.ts, writes DOM)
├── virtual-list.ts   # Generic virtualized list renderer (RAF-throttled)
├── card-row.ts       # Card row DOM builder (Browse view)
├── card-preview.ts   # Preview pane + lightbox
├── types.ts          # All TypeScript interfaces and types
└── styles.css        # Light/dark theme styling

src-tauri/src/
├── lib.rs            # Tauri app builder, plugin registration
└── main.rs           # Windows entry point (no console window in release)
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

### Phase 3 — Collection Tracking

#### App structure (UX direction)

The primary view is the user's **own collection** — not the card browser. Navigation uses three tabs:

| Tab | Content |
|---|---|
| **Collection** (default) | Cards owned by the user |
| **Wishlist** | Cards the user is looking for / wants to buy |
| **Browse** | All 24k+ cards — search here to add to Collection or Wishlist |

The Browse tab is the existing Phase 1+2 view, unchanged except the "Add to Collection" button in the preview pane becomes functional.

#### Collection tab

**Stats bar at top:**
- Total unique cards owned
- Total copies (sum of all quantities)
- Wishlist card count
- Location count (distinct non-empty location strings)

**List:** Virtualized, same `VirtualList<T>` used in Browse. Each row shows:
- Card name + code
- Quantity badge (e.g. `×3`)
- Location text

**Click a collection row:** Opens the existing preview pane on the right. Pane shows:
- Card image + stats (same as Browse preview)
- Edit section: quantity `[−] N [+]` and location free-text input — changes auto-save
- `Remove from Collection` danger button

**Filter/search within collection:** Search input that filters by name, code, location. No dropdowns needed (collection is personal/small).

#### Wishlist tab

Same layout as Collection tab. Stats bar shows:
- Total wishlist entries

Each row: card name + code. No quantity or location (wishlist entries are binary — wanted or not).

Click a wishlist row → preview pane shows card details + `Remove from Wishlist` button.

#### Browse tab

Existing view. Preview pane "Add to Collection" button now opens a small inline form within the pane (quantity + location input) before saving. Separate "Add to Wishlist" link below it.

If the card is already in the collection, the button changes to "Edit in Collection" and clicking switches to the Collection tab with that card selected.

#### Data model

```typescript
interface CollectionEntry {
  cardCode: string;    // primary key — matches Card.enCardNo
  quantity: number;    // copies owned (always >= 1)
  location: string;    // free-form: "Red Binder", "Shadow Deck", "Storage Box A"
}

interface WishlistEntry {
  cardCode: string;    // primary key
}
```

Wishlist is a separate store from Collection — a card can be in both (e.g. owned 1 copy, still looking for more).

**Location rules:** Free-form text, no validation, no uniqueness constraint. Empty string is valid (means "unspecified").

**Storage:** Two separate IndexedDB object stores — `collection` and `wishlist` — both independent of the card cache. Neither is affected by Force Refresh or Clear Cache.

#### Export formats (all required)

| Format | Purpose |
|---|---|
| JSON | Re-importable; primary backup format |
| CSV | Opens in Excel / Google Sheets |
| Printable HTML | Simple browser-print checklist; usable at card shops |
| Full backup | Single JSON blob: card cache meta + collection + wishlist |

Export/import requires Tauri Rust commands for file system access (dialog + write). Add `#[tauri::command]` functions to `lib.rs` as needed.

### Phase 4 — Distribution

- Windows `.msi` installer
- Android APK (Tauri mobile target)
- **CSP must be properly configured before any public release** (currently disabled in `tauri.conf.json`)

### Phase 5+ — Deck Builder (maybe, not in scope now)

If added later: Vanguard deck validation (max 4 copies per card name, 50 cards total), deck export as text list.

---

## Data & Caching

### Card Database

- **Source:** `https://raw.githubusercontent.com/nerif7/vanguard-library-db/main/cards.json`
- **Cache:** IndexedDB, single `"all"` key holds the entire array
- **Metadata store:** Caches fetch timestamp, commit SHA, card count, file size
- **Staleness threshold:** 7 days

### Update Strategy (Hybrid)

On every app startup:
1. Silently fetch the latest commit SHA from the GitHub API (non-blocking)
2. Compare against the cached SHA in IndexedDB metadata
3. If different → trigger a background refresh and notify the user
4. Show a non-blocking "Checking for updates…" indicator in the stats panel

Also provide a **manual "Force Refresh" button** in the UI for the user to trigger immediately.

### Collection Data

- Stored in a separate IndexedDB object store (never mixed with card cache)
- Keyed by card code string
- Must not be affected by card DB cache clears

---

## Performance Targets

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
| No error recovery UI | `main.ts` | Errors shown as inline text; consider toast/modal when collection features land |
| Rust backend mostly unused | `src-tauri/src/lib.rs` | Only `tauri-plugin-opener` registered; file I/O for Phase 3 export needs Rust commands |

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
| `vite` | Frontend bundler and dev server |

Card image CDN and GitHub API are whitelisted in `index.html` CSP `<meta>` tags.
