# VG Collection — Reflection: Mistakes, Lessons & Growth

Personal notes on what went wrong, what surprised me, and how I grew as a developer
while building this project. This is a companion to [LEARN.md](LEARN.md) — where LEARN.md
explains the *technical* decisions, this document explains the *human* side.

---

## Bugs I Introduced (and How They Were Found)

### Bug 1: Move destination list was empty when locations were typed, not managed

**What happened:** A user with a card in "Storage A" could not move it to "Storage B"
because the move destination dropdown showed "No other locations — add one via the
Locations button."

**Root cause:** The move section populated its destination options from `getAllLocations()`
which reads the `locations` IndexedDB store — populated only when locations are added via
the Location Manager modal. But many users type location names directly in the free-text
input and never open the Manager. Those locations are stored as strings in
`CollectionEntry.location` but not in the locations store.

**How it was found:** Manual testing — the user tried to move a card and noticed the
move section was empty.

**The fix:** `renderPreview()` now merges both sources:
```typescript
const managerLocs = await getAllLocations();
const entryLocs   = [...new Set(allEntries.map((e) => e.location).filter((l) => l !== ""))];
const locations   = [...new Set([...managerLocs, ...entryLocs])].sort();
```

**Lesson:** Data can come from multiple sources that share the same "concept" (a location
name) but live in different places. Before building any UI that depends on a list of
values, ask: *where can these values come from?* If more than one source exists, merge
them.

---

### Bug 2: Removing `setupVirtualList()` left broken call sites

**What happened:** During a refactor, the `setupVirtualList()` function was deleted and
its logic folded into `refreshList()`. But two call sites in `handleLoad()` and
`doFetchAndCache()` still referenced the old function name — breaking the build.

**How it was found:** TypeScript compiler error during `npm run build`.

**Why TypeScript matters:** Without strict TypeScript, this would have been a silent
runtime error — the app would load but the card list would never render. TypeScript
caught it immediately at build time.

**Lesson:** When deleting or renaming a function, search for all call sites before
committing. Use TypeScript's "Find All References" or `grep` across the project.

---

### Bug 3: Move qty input max not synced after +/− changes ✅ Fixed

**What happened:** In the collection preview pane, the "Move copies" section has a
number input with `max = entry.quantity`. If the user first clicks `[+]` to increase qty
from 2 to 3, then tries to move 3 copies, the input rejects 3 because `max` was still 2
(the original value at preview open time).

**Root cause:** `moveQtyInput` was declared with `const` inside the `else` block that
builds the move UI. The `[+]`/`[−]` button handlers were defined before that block —
so they had no reference to `moveQtyInput` and couldn't update its `max`.

**The fix:** Hoisted `moveQtyInput` declaration to the outer closure scope:
```typescript
let moveQtyInput: HTMLInputElement | null = null; // hoisted before handlers

plusBtn.addEventListener("click", async () => {
  currentQty++;
  qtyDisplay.textContent = String(currentQty);
  if (moveQtyInput) moveQtyInput.max = String(currentQty); // sync!
  // ...
});

// later, inside the else block — assignment (not const):
moveQtyInput = document.createElement("input");
```

**Lesson:** When two parts of a function need to share a mutable reference, hoist the
declaration above both. `const` inside a block creates a new variable scoped to that
block — the outer closure can't see it.

---

### Bug 4: Full move created a duplicate entry instead of merging ✅ Fixed

**What happened:** A card with 3 copies in location A, after moving them one-by-one to B:
- Move 1 → 2 in A, 1 in B ✓
- Move 1 → 1 in A, 2 in B ✓
- Move last 1 → should be 3 in B, but instead: 1 in B (old) + 1 in B (new) — duplicate

**Root cause:** `movePartial` had two code paths:
```typescript
if (clampedQty >= entry.quantity) {
  // BUG: just renames the source entry's location field
  await updateCollectionEntry({ ...entry, location: toLocation });
} else {
  await updateCollectionEntry({ ...entry, quantity: entry.quantity - clampedQty });
  await mergeOrAdd(entry.cardCode, toLocation, clampedQty);
}
```

The "full move" path (`>=`) just changed the `location` field of the existing entry —
it never checked if the destination already had an entry. So if destination already had
copies, you ended up with two separate entries at the same location.

