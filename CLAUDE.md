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

- Hybrid cache loader (IndexedDB-first ~119ms measured, GitHub fallback ~9.4s on slow network)
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

#### Export & Import ✅ Implemented in Phase 3.5

Full backup only (JSON). Format: `{ collection: CollectionEntry[], wishlist: WishlistEntry[], meta: CacheMeta, exportedAt: number, appVersion: string }`.

**Export:** Tauri native save dialog → writes JSON file via Rust `export_backup` command.

**Import flow:**
1. Tauri native open dialog → reads file via Rust `import_backup` command
2. Centered modal: selectable mode cards (Merge / Replace all) → Confirm button enables after selection
3. Second `showConfirm()` step before execution — user sees exact consequence
4. Merge: `mergeOrAdd()` for each entry (same cardCode+location sums qty)
5. Replace: `clearAll*` → then import
6. Warns if any card codes not in current database (still imports them)

### Phase 3.5 — Export/Import + Auto-update + Polish ✅ Done

- ✅ Auto-update: startup SHA check vs GitHub → auto-refresh + toast if outdated; skip if rate-limited
- ✅ Export: full backup JSON via Tauri native save dialog
- ✅ Import: native open dialog → selectable Merge/Replace cards → two-step confirmation; warns about unknown codes
- ✅ Fix: `moveQtyInput.max` now syncs when qty is changed via +/− buttons
- ✅ Fix: full move (move all copies) now merges with existing destination entry instead of creating duplicate
- ✅ Fix: `deduplicateCollection()` runs on startup to clean up any existing duplicates; Add button disabled during async
- ✅ Fix: Browse tab ×N badges update in real-time after Collection tab mutations
- ✅ Refactor: `buildEditSection` extracted from `collection-tab.ts` → `collection-edit.ts` (callbacks pattern)
- ✅ Perf: real measured numbers (cache 119ms, parse 17ms, GitHub ~9.4s)
- ✅ Fix: grid tile portrait ratio (5:7, object-fit contain) — full card visible
- ✅ UX: import dialog centered; Confirm=blue, Cancel=grey (btn-neutral) across all dialogs

### Pre-Phase 4 — Distribution Readiness Gate 📋

Everything here must be completed and verified before building the installer.
This is a quality gate — if anything is unresolved, do not proceed to Phase 4.

#### 1. App identity & metadata

- [ ] **Bundle identifier** — set unique reverse-domain ID in `tauri.conf.json`:
  `"identifier": "com.nerif.vgcollection"`
- [ ] **App version** — set `"version": "1.0.0"` in `tauri.conf.json` and `package.json`
- [ ] **Product name** — confirm `"productName": "VG Collection"` in `tauri.conf.json`
- [ ] **App description** — set a short description for the installer metadata

#### 2. App icon

- [ ] Create or source a proper app icon (Vanguard-themed or generic card icon)
- [ ] Generate all required sizes: 32×32, 128×128, 128×128@2x, `icon.ico` (Windows)
- [ ] Place in `src-tauri/icons/` and reference in `tauri.conf.json` `bundle.icon`
- [ ] Verify icon appears in taskbar, Alt+Tab, and window title bar

#### 3. Content Security Policy (CSP)

Currently CSP is **disabled** in `tauri.conf.json`. Must be re-enabled before distribution.

Domains to whitelist:
- `https://raw.githubusercontent.com` — cards.json download
- `https://api.github.com` — SHA check for auto-update
- Card image CDN — check actual `imageUrlEn` domain from `cards.json` and add it
- `'self'` — app scripts and styles

Steps:
1. Check actual image URL domain (open DevTools → Network tab, find an image request)
2. Add CSP to `tauri.conf.json` under `app.security.csp`
3. Test all features with CSP enabled — images load, GitHub fetch works, SHA check works
4. Fix any CSP violations before proceeding

#### 4. Error handling audit

Review these failure modes — user must never see a blank screen or JS crash:

- [ ] **Network offline on first launch** — no IndexedDB cache yet; app should show a clear message, not hang
- [ ] **GitHub API rate-limited** — already handled (silent skip); verify toast does not show false update
- [ ] **Corrupted import file** — already returns `"invalid"`; verify error message is shown to user
- [ ] **IndexedDB unavailable** — rare but possible (private browsing mode, storage quota); needs a fallback message

#### 5. Production build smoke test

Before packaging:
- [ ] Run `npm run build` — must pass TypeScript check + Vite bundle with zero errors
- [ ] Run `npm run tauri build` — Rust compile must succeed
- [ ] Open the built `.exe` directly (not via `tauri dev`) and verify:
  - App loads and shows cards
  - Collection add/edit/move/delete all work
  - Export/Import work (native dialogs open)
  - Auto-update check runs on startup (spinner visible briefly)
  - No console errors in WebView DevTools (F12)

#### 6. Data persistence verification

- [ ] Install the app, add 2–3 collection entries
- [ ] Close and reopen — entries persist
- [ ] Note the data location: `%APPDATA%\com.nerif.vgcollection\` (or similar)
- [ ] Uninstall the app — verify data folder is NOT deleted (user data must survive uninstall)

#### 7. Window & UX polish

- [ ] Window title shows app name (not "Tauri App")
- [ ] Minimum window size set so layout doesn't break at small sizes
- [ ] `tauri.conf.json` `windows[0].title` set to `"VG Collection"`
- [ ] Dark/light mode follows OS correctly in both release and dev builds

### Phase 4 — Distribution 📋

Only start after all Pre-Phase 4 items are checked off.

- [ ] Run `npm run tauri build` → produces `src-tauri/target/release/bundle/msi/*.msi`
- [ ] Install the `.msi` on a **clean Windows machine** (or VM) that has never run the dev version
- [ ] Verify WebView2 is available (usually pre-installed on Win10/11) — installer may need to bundle it
- [ ] Share the `.msi` with intended users
- [ ] Android APK (Tauri mobile target; timeline TBD — after Windows is stable)

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

## Performance (Measured)

Measured on Windows 11, 24,262 cards / 10.09 MB:

| Operation | Measured |
|---|---|
| Load from IndexedDB cache | **119 ms** |
| Parse JSON | **17 ms** |
| Total startup (cache hit) | **~135 ms** |
| Fetch from GitHub (slow network) | **~9.4 s** |

- **Filter/search:** < 20 ms (pure Array.filter, estimated — no DOM involvement)
- **Virtualized scroll:** No jank; GPU-composited, only ~20–30 DOM nodes at a time
- **Collection queries:** Instant for typical collections (< 500 entries)

---

## Known Technical Debt

| Item | Location | Priority | Notes |
|---|---|---|---|
| CSP disabled | `src-tauri/tauri.conf.json` | **BLOCKER** for distribution | Must be configured before shipping |
| No app icon | `src-tauri/icons/` | **BLOCKER** for distribution | Tauri uses placeholder icon by default |
| Bundle ID not finalized | `tauri.conf.json` | **BLOCKER** for distribution | Affects install path and data location |
| No error recovery UI | `main.ts` | High | Network failures show inline text; no retry button |
| Grouped view not virtualized | `collection-grouped.ts` | Medium | Full DOM re-render; may lag at 500+ entries |
| Single `"all"` IndexedDB key | `cache.ts` | Low | 10MB as one value; fine unless DB grows significantly |
| `btn-secondary` naming | `styles.css` | Low | Semantically misleading — it's the primary blue action button |

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
