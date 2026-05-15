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

### Bug 3: Move qty input max not synced after +/− changes

**What happened:** In the collection preview pane, the "Move copies" section has a
number input with `max = entry.quantity`. If the user first clicks `[+]` to increase qty
from 2 to 3, then tries to move 3 copies, the input rejects 3 because `max` is still 2
(the original value at preview open time).

**Current status:** Known bug, not yet fixed. Added to Known Technical Debt in CLAUDE.md.

**Root cause:** `moveQtyInput.max` is set once when the edit section is built:
```typescript
moveQtyInput.max = String(currentQty); // set at build time, never updated
```

The `[+]`/`[−]` click handlers update `currentQty` but don't update `moveQtyInput.max`.

**The fix (planned):** After each `[+]`/`[−]` click, update both:
```typescript
currentQty++;
qtyDisplay.textContent = String(currentQty);
moveQtyInput.max = String(currentQty); // sync the move input's max
```

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

The `collection-tab.ts` file grew to 410 lines because each feature addition felt
incremental: "just add this small thing." But small things compound. The 200-line limit
in CLAUDE.md exists for exactly this reason — it's a forcing function to extract focused
modules before the file becomes a monolith.

**Lesson:** A 200-line file that needs extraction is much easier to refactor than a
500-line file. The longer you wait, the more the code gets entangled.

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