The "partial move" path (`else`) correctly used `mergeOrAdd`, which checks for existing
entries at the destination.

**The fix:** Full move now follows the same pattern as partial move — merge into
destination, then delete the source:
```typescript
if (clampedQty >= entry.quantity) {
  await mergeOrAdd(entry.cardCode, toLocation, entry.quantity);
  await removeCollectionEntry(entry.id!);
}
```

**Lesson:** When you have two code paths that solve "similar but not identical" cases,
make sure both paths are logically consistent. The partial-move path used `mergeOrAdd`
correctly; the full-move path took a shortcut that skipped the merge check. The shortcut
only works when the destination is guaranteed empty — which it isn't.

**Also added:** `deduplicateCollection()` — runs silently on every app startup to merge
any existing same-cardCode+location duplicates, plus disabled the Add button during async
to prevent double-click race conditions.

---

### Bug 5: Browse tab ×N badges not updated after Collection tab mutations ✅ Fixed

**What happened:** After removing a card from the Collection tab (or changing its
quantity), the Browse tab still showed the old ×N badge on that card's row.

**Root cause:** `collectionQtyMap` in `main.ts` is the shared lookup used by
`buildCardRow()` and `buildCardTile()` to render the badge. It was only refreshed via
the `onCollectionChanged` callback from the Browse preview pane — but Collection tab
mutations (remove entry, qty +/−, move) never notified `main.ts` that the map was stale.

**The fix:** Added an `onChange?: () => void` callback parameter to `initCollectionTab`.
Every mutation handler in `collection-tab.ts` calls `onCollectionChanged?.()` after
completing. In `main.ts`, the callback is wired to `refreshCollectionOverlay()`:

```typescript
// main.ts
initCollectionTab(allCards, () => { refreshCollectionOverlay().catch(() => {}); });
```

```typescript
// collection-tab.ts — every mutation path:
await removeCollectionEntry(entry.id!);
onCollectionChanged?.();          // notify main.ts to re-fetch collectionQtyMap
await loadCollectionTab();        // refresh the collection list itself
```

**Lesson:** When two tabs share derived state (the qty map), mutations in either tab
must trigger a refresh of the shared state — not just a refresh of the local view.
A callback passed down at init time is a clean way to notify the orchestrator
(`main.ts`) without creating a direct import dependency from `collection-tab.ts`
back to `main.ts` (which would be a circular dependency).

---

### Bug 6: Import dialog appeared in bottom corner instead of centered ✅ Fixed

**What happened:** The import mode dialog (Merge / Replace all) rendered in the
bottom corner of the screen instead of being centered like other modals.

**Root cause:** `showImportModeDialog` in `export-import.ts` created elements with
class names `confirm-overlay` and `confirm-box` — but those classes don't exist in
`styles.css`. The correct class for a full-screen centered overlay is `modal-overlay`
(which has `position: fixed; inset: 0; display: flex; align-items: center; justify-content: center`).
Without those styles, the element rendered with no positioning, landing at the bottom
of the document flow.

**The fix:** Switched to `modal-overlay` + `confirm-dialog` (the same classes used by
`confirm-dialog.ts`), added an `import-dialog` modifier class for extra width.

**Lesson:** When reusing a modal pattern, copy the exact CSS class names from an
existing working dialog — don't invent new ones that look similar. A class name typo
produces no error; it just silently fails to apply any styles.

---

### Bug 7: Confirm button was less prominent than Cancel ✅ Fixed

**What happened:** In all confirm dialogs, Cancel was styled blue (`btn-secondary`) and
Confirm was styled as a red outline (`btn-danger`). Users expect the primary action
(Confirm) to be the most prominent button, not Cancel.

**The fix:** Added `btn-neutral` (grey outline) for cancel/dismiss actions. Swapped:
- Cancel → `btn-neutral` (grey outline, low prominence)
- Confirm → `btn-secondary` (blue fill, high prominence)

For the import dialog specifically, replaced three separate action buttons (Cancel,
Replace all, Merge) with selectable mode cards + a single Confirm button that enables
only after a mode is chosen.

