# VG Collection — Technical Learning Journal

A deep-dive into the architecture, decisions, and implementation details of this project.
Written for anyone — from recruiter to fellow junior developer — who wants to understand
not just *what* the code does, but *why* it was built this way.

---

## Table of Contents

1. [Why This Project Exists](#1-why-this-project-exists)
2. [Architecture Overview](#2-architecture-overview)
3. [Decision Log](#3-decision-log)
   - [Why Tauri, not Electron?](#31-why-tauri-not-electron)
   - [Why Vanilla TypeScript, not React or Vue?](#32-why-vanilla-typescript-not-react-or-vue)
   - [Why IndexedDB for everything?](#33-why-indexeddb-for-everything)
   - [Why Virtual Rendering?](#34-why-virtual-rendering)
   - [Why one file, one responsibility?](#35-why-one-file-one-responsibility)
   - [Why TypeScript strict mode?](#36-why-typescript-strict-mode)
   - [Why SHA-based auto-update?](#37-why-sha-based-auto-update-instead-of-just-a-timer)
4. [Deep Dives](#4-deep-dives)
   - [IndexedDB: How It Really Works](#41-indexeddb-how-it-really-works)
   - [VirtualList Algorithm](#42-virtuallist-algorithm)
   - [VirtualGrid Algorithm](#43-virtualgrid-algorithm)
   - [TypeScript Module Architecture](#44-typescript-module-architecture)
   - [Tauri: WebView + Rust Bridge](#45-tauri-webview--rust-bridge)
5. [Performance Analysis](#5-performance-analysis)
6. [What I Would Do Differently](#6-what-i-would-do-differently)

---

## 1. Why This Project Exists

I had an older Electron app — `tcg_library` — that tracked my Cardfight!! Vanguard card
collection. It worked fine on desktop, but it had a fundamental problem: **I couldn't use
it at a card shop.**

When you're browsing cards at a shop, you want to quickly check: "Do I already own this?
How many copies? Which binder?" The Electron app is installed only on my PC at home.
Android support for Electron requires a completely separate codebase (React Native, Ionic,
or similar), which was not worth the effort for a personal tool.

**Tauri 2.x** solves this. The same codebase — same HTML/CSS/JS frontend — can compile
to a Windows `.msi` installer *and* an Android APK. The rewrite also gave me an
opportunity to learn:

- How to build a desktop app without a JS framework
- How IndexedDB works at a lower level than most tutorials show
- How to implement virtual rendering from scratch
- How Tauri differs from Electron architecturally

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     index.html                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Collection  │  │  Wishlist   │  │     Browse      │  │
│  │    Tab      │  │    Tab      │  │      Tab        │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
│         │                │                   │           │
│  ┌──────▼────────────────▼───────────────────▼────────┐  │
│  │                    main.ts                         │  │
│  │          (orchestration + global state)            │  │
│  └──────┬─────────────────────┬──────────────────────┘  │
│         │                     │                          │
│  ┌──────▼──────┐    ┌─────────▼────────┐                │
│  │collection-  │    │    cache.ts       │                │
│  │   db.ts     │    │ (card DB cache)   │                │
│  │(collection  │    └─────────┬─────────┘                │
│  │ + wishlist) │              │                          │
│  └─────────────┘    ┌─────────▼─────────┐               │
│                     │   IndexedDB        │               │
│                     │ (browser storage)  │               │
│                     └────────────────────┘               │
└──────────────────────────────────────────────────────────┘
```

**Data flows:**

1. On startup → `cache.ts` loads card data from IndexedDB (or fetches from GitHub)
2. Cards are passed down to each tab's init function
3. `collection-db.ts` handles all reads/writes for the user's own data
4. `VirtualList` and `VirtualGrid` handle rendering — only visible items are in the DOM
5. Tauri wraps the entire WebView in a native window (Rust process manages the OS layer)

**Module categories:**

| Category | Files |
|---|---|
| Data / Storage | `cache.ts`, `collection-db.ts` |
| Types | `types.ts` |
| Pure logic | `filters.ts` |
| UI — Tab views | `collection-tab.ts`, `wishlist-tab.ts`, `main.ts` (Browse) |
| UI — Rendering | `virtual-list.ts`, `virtual-grid.ts`, `card-row.ts`, `card-tile.ts`, `collection-row.ts`, `collection-grouped.ts` |
| UI — Shared | `card-preview.ts`, `confirm-dialog.ts`, `location-manager.ts` |
| Wiring | `tab-nav.ts`, `filter-bar.ts` |

---

## 3. Decision Log

### 3.1 Why Tauri, not Electron?

**Electron** bundles an entire Chromium browser + a Node.js runtime into every app. That
is why every Electron app is 80–150 MB and uses 200–400 MB of RAM even at idle — it's
literally shipping a browser.

**Tauri** uses the *operating system's existing WebView* (Edge WebView2 on Windows,
WebKitGTK on Linux, WKWebView on macOS/iOS, Android System WebView on Android). No
bundled browser → the installer is ~5 MB instead of ~85 MB.

The Rust backend also uses far less memory than Node.js. A typical Tauri app idles at
~50–80 MB RAM vs ~250 MB for Electron.

**The deciding factor for this project** was Android support. Tauri 2.x can compile to
Android APK from the same frontend code. Electron cannot. This is architecturally the
correct choice for the use case: checking your collection at a card shop using your phone.

**Trade-off:** Tauri is less mature than Electron. Some plugins don't exist yet, and the
Android target requires more setup. But for a personal tool with a small feature set, this
is an acceptable trade-off.

---

### 3.2 Why Vanilla TypeScript, not React or Vue?

This is the most unusual decision in the project, and probably the first question any
developer will ask.

**React/Vue are not free.** They add:
- 40–100 KB of runtime JavaScript to every page load
- A virtual DOM reconciliation system that adds a layer of indirection between your data
  and the actual DOM
- A mental model (components, hooks, reactivity) that you must learn and maintain
- Build complexity (Babel, webpack/vite config, JSX/SFCs)

For a project with 24,000 cards and performance as a primary concern, every millisecond
matters. Adding a framework runtime that re-renders components on every state change would
work against the goal.

**The key insight:** This app has a *small number of distinct views*. It is not a
dynamic SPA with dozens of reusable components. It's three tabs, each with a list, a
filter bar, and a preview pane. That's maybe 15–20 DOM elements per "component". Vanilla
DOM manipulation is perfectly readable at this scale.

**What we lose without React:**
- No automatic re-rendering when state changes (we call `refresh()` manually)
- No component composition (we use functions that return `HTMLElement`)
- No state management library (we use module-level variables)

**What we gain:**
- Zero framework overhead — the entire app JavaScript bundle is ~44 KB
- Full control over when and what re-renders (crucial for virtual list performance)
- No version upgrades, no breaking changes, no dependency conflicts
- Any junior developer who knows HTML/CSS/JS can read and understand this code

---

### 3.3 Why IndexedDB for Everything?

The card database is ~10 MB of JSON. The user's collection data must survive browser
refreshes and app restarts.

**Why not `localStorage`?**

`localStorage` has a practical limit of ~5 MB. Trying to store 10 MB there will either
silently truncate or throw a `QuotaExceededError`. It's also synchronous — calling
`localStorage.setItem()` with 10 MB of data blocks the main thread for tens of
milliseconds.

```javascript
// This would block the UI for ~50ms with 10MB of data
localStorage.setItem("cards", JSON.stringify(allCards)); // ❌ too slow, too small
```

**Why not `sessionStorage`?**

Same limits as `localStorage`, plus data is lost when the tab/window closes.

**Why not a file on disk (via Tauri)?**

We could use Tauri's `tauri::command` to write a JSON file to the user's filesystem. But
then we'd need to implement our own serialization, file locking, atomic writes, and
migration logic when the data format changes. IndexedDB handles all of this for free.

**Why not SQLite via a Tauri plugin?**

This was the main alternative considered. SQLite would give us proper relational queries,
transactions with rollback, and better performance for complex queries. But the trade-off:

- Requires a Rust plugin (`tauri-plugin-sql`) and compiling Rust bindings
- The schema must be declared in SQL, not TypeScript
- All queries go through an async Tauri IPC bridge (slow for high-frequency reads)
- Our queries are simple: getAll, getByIndex, put, delete. IndexedDB handles these natively.

**IndexedDB wins for this use case** because all our data access patterns are trivially
expressible as key-value or index lookups. We never need joins.

---

### 3.4 Why Virtual Rendering?

Try opening a `<ul>` with 24,000 `<li>` elements. The browser must:
1. Create 24,000 DOM nodes
2. Calculate layout for all of them (width, height, position)
3. Paint them all to the GPU

On a modern machine this takes 500–2000 ms. The resulting page uses 200–400 MB of memory
just for the DOM. Scrolling becomes janky because the GPU must composite thousands of
layers.

**Virtual rendering** solves this by a simple insight: *the user can only see ~10–15 rows
at a time.* Why render 24,000?

Instead of creating 24,000 DOM nodes, we:
1. Create a single "spacer" div whose height equals `24000 × rowHeight` — this makes the
   scrollbar appear correctly sized
2. As the user scrolls, calculate which rows are currently visible
3. Render *only those rows* as absolutely-positioned divs inside the spacer

The DOM always contains at most ~20–30 nodes. Scroll performance is smooth because the
GPU composites only what's visible.

---

### 3.5 Why One File, One Responsibility?

Early in development, it's tempting to put everything in one big file. It's faster. You
don't have to think about module boundaries. But as the project grows, a 1000-line file
becomes impossible to reason about: where does a change need to go? What does changing
this function break?

The rule in this project: **one file = one clear concern**. Examples of how this plays
out:

- `filters.ts` has *zero* DOM imports. It only knows about data. This means you can test
  it without a browser — just call the functions with mock data.
- `virtual-list.ts` knows nothing about cards, collections, or the app. It's a generic
  `VirtualList<T>` that works with any type.
- `types.ts` is the single source of truth for all interfaces. If `Card` changes, there
  is exactly one place to change it, and TypeScript will immediately tell you everywhere
  the change breaks.

**The cost:** More import statements. More files to navigate. But the benefit — knowing
*exactly where to look* when something breaks — outweighs this.

---

### 3.6 Why TypeScript Strict Mode?

TypeScript without `strict: true` is closer to JavaScript with optional type hints. You
can write `function foo(x: any)` and TypeScript won't complain. Strict mode eliminates
this escape hatch.

What strict mode enforces:
- `noImplicitAny` — you cannot have untyped variables; every variable must have an
  inferred or explicit type
- `strictNullChecks` — `null` and `undefined` are not assignable to non-nullable types;
  you must explicitly handle them
- `strictFunctionTypes` — function type variance is checked correctly

In practice this means:

```typescript
// Without strict — TypeScript silently allows this, runtime error at 3am
function getCardName(card) {
  return card.name.toUpperCase(); // crashes if card is null
}

// With strict — TypeScript forces you to handle the null case
function getCardName(card: Card | null): string {
  return card?.name.toUpperCase() ?? "Unknown";
}
```

Every runtime bug prevented by the type checker is a bug that never reaches the user.
For a personal tool this matters less, but for portfolio demonstration it shows discipline.

---

### 3.7 Why SHA-based auto-update instead of just a timer?

The naive update strategy is: re-fetch `cards.json` every 7 days. This works, but has
a problem — if the database is updated on day 2, users wait 5 more days to get the new
cards. If updated on day 6, they wait 1 day. The staleness window averages 3.5 days.

The better strategy: on every startup, ask GitHub *"has cards.json changed since I last
fetched?"* — using the GitHub Commits API. This returns the latest commit SHA in ~50ms
(no big download). If the SHA matches the cached SHA, skip. If different, fetch the new
`cards.json` in the background.

```typescript
async function checkForUpdates(meta: CacheMeta): Promise<void> {
  showUpdateSpinner(true);
  try {
    const latestSha = await fetchLatestCommitSha();   // ~50ms, just metadata
    if (!latestSha || latestSha === meta.lastCommitSha) return; // up to date
    await doFetchAndCache();                           // ~854ms, re-fetch full data
    showToast(`Cards updated — ${allCards.length.toLocaleString("id-ID")} cards loaded.`);
  } finally {
    showUpdateSpinner(false);
  }
}
```

**Why non-blocking?** The `checkForUpdates()` call is fire-and-forget — the UI loads
from cache instantly (~33ms) and the SHA check runs in parallel. The user sees the app
working immediately; if an update arrives, a toast appears without any page reload.

**Rate limit handling:** The GitHub API allows 60 unauthenticated requests per hour. A
`fetchLatestCommitSha()` that returns `null` (due to rate limiting or network error) is
treated as "up to date" — the app falls back to the 7-day staleness threshold. No user-
visible error for a background check failure.

**Trade-off:** This requires a network round-trip on every startup. For offline use, the
SHA check fails silently and cached data is used as-is. Acceptable for a personal tool.

---

### 3.10 Extracting a DOM builder with callbacks instead of module state access

`buildEditSection` in `collection-tab.ts` grew to 122 lines. It built the qty/move/remove
edit UI for the collection preview pane. Extracting it to `collection-edit.ts` required
deciding how it communicates back to its caller.

**The problem:** the function's event handlers needed to:
- Update `allEntries` (module-level state in `collection-tab.ts`)
- Call `applyFilters()`, `renderStats()`, `closePreview()` (private functions)
- Trigger `loadCollectionTab()` after a move

**Three options:**

**Option A — Pass all state by reference:** Pass `allEntries`, `virtualList`, etc. as
arguments. Fragile — JS passes arrays by reference but reassigning (`allEntries = filtered`)
wouldn't be seen by the caller. Only mutations would propagate, not reassignments.

**Option B — Export everything from collection-tab.ts:** Make private functions public and
import them in `collection-edit.ts`. Creates tight coupling and circular dependency risk.

**Option C — Callbacks (chosen):**
```typescript
export interface EditCallbacks {
  onQtyChanged: (updatedEntry: CollectionEntry) => void;
  onRemoved: (id: number) => void;
  onMoved: (entry: CollectionEntry, toLocation: string, qty: number) => Promise<void>;
}
```

`collection-edit.ts` handles: DOM building + DB writes (`updateCollectionEntry`,
`removeCollectionEntry`) + `showConfirm` dialogs.

`collection-tab.ts` supplies callbacks that close over module state:
```typescript
buildEditSection(entry, locations, {
  onQtyChanged: (updated) => { syncEntryInList(updated); renderStats(); onCollectionChanged?.(); },
  onRemoved:    (id)      => { allEntries = allEntries.filter(e => e.id !== id); applyFilters(); ... },
  onMoved:      async (e, loc, qty) => { await movePartial(e, loc, qty); await loadCollectionTab(); ... },
})
```

**Result:** `collection-edit.ts` has zero knowledge of collection-tab internals.
`collection-tab.ts` drops from 493 → ~375 lines. Dependencies flow only one direction.

---

### 3.9 Cross-tab shared state: callback pattern vs. direct import

The `collectionQtyMap` in `main.ts` is derived state — a `Map<cardCode, totalQty>`
built from the collection store and used by Browse tab rows to render the ×N badge.

**The problem:** `collection-tab.ts` mutates the collection store (remove, qty change,
move) but `main.ts` doesn't know when to re-derive the map. Two solutions exist:

**Option A — Direct import (rejected):**
```typescript
// collection-tab.ts
import { refreshCollectionOverlay } from "./main.ts"; // circular dependency!
```
`main.ts` imports `collection-tab.ts`; `collection-tab.ts` importing `main.ts` creates
a circular module graph. TypeScript allows circular imports in some cases, but they are
fragile and make dependency flow hard to reason about.

**Option B — Callback at init time (chosen):**
```typescript
// main.ts
initCollectionTab(allCards, () => { refreshCollectionOverlay().catch(() => {}); });

// collection-tab.ts
let onCollectionChanged: (() => void) | null = null;
export function initCollectionTab(cards: Card[], onChange?: () => void): void {
  onCollectionChanged = onChange ?? null;
  // ...
}
// In every mutation handler:
onCollectionChanged?.();
```

**Why Option B?** The callback is passed *down* from parent (`main.ts`) to child
(`collection-tab.ts`). Dependency only flows one direction: `main.ts → collection-tab.ts`.
`collection-tab.ts` doesn't need to know what `main.ts` does with the notification — it
just fires the callback. This is the same pattern React uses for `onChange` props.

---

### 3.8 Why Rust-side file dialog instead of TypeScript plugin API?

For Export/Import, two approaches were available in Tauri 2.x:

**Option A — TypeScript plugin API:**
```typescript
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
const path = await save({ filters: [{ name: "JSON", extensions: ["json"] }] });
if (path) await writeTextFile(path, content);
```

**Option B — Rust commands (chosen):**
```rust
#[tauri::command]
async fn export_backup(app: tauri::AppHandle, content: String) -> Result<bool, String> {
    let path = app.dialog().file()
        .add_filter("JSON Backup", &["json"])
        .set_file_name("vg_collection_backup.json")
        .blocking_save_file();
    let Some(path) = path else { return Ok(false) };
    let p = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(p, content).map_err(|e| e.to_string())?;
    Ok(true)
}
```

**Why Option B?**
- Option A requires configuring `tauri-plugin-fs` scope permissions — specifying which
  directories the webview is allowed to write to. For user-chosen save paths (which can
  be anywhere), this requires a broad wildcard scope, which is a security trade-off.
- Option B lets Rust handle both the dialog and file I/O. `std::fs` has no scope
  restrictions — it's the Rust process, not the webview, doing the file write. Only
  `tauri-plugin-dialog` is needed (no `tauri-plugin-fs`).
- Simpler capability config: `"dialog:default"` only, no fs scope declarations.

**Key discovery:** `FilePath` (returned by `blocking_save_file`) is an enum from
`tauri-plugin-fs` that wraps either a `PathBuf` (desktop) or a URL (mobile/Android
content URIs). Use `path.into_path()` to extract the `PathBuf`, which always succeeds
on desktop.

---

## 4. Deep Dives

### 4.1 IndexedDB: How It Really Works

IndexedDB is a **transactional key-value store** built into every browser. It is
asynchronous, supports large datasets (gigabytes), and persists across sessions.

**Mental model:** Think of it as a database with:
- Multiple **stores** (like tables, but schema-less)
- **Indexes** on store properties (for fast lookups without full scans)
- **Transactions** that group operations atomically

#### Opening the Database

```typescript
// cache.ts — openDB()
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    //   DB name ──────┐  version ─┐
    const req = indexedDB.open("vg_collection", 3);

    // onupgradeneeded fires when:
    // 1. The DB doesn't exist yet (first run)
    // 2. The version number increased (schema migration)
    req.onupgradeneeded = () => {
      const db = req.result;

      // createObjectStore = create a "table"
      // Only called if the store doesn't exist yet
      if (!db.objectStoreNames.contains("cards")) {
        db.createObjectStore("cards"); // key-value, manual keys
      }

      if (!db.objectStoreNames.contains("collection")) {
        const col = db.createObjectStore("collection", {
          keyPath: "id",        // which field is the primary key
          autoIncrement: true,  // id is assigned automatically
        });
        // Create indexes for fast lookups
        col.createIndex("cardCode", "cardCode", { unique: false });
        col.createIndex("location", "location", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
```

**Why version 3?** Every time the schema changes (new store added, new index), you
increment the version. IndexedDB calls `onupgradeneeded` to run your migration code.
This project has had 3 schema versions as new stores were added (cards → collection →
wishlist → locations).

#### The Transaction Wrapper

Raw IndexedDB API is verbose and callback-heavy. We wrap it in a helper:

```typescript
// collection-db.ts — tx() helper
function tx<T>(
  storeName: string,       // which store to open
  mode: IDBTransactionMode, // "readonly" or "readwrite"
  op: (store: IDBObjectStore) => IDBRequest<T>, // the actual operation
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      const db    = await openDB();             // get connection
      const t     = db.transaction(storeName, mode); // open transaction
      const store = t.objectStore(storeName);    // get store reference
      const req   = op(store);                  // run the operation

      // IDB is callback-based; we convert to Promise
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
      t.oncomplete  = () => db.close();         // close connection when done
    } catch (err) {
      reject(err);
    }
  });
}
```

**Usage examples:**

```typescript
// Read all entries
export function getAllCollectionEntries(): Promise<CollectionEntry[]> {
  return tx<CollectionEntry[]>("collection", "readonly", (s) => s.getAll());
}

// Write/update a single entry
export function updateCollectionEntry(entry: CollectionEntry): Promise<IDBValidKey> {
  return tx<IDBValidKey>("collection", "readwrite", (s) => s.put(entry));
  // put() = insert if no id, update if id exists
}

// Delete by primary key
export function removeCollectionEntry(id: number): Promise<undefined> {
  return tx<undefined>("collection", "readwrite", (s) => s.delete(id));
}
```

#### The Merge-or-Add Pattern

The most complex IndexedDB operation in the app — adding a card to collection while
deduplicating same `cardCode + location` pairs:

```typescript
// collection-db.ts — mergeOrAdd()
export function mergeOrAdd(cardCode: string, location: string, qty: number): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const db    = await openDB();
    const t     = db.transaction("collection", "readwrite");
    const store = t.objectStore("collection");

    // Use the cardCode index to find ALL entries for this card
    const req = store.index("cardCode").getAll(cardCode) as IDBRequest<CollectionEntry[]>;

    req.onsuccess = () => {
      // Look for an entry that matches both cardCode AND location
      const existing = req.result.find((e) => e.location === location);

      if (existing) {
        // Merge: add to existing quantity
        store.put({ ...existing, quantity: existing.quantity + qty });
      } else {
        // Create: new entry (id is undefined → autoIncrement assigns one)
        store.add({ cardCode, location, quantity: qty });
      }
    };

    req.onerror  = () => reject(req.error);
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror    = () => reject(t.error);
  });
}
```

**Why is all this in one transaction?** If we used two separate transactions (one to
check, one to write), another operation could sneak in between them and create a
duplicate. A single transaction guarantees the check and write are atomic.

#### Storing 10 MB as a Single Value

The card database is stored as a single giant record:

```typescript
// cache.ts
const CARDS_KEY = "all"; // literal string key

export async function saveCards(cards: Card[]): Promise<void> {
  await tx("cards", "readwrite", (store) => store.put(cards, CARDS_KEY));
  // Stores all 24,000 cards as one value under the key "all"
}

export async function loadCards(): Promise<Card[] | null> {
  return tx<Card[]>("cards", "readonly", (store) => store.get(CARDS_KEY));
}
```

**Why not store each card individually?** We never query by individual card — we always
load all cards and filter in JavaScript. Storing 24,000 individual records would mean
24,000 IDB read operations vs one. The single-value approach loads the entire dataset in
one fast read (~33 ms from cache).

---

### 4.2 VirtualList Algorithm

**The problem:** 24,000 DOM nodes is too many. The solution: only render what's visible.

**Core insight:** If each row is a fixed height (62px), then:
- Row 0 is at `top: 0px`
- Row 1 is at `top: 62px`
- Row N is at `top: N × 62px`
- Total list height = `24000 × 62 = 1,488,000px`

We can make the scrollbar *look* correct by creating a spacer div with height 1,488,000px.
Then we only render the rows that fall within the visible viewport.

#### Full Implementation Walkthrough

```typescript
// virtual-list.ts
export class VirtualList<T> {
  private container: HTMLElement; // the scrollable outer div
  private spacer: HTMLDivElement; // inner div — actual rows go here
  private items: T[] = [];
  private options: Required<VirtualListOptions<T>>;
  private rafId: number | null = null; // requestAnimationFrame ID

  constructor(container: HTMLElement, options: VirtualListOptions<T>) {
    this.container = container;
    this.options = { buffer: 6, onRowClick: () => {}, emptyMessage: "No results", ...options };

    // Make container scrollable
    this.container.style.overflowY = "auto";
    this.container.style.position  = "relative";

    // Spacer: its height = total rows × rowHeight
    // This makes the scrollbar sized correctly
    this.spacer = document.createElement("div");
    this.spacer.style.position = "relative";
    this.spacer.style.width    = "100%";
    this.container.appendChild(this.spacer);

    // Scroll handler: throttled via requestAnimationFrame
    const scrollHandler = () => {
      if (this.rafId !== null) return; // skip if RAF already pending
      this.rafId = requestAnimationFrame(() => {
        this.renderVisible();
        this.rafId = null;
      });
    };
    this.container.addEventListener("scroll", scrollHandler);
  }

  setItems(items: T[]): void {
    this.items = items;
    // Update spacer height to match total list height
    this.spacer.style.height = `${items.length * this.options.rowHeight}px`;
    this.container.scrollTop = 0; // reset scroll when new data arrives
    this.renderVisible();
  }

  private renderVisible(): void {
    const total = this.items.length;
    if (total === 0) {
      this.spacer.innerHTML = `<div class="virtual-list-empty">...</div>`;
      return;
    }

    const { rowHeight, buffer, renderRow } = this.options;
    const scrollTop = this.container.scrollTop;    // how far user has scrolled
    const viewport  = this.container.clientHeight; // visible height in px

    // Which row index is at the top of the viewport?
    //   scrollTop=0 → firstIdx=0
    //   scrollTop=62 → firstIdx=1 (one row scrolled past)
    //   scrollTop=620 → firstIdx=10 (ten rows scrolled past)
    // We subtract `buffer` to render extra rows above the viewport
    // (so fast scrolling doesn't show blank space)
    const firstIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);

    // Which row index is at the bottom of the viewport?
    //   scrollTop=0, viewport=620 → (0+620)/62 = 10, so rows 0-10 visible
    // We add `buffer` below too
    const lastIdx = Math.min(
      total - 1,
      Math.ceil((scrollTop + viewport) / rowHeight) + buffer
    );

    // Clear previous render, replace with current visible rows
    this.spacer.innerHTML = "";

    for (let i = firstIdx; i <= lastIdx; i++) {
      const row = renderRow(this.items[i], i); // caller's DOM builder

      // Absolute positioning: each row is placed at exactly the right Y coordinate
      row.style.position = "absolute";
      row.style.top      = `${i * rowHeight}px`; // ← this is the key calculation
      row.style.left     = "0";
      row.style.right    = "0";
      row.style.height   = `${rowHeight}px`;

      row.addEventListener("click", () => this.options.onRowClick(this.items[i], i));
      this.spacer.appendChild(row);
    }
    // For 24,000 items at viewport height 620px:
    // firstIdx ≈ 0, lastIdx ≈ 10 + 6 (buffer) = 16 → 17 DOM nodes total
  }
}
```

**Why `requestAnimationFrame` (RAF)?**

The `scroll` event fires many times per second — potentially 60–120 times/sec as the user
scrolls. If we called `renderVisible()` on every single event, we'd be doing 120 DOM
re-renders per second, which would cause jank.

RAF tells the browser: "run this function once, right before the next screen repaint."
If multiple scroll events fire before the next repaint, we only process the last one:

```typescript
if (this.rafId !== null) return; // already scheduled, skip this event
this.rafId = requestAnimationFrame(() => {
  this.renderVisible(); // runs once per frame, not once per scroll event
  this.rafId = null;
});
```

This gives us at most 60 renders/second — smooth without being wasteful.

---

### 4.3 VirtualGrid Algorithm

VirtualGrid extends the VirtualList concept to two dimensions. Instead of rows, we have
*grid rows* — each grid row contains N *cells* side by side.

**Additional challenge:** The number of columns depends on the container width, which can
change if the user resizes the window or the preview pane opens/closes. We use
`ResizeObserver` to react to width changes.

#### Column Count Calculation

```typescript
// virtual-grid.ts
private _recalcCols(): void {
  const w = this.container.clientWidth || 320; // container width in pixels
  // Each cell is 160px wide, with a gap between cells
  // Formula: how many 160px cells fit in w, accounting for gaps?
  this.cols = Math.max(1, Math.floor((w + this.opts.gap) / (160 + this.opts.gap)));
}
// Example: w=700px, gap=10px
// (700 + 10) / (160 + 10) = 710 / 170 = 4.17 → floor → 4 columns
```

**Why `Math.floor` not `Math.round`?** If a 5th column doesn't fully fit, we don't want
it half-visible. `Math.floor` ensures we only show columns that fit completely.

#### Grid Row Calculation

```typescript
private _rowH(): number { return this.opts.cellHeight + this.opts.gap; }
// e.g. cellHeight=200, gap=10 → rowH=210

private _rowCount(): number { return Math.ceil(this.items.length / this.cols); }
// 24000 items, 4 cols → ceil(24000/4) = 6000 grid rows

private _updateHeight(): void {
  this.spacer.style.height = `${this._rowCount() * this._rowH()}px`;
  // 6000 rows × 210px = 1,260,000px spacer height
}
```

#### Rendering Grid Rows

```typescript
private _render(): void {
  const rowH    = this._rowH();
  const scrollTop = this.container.scrollTop;
  const viewport  = this.container.clientHeight || 600;
  const buf = this.opts.buffer;

  // Same visible-range math as VirtualList, but in grid-row units
  const firstRow = Math.max(0, Math.floor(scrollTop / rowH) - buf);
  const lastRow  = Math.min(this._rowCount() - 1, Math.ceil((scrollTop + viewport) / rowH) + buf);

  this.spacer.innerHTML = "";

  for (let r = firstRow; r <= lastRow; r++) {
    const rowEl = document.createElement("div");
    // CSS Grid makes the cell layout automatic
    rowEl.style.cssText = `
      position: absolute;
      top: ${r * rowH}px;        /* Y position of this grid row */
      left: ${gap}px;
      right: ${gap}px;
      display: grid;
      grid-template-columns: repeat(${this.cols}, 1fr); /* equal-width columns */
      gap: ${gap}px;
    `;

    // Items in this grid row: indices [r*cols, r*cols+1, ..., r*cols+cols-1]
    const start = r * this.cols;
    const end   = Math.min(start + this.cols, this.items.length);
    for (let i = start; i < end; i++) {
      const cell = this.opts.renderCell(this.items[i], i);
      cell.addEventListener("click", () => this.opts.onCellClick(this.items[i]));
      rowEl.appendChild(cell);
    }
    this.spacer.appendChild(rowEl);
  }
}
```

**ResizeObserver — reacting to container width changes:**

```typescript
this.ro = new ResizeObserver(() => {
  this._recalcCols();  // recalculate column count for new width
  this._updateHeight(); // spacer height changes if col count changes
  this._render();       // re-render with new layout
});
this.ro.observe(container); // watch for size changes on the container
```

`ResizeObserver` is the modern replacement for listening to `window.resize`. It fires when
the *element* (not the window) changes size — which happens when the preview pane opens
or closes.

---

### 4.4 TypeScript Module Architecture

#### types.ts — Single Source of Truth

All interfaces live in one file:

```typescript
// types.ts
export interface Card {
  enCardNo:   string;     // "DZ-BT12/001EN"
  setCode:    string;     // "DZ-BT12"
  cardNumber: string;     // "001"
  name:       string;
  unitType:   UnitType | null; // typed union, not just string
  nations:    string[];   // array because some cards have dual nations
  grade:      number | null;
  trigger:    TriggerType;
  rarity:     string | null;
  imageUrlEn: string | null;
}

export interface CollectionEntry {
  id?: number;       // optional: undefined when creating, present after DB assigns it
  cardCode: string;
  quantity: number;
  location: string;
}
```

**Why `grade: number | null` not `grade: number`?**

Some cards (like Order cards) don't have a grade. If we typed it as `number`, TypeScript
would allow `null` to slip in at runtime. With `number | null`, every consumer of `grade`
must explicitly handle the null case:

```typescript
// TypeScript forces you to handle null:
const display = card.grade !== null ? `G${card.grade}` : "—";
```

#### filters.ts — Pure Functions, Zero DOM

```typescript
// filters.ts — no import from DOM, no document.querySelector
export interface FilterState {
  query:      string;
  set:        string;
  nation:     string;
  unitType:   string;
  trigger:    string;
}

// Pure function: same input always produces same output, no side effects
export function applyFilters(cards: Card[], filter: FilterState): Card[] {
  let result = cards;
  if (filter.query) {
    const q = filter.query.toLowerCase();
    result = result.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.enCardNo.toLowerCase().includes(q)
    );
  }
  if (filter.nation !== "all") {
    result = result.filter((c) => c.nations.includes(filter.nation));
  }
  return result;
}
```

**Why does this matter?** Because `filters.ts` has no DOM dependencies, you can test it
with a simple Node.js script:

```typescript
import { applyFilters } from "./filters.ts";
const testCards = [{ name: "Blaster Blade", nations: ["United Sanctuary"], ... }];
const result = applyFilters(testCards, { nation: "Dragon Empire", ... });
console.assert(result.length === 0); // no Dragon Empire cards in test data
```

No browser, no mocking, no test framework needed.

#### The Module Graph — No Circular Imports

```
types.ts  (no imports)
    ↑
cache.ts  (imports types.ts)
collection-db.ts (imports cache.ts, types.ts)
filters.ts  (imports types.ts)
    ↑
filter-bar.ts (imports filters.ts)
virtual-list.ts (no app imports)
virtual-grid.ts (no app imports)
card-row.ts (imports types.ts)
card-tile.ts (imports types.ts)
collection-row.ts (imports types.ts)
    ↑
card-preview.ts (imports collection-db.ts, types.ts)
collection-tab.ts (imports collection-db.ts, virtual-list.ts, virtual-grid.ts, ...)
wishlist-tab.ts (imports collection-db.ts, virtual-list.ts, virtual-grid.ts, ...)
    ↑
main.ts (imports everything, coordinates all modules)
```

`main.ts` is the only file that imports from multiple other modules. No circular
dependencies anywhere. This is intentional — circular imports cause subtle initialization
order bugs that are very hard to debug.

---

### 4.5 Tauri: WebView + Rust Bridge

#### How Tauri Works

```
┌─────────────────────────────────────────┐
│              Rust Process               │
│  ┌──────────────────────────────────┐   │
│  │         WebView Window           │   │
│  │  ┌────────────────────────────┐  │   │
│  │  │   Your HTML/CSS/JS app    │  │   │
│  │  │   (runs in the WebView)   │  │   │
│  │  └────────────────────────────┘  │   │
│  │           ↕ IPC bridge           │   │
│  │  (invoke() / emit() / listen())  │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │       Rust Commands              │   │
│  │  #[tauri::command]               │   │
│  │  fn read_file(...) -> String {}  │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

The WebView runs your TypeScript app. When the app needs to do something the browser
cannot do (access the filesystem, show native dialogs), it calls a Rust command via IPC.

#### Invoking Rust from TypeScript (Phase 3.5 pattern)

```typescript
// Frontend TypeScript
import { invoke } from "@tauri-apps/api/core";

// Call the Rust function "export_collection"
const filePath = await invoke<string>("export_collection", {
  data: JSON.stringify(entries),
  format: "csv",
});
```

```rust
// src-tauri/src/lib.rs
#[tauri::command]
async fn export_collection(data: String, format: String) -> Result<String, String> {
    // Show native save dialog
    // Write file to disk
    // Return the chosen file path or an error
    Ok("/path/to/saved/file.csv".to_string())
}

// Register the command in app builder
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![export_collection])
    .run(...)
```

**Why does this require Rust?** The browser's security model prevents JavaScript from
writing arbitrary files to the filesystem. Tauri's Rust backend runs outside the browser
sandbox and can call operating system APIs. The IPC bridge is the controlled channel
between these two security boundaries.

#### Content Security Policy (CSP)

CSP tells the browser which resources the page is allowed to load. In this project, CSP
is configured in `index.html`:

```html
<meta http-equiv="Content-Security-Policy"
      content="
        default-src 'self';
        img-src 'self' https://en.cf-vanguard.com data:;
        connect-src 'self' https://raw.githubusercontent.com https://api.github.com;
        style-src 'self' 'unsafe-inline';
      ">
```

**Reading this:**
- `default-src 'self'` — by default, only load resources from the same origin
- `img-src ... https://en.cf-vanguard.com` — allow card images from this CDN
- `connect-src ... https://raw.githubusercontent.com` — allow fetch() to GitHub
- `style-src 'self' 'unsafe-inline'` — allow inline styles (needed for virtual list
  absolute positioning)

The Tauri config (`tauri.conf.json`) currently has CSP disabled for development
convenience. This **must** be re-enabled before any public release — without CSP, a
malicious card in the database could inject JavaScript that runs in the app context.

---

## 5. Performance Analysis

> **Honest disclaimer:** The numbers below come from a single measurement session on one
> machine (Windows 11, i7, 16 GB RAM). Systematic profiling with DevTools is planned for
> Phase 3.5.

**App startup — cache hit (card data already in IndexedDB):**
- Load 24,262 cards from IndexedDB: ~33 ms
- Apply initial filters: ~5 ms
- Render first ~15 visible rows: ~2 ms
- **Total: ~40 ms from click to usable app**

**App startup — cache miss (first launch or after clear):**
- Fetch 10 MB from GitHub: ~854 ms (depends on network)
- Parse 10 MB JSON: ~23 ms
- Save to IndexedDB: ~120 ms
- **Total: ~1000 ms**

**Filter operations:**
- Text search on 24,262 cards: estimated < 20 ms (JavaScript Array.filter is fast)
- Dropdown filter change: same

**Why is IndexedDB load (33 ms) so much faster than network (854 ms)?**

IndexedDB reads from the local disk (or OS file cache if recently accessed). Local disk
read for 10 MB is in the 20–50 ms range. Network is limited by TCP handshake, TLS,
GitHub CDN latency, and bandwidth. Even on a fast connection, raw network latency adds
100–300 ms before a single byte is received.

---

## 6. What I Would Do Differently

These are honest retrospective observations — things I'd change if starting over today.

**1. Measure performance from day 1, not as an afterthought**

The performance targets in CLAUDE.md were written without measuring. "< 100ms for filter"
is a guess. I should have set up a simple performance test early:

```javascript
const t0 = performance.now();
applyFilters(allCards, filter);
console.log(`Filter took: ${performance.now() - t0} ms`);
```

This takes 2 minutes to add and gives real data. Not measuring means you might optimize
the wrong thing.

**2. Plan the location data model more carefully**

The `Location` concept went through three iterations:
1. Just a free-text string on `CollectionEntry` (no separate store)
2. A separate `locations` IndexedDB store for autocomplete
3. Realized later that entries with typed locations (not in the manager store) couldn't
   be used as move destinations — bug!

If I had designed the data model with "locations can come from two sources" in mind from
the start, this bug would not have happened. Lesson: **write down the data model edge
cases before writing code**.

**3. Virtualization should have been the first thing built, not the last**

I built the UI first, then added `VirtualList` when performance became a problem. Because
of this, the initial list renderer (which created 24k DOM nodes) was mixed into the UI
code. Extracting it into a generic `VirtualList<T>` class required refactoring all the
call sites.

Starting with `VirtualList<T>` from day 1 would have meant zero refactoring and a
generic, reusable component from the beginning.

**4. IndexedDB schema migration strategy**

Every time I added a new store, I incremented the DB version and added a `if (!db.objectStoreNames.contains(...))` check. This works for additive migrations (adding
new stores) but would fail for destructive migrations (renaming a field, changing a
store's keyPath).

A more robust approach: write a migration function per version number:

```typescript
req.onupgradeneeded = (event) => {
  const oldVersion = event.oldVersion;
  if (oldVersion < 1) migrate_v0_to_v1(db);
  if (oldVersion < 2) migrate_v1_to_v2(db);
  if (oldVersion < 3) migrate_v2_to_v3(db);
};
```

**5. TypeScript `strict: true` from the very first commit**

I added strict mode early, but not from commit zero. There was a brief period of writing
code without it, then fixing dozens of type errors when it was enabled. It's much easier
to start strict and stay strict.

**6. The module size limit (200 lines) should have been enforced earlier**

`collection-tab.ts` grew to 410 lines before the `buildEditSection` function was
identified as an extraction candidate. If I'd enforced the 200-line limit more aggressively,
I would have extracted it at ~220 lines instead of waiting until 410. The cost of
refactoring grows with file size.

---

*Last updated: Phase 3 complete + Phase 3.5 planned.*
*See [REFLECTION.md](REFLECTION.md) for personal lessons and growth notes.*
