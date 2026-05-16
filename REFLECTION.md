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

**After this project, I:**
- Understand IndexedDB transactions, indexes, and schema migration at a low level
- Can implement virtual rendering from scratch and explain why it works
- Use TypeScript generics naturally and understand when they add value
- Understand the Tauri architecture (WebView + Rust process + IPC bridge) and how it
  differs from Electron (no bundled Chromium)
- Have written ~2,000 lines of vanilla TypeScript without a framework and found it
  readable and maintainable

**What I'm still learning:**
- Rust — currently enough to understand Tauri's backend but not enough to write Rust
  commands confidently. Phase 3.5 will push this forward.
- Performance profiling — I know how to use DevTools but haven't systematically measured
  this app. Adding real numbers to the performance section of LEARN.md is on the list.
- Testing — this project has no automated tests. The filters module (`filters.ts`) is
  pure and easily testable; writing tests for it would be a good next step.

---

*See [LEARN.md](LEARN.md) for the technical deep-dives.*