**Lesson:** Blue = "primary action", not "secondary/safe". A Cancel button should never
be the most visually prominent element in a dialog — that draws the eye away from the
intended action. Name your CSS classes semantically (`btn-neutral`, `btn-danger`) not
positionally (`btn-secondary`).

### Bug 8: Swipe-to-dismiss silently failed because of `passive: true` ✅ Fixed

**What happened:** The bottom sheet swipe gesture on Android did nothing. Touching the
preview pane and dragging downward scrolled the sheet's content instead of dismissing it.

**Root cause:** The `touchmove` listener was registered with `{ passive: true }` (the
browser default). A passive listener cannot call `e.preventDefault()` — the browser
ignores the call and scrolls the element anyway. So the scroll and the dismiss transform
competed, and the scroll always won.

The second root cause: the listener was only attached to the drag handle (`.preview-header`),
not the entire pane. If the user started the swipe from inside the content area, no listener
fired at all.

**How it was found:** Android device testing — the feature appeared to work in desktop
DevTools (mouse drag), because mouse events don't have the `passive` constraint that touch
events have.

**The fix:**
1. Moved the `touchstart`/`touchmove`/`touchend` listeners to the entire pane element.
2. Changed `touchmove` to `{ passive: false }` so `e.preventDefault()` is allowed.
3. Added a three-mode state machine (`none` → `dismiss`/`scroll`) — determined on the
   first 5px of movement. Only call `preventDefault()` in "dismiss" mode; let the browser
   handle scroll events in "scroll" mode. This prevents the gesture from blocking all
   vertical scrolling inside the sheet.

```typescript
pane.addEventListener("touchmove", (e) => {
  const delta = e.touches[0].clientY - startY;
  if (mode === "none") {
    if (Math.abs(delta) < 5) return;
    mode = delta > 0 && pane.scrollTop <= 0 ? "dismiss" : "scroll";
  }
  if (mode === "dismiss") {
    e.preventDefault(); // only blocks scroll when we're in dismiss mode
    pane.style.transform = `translateY(${Math.max(0, delta)}px)`;
  }
}, { passive: false });
```

**Lesson:** `passive: true` is the browser default for `touchmove` — it exists to
protect scroll performance. Any gesture that needs to *prevent* the default scroll must
explicitly opt out with `{ passive: false }`. DevTools mouse simulation doesn't expose
this constraint; always test gesture code on a real device.

---

### Bug 9: Bottom nav overlapped Android system navigation bar ✅ Fixed

**What happened:** On Android, the bottom navigation bar (Collection | Wishlist | Browse)
was partially hidden behind the system navigation bar (back/home/recents buttons). The
app header was also clipped by the status bar at the top.

**Root cause:** The `<meta name="viewport">` tag did not include `viewport-fit=cover`.
Without it, the browser restricts layout to the "safe" area automatically — but `env(safe-area-inset-*)` CSS variables return `0px`, so any manual safe-area CSS is also
ineffective. The bottom nav had no bottom padding to clear the system nav bar.

**The fix:**
1. Added `viewport-fit=cover` to the meta viewport tag — now the WebView fills the entire
   screen including behind system bars.
2. Defined `--safe-top` and `--safe-bottom` CSS variables in `:root` using
   `env(safe-area-inset-top/bottom, 0px)`.
3. Applied them everywhere that needed clearing:
   - `.app` top padding: `calc(16px + var(--safe-top))`
   - `.bottom-nav` height: `calc(var(--bottom-nav-h) + var(--safe-bottom))`
   - `.bottom-nav` bottom padding: `var(--safe-bottom)`
   - `.toast` bottom: `calc(var(--bottom-nav-h) + var(--safe-bottom) + 16px)`
   - `.preview-pane` bottom: `calc(var(--bottom-nav-h) + var(--safe-bottom))`

**Lesson:** `viewport-fit=cover` is the gate that enables safe area insets. Without it,
the CSS variables return zero even if they're referenced. The fix is two parts: turn on
the viewport setting, then apply the inset variables to every element that needs to be
aware of system bars.

---

### Bug 10: FOUC (Flash of Unstyled Content) on Android ✅ Fixed

**What happened:** On Android, the app briefly showed unstyled plain HTML — black text
on white, no layout — for a visible moment at startup before the actual UI appeared.

**Root cause:** In Vite dev mode, CSS is injected via JavaScript (a `<style>` tag is
created by a JS module). There's a brief window between "HTML parsed" and "CSS JS executed"
where the browser renders the page without styles.

**The fix:** Added a `<style id="fouc-guard">body { visibility: hidden }</style>` block
directly in `<head>` of `index.html`. This is parsed synchronously — the page is invisible
from the first frame. After `handleLoad()` completes in `main.ts`, the guard is removed:

```typescript
document.getElementById("fouc-guard")?.remove();
```

**Lesson:** When CSS is loaded via JavaScript (as in Vite dev mode or CSS-in-JS), it
arrives after the HTML is painted. A tiny synchronous `<style>` block in `<head>` hides
the page before any paint, then JS reveals it after everything is ready. In Vite production
builds, CSS is bundled as a static file and injected as a `<link>`, so FOUC doesn't occur
there — but the guard is harmless.

---

### Design Note: Undefined CSS variable `--danger` found

While adding `.toast--error` styles, discovered that `.location-delete-btn:hover` was using
`color: var(--danger)` — a variable that was never defined in `:root`. The button hover had
no red color at all. Fixed to `var(--red)`.

**Lesson:** CSS undefined variables silently compute to `inherit` or the initial value — no
error, no warning. Always search for `var(--` in styles.css when adding new variables to
confirm all usages are intentional.

---

### Design Note: `img.decoding="async"` should have been there from day one

During Phase 6 performance audit, I found all card image elements were missing `decoding="async"`. The browser default (`decoding="auto"`) may choose synchronous decode — blocking the main thread while parsing a JPEG, causing jank precisely when the user opens a preview pane or scrolls the grid. `decoding="async"` explicitly tells the browser to decode off the main thread.

The fix is one line per image creation site. The lesson: any `<img>` element that is not in the initial critical path (i.e., loaded after interaction) should have `decoding="async"` and `loading="lazy"` by default.

---

### Bug 12: JP nationless cards invisible to nation filter ✅ Fixed

**What happened:** In JP region Browse, filtering by **"-"** (nationless) returned no cards even though 1831+ JP cards have no nation. Nationless EN cards (Cray Elemental / Order) were also invisible to the filter.

**Root cause:** The JP scraper stored nationless cards with `nations: ["‐"]` (U+2010 Unicode hyphen — visually identical to `-` but a different codepoint). The filter compared against `"-"` (ASCII U+002D). The comparison never matched, so:
- Cards with `nations: ["‐"]` passed the `nation !== "all"` check (treated as having a nation)
- The `"-"` sentinel was never generated for the dropdown because no card had `nations: []` after the scraper ran

**The fix:** A Unicode-dash regex `/^[\-‐–—−]+$/` strips all dash variants before nation filtering. Any card where all nation entries are dash-only is treated as `nations: []`. A `"-"` sentinel is injected into the dropdown when any such card exists. Applied in `filters.ts`, `collection-tab.ts`, and `wishlist-tab.ts`.

**Root fix:** `fix_data.js` Fix 4 patched the one card whose data had the wrong value (`nations: ["‐"]` → `nations: []`), and the scraper was updated to skip Unicode-dash variants going forward.

**Lesson:** Unicode look-alike characters are a silent data quality problem. `"‐"` and `"-"` are visually identical in most editors. Never compare scraped string data with hardcoded literals without normalizing first — or use regex that covers the Unicode equivalents.

---

### Bug 13: Region button label wrong in BOTH mode ✅ Fixed

**What happened:** In BOTH mode, the `#regionBtn` label showed **"JP ▾"** instead of **"Both"**. Clicking it opened a context menu with "View EN / View JP" — but the user expected "Change Region" (the full dialog). Meanwhile there was no separate button for switching the active region (EN↔JP) within BOTH mode.

**Root cause:** `updateRegionButton()` reused the same single button for two semantically different actions — "change the overall region preference" and "switch which region is currently viewed." The logic was:
```typescript
// BUG: BOTH mode showed "JP ▾" because activeRegion was JP at the time
regionBtn.textContent = `${activeRegion} ▾`;
```

**The fix:** Added a second `#regionSwitchBtn` element to the header. In BOTH mode:
- `#regionBtn` always shows **"Both"** → opens Change Region dialog (the full onboarding-style flow)
- `#regionSwitchBtn` shows **"EN ▾"** or **"JP ▾"** → opens a context menu for switching EN↔JP

In single-region mode, `#regionSwitchBtn` is hidden.

**Lesson:** A single button that does different things depending on mode is error-prone. Two buttons with clear, stable labels is more readable and less bug-prone.

---

### Bug 11: Grouped view re-rendered full DOM on every filter keystroke ✅ Fixed

**What happened:** In "Grouped" view, typing in the collection search box triggered `applyFilters()` → `updateView()` → `renderGroupedView()` → `container.innerHTML = ""` + full rebuild on every keystroke, even when the filter result didn't change the entries.

**Root cause:** `renderGroupedView` always wiped and rebuilt the DOM unconditionally. For small collections this was invisible; for 300+ entries in many groups it caused measurable jank.

**The fix:** Added a module-level signature string (`_lastSig`) encoding entry ids+quantities+selectedId+collapsed set. If the sig matches the previous call, the function returns immediately without touching the DOM. This is O(n) string concatenation rather than O(n) DOM mutation.

**Lesson:** DOM mutations are expensive. The cheapest DOM operation is the one you don't do. Even simple "did the data change?" checks are worth adding before any full container wipe.

---

### Race condition caught in review: duplicate image downloads (never shipped) ✅ Fixed

**What was caught:** In the initial draft of `image-cache.ts`, `_downloadBackground` only checked `memCache.has(cardNo)` before starting a download. If the user opened the same card preview twice in rapid succession (both calls reach the "not cached" branch before either download completes), two parallel fetches for the same image would start — duplicating the HTTP request and the disk write.

**Root cause:** The guard only checked the result state (memCache), not the in-flight state (pending download).

**The fix:** Added `pendingDownloads: Set<string>` alongside `memCache`. `_downloadBackground` returns early if `pendingDownloads.has(cardNo)`. The set is cleared in a `.finally()` block so failures don't permanently block future retries.

**Lesson:** Any "check then act" pattern where the check and the act are not atomic needs an in-flight guard. Async operations in particular: the result cache and the pending-work cache are two different things.

---

### Bug 12: JS `fetch()` blocked by CORS when downloading card images ✅ Fixed

**What happened:** The first implementation of `_downloadBackground` in `image-cache.ts` used `fetch(cdnUrl)` to download card images. Every download attempt failed with `TypeError: Failed to fetch`.

**Root cause:** CDN image servers (en.cf-vanguard.com, cf-vanguard.com) serve images only for `<img src>` usage and do not include `Access-Control-Allow-Origin` response headers. `<img src>` requests are "no-cors" — the browser renders bytes without exposing them to JS. Programmatic `fetch()` calls enforce CORS and block the response when that header is absent.

**The fix:** Moved the HTTP download to Rust using `reqwest`. Rust is not a browser — it has no CORS concept and just makes an HTTP request like any native client.

**Lesson:** CORS is a browser-enforced policy applied to `fetch()` and `XHR` — NOT to `<img>`, `<video>`, or CSS `url()`. If a CDN works in an `<img>` tag but fails with `fetch()`, CORS is the first thing to check. Moving network I/O to the Rust side fully bypasses it.

---

### Bug 13: CDN returns fake 404 to non-browser User-Agents ✅ Fixed

**What happened:** After moving the download to Rust, the CDN started returning HTTP 404 for valid image URLs. Direct PowerShell test with `Invoke-WebRequest` confirmed the same URL returned 200. Rust reqwest with default User-Agent got 404.

**Root cause:** CDN uses fake HTTP 404 (not 403) as hotlink/bot protection. Requests without a browser-like `User-Agent` header are silently rejected as if the resource doesn't exist. The deception is intentional — a 403 would signal "blocked," a 404 doesn't reveal the protection exists.

**The fix:** Added a Chrome User-Agent header to the reqwest client. 404s disappeared.

**Distinguishing from genuine 404:** Some old Vanguard sets (original BT01, DZ-BT series) genuinely have no CDN images. These return 404 even with the correct User-Agent. The `memCache` null sentinel (`Map<string, string | null>`) handles this: 4xx → cache `null` → all future previews of that card skip the network entirely this session.

**Lesson:** A 404 from a CDN is not necessarily "file not found." CDN operators use fake 404 (rather than 403) to avoid revealing they have bot protection. Always verify a 404 with an independent HTTP client that sends browser headers before concluding the resource doesn't exist.

---

### Bug 14: Lightbox missing in Collection and Wishlist preview panes ✅ Fixed

**What happened:** Phase 9 added card images to Collection and Wishlist preview panes. Users clicking the image expected zoom (lightbox) — nothing happened. Browse tab had lightbox; the other two didn't.

**Root cause:** The lightbox was implemented as private methods inside `CardPreview` class (Browse tab only). When Phase 9 added `<img>` elements to Collection/Wishlist previews, no one wired up the click handler — there was no shared lightbox to call.

**The fix:** Extracted `lightbox.ts` — a module-level singleton with three exports (`showLightbox`, `hideLightbox`, `isLightboxOpen`). All three tabs import and call `showLightbox()` on image click. `CardPreview` delegates to the same functions. `main.ts` registers lightbox as the first `BackPane` so Android back button closes it from any tab.

**Lesson:** When a UI element needs to be triggered by multiple independent modules, it belongs in its own module as a singleton — not inside one caller's class. The moment a second caller needs it, it's already time to extract.

---

### Design decision: base64 text storage vs binary + asset protocol

When implementing offline image cache, there were two realistic options:

**Option A — binary file + `convertFileSrc` (Tauri asset protocol)**
- Write raw image bytes to disk, serve via `asset://localhost/path` URL
- Requires enabling `core:asset:scope` in Tauri capabilities with an explicit path allowlist

**Option B — base64 text via existing `write_text_file` / `read_text_file`**
- ~33% larger on disk (base64 overhead)
- Zero new Rust code, zero new capability config

Chose Option B. The storage overhead (10–40 MB for a typical collection) is acceptable, and avoiding new capability config removes a class of subtle breakage — Tauri capability identifiers can change between versions.

**Lesson:** Reusing existing infrastructure (even at a storage cost) reduces the surface area that can break. Premature optimization of storage format is not worth the configuration complexity.

### Bug 15: Browse location dropdown reset to first location when switching cards ✅ Fixed

**What happened:** In the Browse tab, selecting location B and adding a card, then opening a different card, the dropdown defaulted back to location A instead of B.

**Root cause:** `_buildCollectionSection()` builds the `<select>` fresh on every card open with no memory of the previous selection.

**The fix:** Added `private _lastLocation: string = ""` instance variable on `CardPreview`. Saved on add (`this._lastLocation = loc`), pre-selected on rebuild if present in current locations list.

**Lesson:** Any form filled repeatedly in a session should remember its last state. Lift the value to a scope that outlives the form's rebuild cycle — in a class, an instance variable.

---

### Bug 16: Import backup fails on Android with "INVALID URL PATH" ✅ Fixed

**What happened:** Tapping Import on Android, selecting a JSON backup file, returned error "INVALID URL PATH" instead of importing.

**Root cause:** On Android, the file picker dialog returns a **content URI** (`content://com.android.providers.downloads.documents/...`) instead of a regular file path. The `import_backup` Rust command called `path.into_path()` which fails for content URIs — they can't be converted to a `PathBuf`. The error from `into_path()` was propagated as-is to the frontend.

**The fix:** Added `tauri-plugin-fs` dependency. Changed `import_backup` to use `app.fs().read(file_path)` directly (passing the `FilePath` from the dialog without calling `into_path()`). `tauri_plugin_fs::Fs::read()` handles both regular paths (desktop) and content URIs (Android) transparently.

```rust
// Before (desktop only):
let p = path.into_path().map_err(|e| e.to_string())?;
let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;

// After (cross-platform):
let bytes = app.fs().read(file_path).map_err(|e| e.to_string())?;
let content = String::from_utf8(bytes).map_err(|e| e.to_string())?;
```

**Lesson:** On Android, file dialog results are content URIs, not file paths. Any Rust command that calls `into_path()` on a dialog result will silently fail on Android. The fix is `tauri-plugin-fs` which abstracts over both path types.

---

### Technical Note: Kotlin daemon cross-drive crash on Windows ✅ Fixed

**What happened:** `npm run tauri android build` crashed with `IllegalArgumentException: this and base files have different roots` from the Kotlin incremental compiler daemon.

**Root cause:** The project is on `E:\` while the Cargo registry (Tauri source files) is on `C:\`. The Kotlin incremental compiler tries to compute relative paths between source files and fails when they're on different Windows drive letters.

**The fix:** Added `kotlin.incremental=false` to `src-tauri/gen/android/gradle.properties`. Disables incremental compilation — build is slower but doesn't crash.

**Lesson:** Kotlin incremental compilation assumes all source files share the same root drive. On Windows, multi-drive setups (project on one drive, dependencies on another) require disabling it. This is a known Kotlin/Windows issue with no better workaround short of moving all files to the same drive.

---

## Process Insights

### The multi-question approach before implementing

Before implementing the filter/sort/grid view features, instead of just guessing what the
user wants, I asked 16 questions across 4 rounds. This felt slow, but the result was:

- Zero features implemented that weren't wanted
- Zero features omitted that were wanted
- Clearer requirements → less rework

**Lesson:** For any feature that has more than one reasonable interpretation, spend 5
minutes asking instead of 45 minutes implementing the wrong thing.

---

### Scope creep is easiest to prevent at architecture time

The `collection-tab.ts` file grew to 493 lines because each feature addition felt
incremental: "just add this small thing." But small things compound. The 200-line limit
in CLAUDE.md exists for exactly this reason — it's a forcing function to extract focused
modules before the file becomes a monolith.

Extracting `buildEditSection` to `collection-edit.ts` (122 lines) brought the file down
to ~375 lines. The key design decision: pass callbacks from the caller rather than
importing private state — keeping dependencies one-directional and avoiding circular imports.

**Lesson:** A 200-line file that needs extraction is much easier to refactor than a
500-line file. The longer you wait, the more the code gets entangled. When extracting a
function that accesses module-level state, the callback pattern is usually the cleanest
solution — it avoids both circular imports and fragile reference-passing.

---

### Commit messages matter more than you think

Early commits in this project had vague messages like "fix stuff" or "update". Later
commits have structured messages explaining the *why*, not just the *what*:

```
Fix: move destination list now merges Location Manager store + entry location strings
so moves work even when locations were typed directly rather than added via manager
```

When you come back to the project in 6 months, "fix stuff" tells you nothing. The
detailed message tells you exactly what was broken and why the fix is correct.

**Lesson:** Write commit messages as if you're explaining the change to yourself 6 months
from now — because you are.

---

## Technical Surprises

### File-based storage is simpler than I expected

When the decision was made to replace IndexedDB with JSON files for portability, I expected
the refactor to be complex — "implementing our own serialization, file locking, atomic
writes" (which is what I wrote in LEARN.md section 3.3 as a reason NOT to use files).

The actual refactor took one session and touched 3 files. The new `collection-db.ts` is
shorter and easier to read than the IDB version. The reason: a desktop app with a single
user and a small collection (< 500 entries) has zero concurrency concerns. The IDB transaction
model — which exists to handle concurrent reads and writes safely — was pure overhead for this
use case. A simple `read → modify → write` pattern does exactly the same thing with less code.

**Lesson:** Complexity borrowed from databases (transactions, indexes, schemas) is only
valuable if the use case has the problems those features solve. For a single-user JSON
collection, they don't.

---

### IndexedDB is faster than I expected

I expected IndexedDB to be slow and clunky. Loading 10 MB of JSON from it takes ~33 ms.
For comparison, a fresh network fetch takes ~850 ms. That's a 26× speedup from caching.
IndexedDB is effectively as fast as reading a file from disk — because that's what it is
under the hood.

### TypeScript generics make code genuinely reusable

`VirtualList<T>` and `VirtualGrid<T>` are parameterized by `T` — any type. The same
class works for `Card`, `CollectionEntry`, and `WishlistEntry` with no changes. This is
not just a syntactic trick; the compiler enforces that the `renderRow` function accepts
exactly `T` and nothing else.

Before using generics, I thought of them as "advanced TypeScript for library authors."
Now I reach for them whenever I build something that should be reused with different data.

### Vanilla TS is genuinely viable for small-to-medium apps

I was skeptical that you could build a non-trivial app without React or Vue. You can.
The key insight: **React solves the problem of managing state across many components that
re-render automatically.** If you have a small number of views and you don't mind calling
`refresh()` manually, you don't need React's machinery.

The constraint forces you to think clearly: "When does this UI need to update? Why? What
triggers it?" With React, re-renders happen automatically (sometimes too often), which
makes it easy to write code without fully understanding the data flow.

### Android environment setup is harder than the code

Setting up the Android build environment required installing Android Studio, SDK Platform
34, NDK 30.x, creating a virtual device, enabling USB debugging on the physical device,
and setting two environment variables (`ANDROID_HOME`, `NDK_HOME`) in the same terminal
session before running `tauri android dev`. Forgetting any one of these steps causes a
cryptic error.

The specific trap I hit: running `tauri android dev` in a new PowerShell session without
setting the env vars first. Tauri fell back to `AppData\Local\Android\Sdk`, triggered an
NDK reinstall, then failed with license errors. The fix was to use CMD (not PowerShell)
and set both vars before running the command.

**Lesson:** Android toolchain setup is a significant upfront cost. Document the exact
commands, in the exact shell, with the exact var names — not just "set up Android." Once
it works, don't change shells.

---

### CSS safe area insets are zero until `viewport-fit=cover`

Before Phase 5, I assumed `env(safe-area-inset-bottom)` would return a nonzero value on
Android if I referenced it in CSS. It returns `0px` unless the viewport meta tag includes
`viewport-fit=cover`. This isn't obvious from the property name — it looks like a read of
a system value, but it's actually gated on whether the WebView has opted into the
full-screen layout mode.

**Lesson:** `env(safe-area-inset-*)` is a two-step opt-in: first in HTML
(`viewport-fit=cover`), then in CSS (using the variable). One without the other is
silently ineffective.

---

### ResizeObserver is the correct tool for responsive layout

Before using `ResizeObserver`, I tried handling grid column changes with `window.resize`.
This was wrong: the grid container's width changes when the preview pane opens/closes,
but `window.resize` doesn't fire in that case. `ResizeObserver` fires when the *element*
resizes, regardless of cause. This is the correct primitive for responsive component
layout.

---

## Growth as a Developer

**Before this project, I:**
- Had used IndexedDB only through wrapper libraries (Dexie, localforage)
- Had never implemented virtual rendering
- Had only used TypeScript with React (where generics were mostly hidden)
- Thought Tauri was "just Electron with Rust instead of Node"
- Had never built a mobile-responsive UI without a component framework
- Had never handled Android-specific issues (safe area, back button, touch events)

**After this project, I:**
- Understand IndexedDB transactions, indexes, and schema migration at a low level
- Can implement virtual rendering from scratch and explain why it works
- Use TypeScript generics naturally and understand when they add value
- Understand the Tauri architecture (WebView + Rust process + IPC bridge) and how it
  differs from Electron (no bundled Chromium)
- Have written ~2,500 lines of vanilla TypeScript without a framework and found it
  readable and maintainable
- Can build a full mobile-responsive layout with Tailwind CSS v4 — bottom nav, bottom
  sheet, safe area insets, dark mode — without any component framework
- Understand the `passive` touch event constraint at a practical level — and that desktop
  DevTools mouse simulation hides this entire class of bugs
- Know how Android system bars interact with WebView layout (viewport-fit, safe-area-inset)
- Can intercept the Android back button via the History API (`pushState` / `popstate`)
  without any native plugin

**What I'm still learning:**
- Rust — currently enough to understand Tauri's backend but not enough to write Rust
  commands confidently without reference docs.
- Performance profiling on mobile — Android has different bottlenecks than desktop (GPU
  compositing, JS JIT warmup, WebView rendering pipeline).
- Testing — this project has no automated tests. The filters module (`filters.ts`) is
  pure and easily testable; writing tests for it would be a good next step.

---

*See [LEARN.md](LEARN.md) for the technical deep-dives.*
