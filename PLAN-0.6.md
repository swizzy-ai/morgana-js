# 0.6: the browser flips state, the compiler does the rest

Written after the Swizzy studio (`budding-gilgamesh/swizzy`, commit `0b9bea4`)
shipped a browser action that was raw DOM: 30 `addEventListener` /
`querySelector` / `el.style` / `history` / `sessionStorage` escapes, and a
100ms tick that pushed ~8 prop writes through the style resolver (3
`resolvePropsToCss` calls each), plus re-styling 6 log rows per line.

## The principle

Everything that changes on screen is a **state value**. The compiler turns
"what this looks like when state is X" into CSS at build time. In the browser,
an action writes state; the engine writes **one attribute** or **one text
node**, and the browser's style engine does the rest. No action touches the
DOM, and nothing per-frame goes through the style resolver.

Swizzy is used as the test case. Every escape it has maps to one of six
engine features below.

## A. Declared state

`ctx.ui.state.define(key, { initial, address?, keep? })`, in the compile lane.

- `address: 'view'`: the key follows the query string both ways. A write
  calls `replaceState`, and back/forward or a link sets the state. This
  replaces `writeUrl` and the hand-rolled param reading.
- `keep: 'session' | 'device'`: the key survives a reload (`sessionStorage`
  or `localStorage`, inside the engine). This replaces `saveBrief` and the
  theme's `localStorage` call.
- Restored by an inline head script **before first paint**, so there is no
  flash of the wrong view or theme.
- **Performance fixes that come with it:**
  - State lives in memory. Today every `state.get` JSON-parses a `<script>`
    tag, and every commit parses it, stringifies it, then stringifies twice
    more to compare.
  - `setState({...})` becomes **one** commit: one notify per changed path,
    instead of a full commit per key.

## B. Conditions: styles that apply when something is true

Today we have `onHover` and `onScreen(bp)`. This adds three more, all
compiled to plain CSS selectors:

| Condition | Helpers word (proposed) | Compiles to |
|---|---|---|
| a state key has a value | `make(x).while('view', 'work')` | `[data-s-view="work"] [data-entity=x]` |
| another object is open / has files over it | `make(x).whileOpen('panel')`, `make(x).whileFilesOver('composer')` | `[data-entity=panel][data-open] ~ …`, `[data-entity=composer][data-dragover] [data-entity=x]` |
| position in a list | `make(x).ifLast()`, `make(x).ifFromEnd(2)` | `:nth-last-child(n)` |

The engine reflects onto `<html>` **only** the keys that conditions use (the
manifest lists them), and they compose with `onScreen`. Also:

- **`shown()` / `hidden()`** work as condition targets.
- **`appears(preset).for(ms)`** compiles to `@starting-style` plus a
  transition, so an object animates whenever it starts showing, including a
  freshly stamped list row. Wrapped in `prefers-reduced-motion:
  no-preference`. Closes GAPS #14.
- **`easesHeight()`** on a container: when a condition changes what's inside
  it, the engine measures, writes, measures again and plays one height
  animation. One forced layout per change, never per frame.

What becomes CSS in Swizzy:

- the four views
- the rail
- the theme and device switches
- the whole phone/desktop preview layout
- the panel split (frame padding)
- the drop overlay
- the paused dot
- the review key
- the live URL
- the log's fading lines and the typing cursor

## C. Runtime lists (GAPS #24)

- A list's content template compiles into an inert `<template>` with its
  `*field` slots.
- Bind the list to a state array (`bind('data', 'log')`). The engine diffs
  by key: it inserts, removes and updates rows, writing fields through the
  prop writer.
- Rows carry `data-tpl`, so the template's compiled CSS styles every row.
- A click inside a row dispatches with **origin = the template object** and
  `payload.row = { list, key, record }`. One binding (`origin: 'att-x'`)
  serves every row.

Swizzy loses ~300 slot objects: the log, file chips, attachments, the done
list, the site nav and features, and the service tiles.

## D. The events the page actually needs

- **`key:<combo>`**, for example `key:Escape` or `key:Mod+Enter`. The origin
  is the focused object. The engine emits the listener only when a binding
  uses it, and prevents the browser default when one matches.
- **`acceptsFiles`** on any object:
  - dragging files over it gives it the `dragover` state (depth-counted, and
    cleared on dragend or a drop elsewhere);
  - `filesAdded` fires with `{ files: [{ name, size, type, preview }] }`,
    where `preview` is an object URL for images;
  - `browseWith: 'addbtn'` opens the picker from another object.
- **Two-way input binding.** An input bound `value: brief` writes the state
  as you type. Closes GAPS #23 for bound inputs.
- **Drawer and dialog finished:**
  - slide and fade motion;
  - Escape for a dialog too;
  - `swipeToClose` on a drawer;
  - `open` reflected as `data-open`, so other objects can condition on it;
  - `focus` on open.

  The preview panel becomes a `drawer` (placement `end`, `pin`), and the
  approval card becomes a `dialog`.

## E. Bindings write through the prop writer

`writeBinding` today handles only text, value, src and href. Everything else
becomes a dead `data-prop-*` attribute. Changes:

- Route every binding through `applyProp`, so any prop can be bound:
  placeholder, image, background, textColor, label, width.
- Cache each kind's default CSS once, instead of resolving it on every write.
- Paint `progress` with `transform: scaleX` (no layout), and bind the track
  and ad bar as `progress` objects.

## F. Colour mode is state

`ctx.ui.theme.set('system' | 'light' | 'dark')` writes the reserved key
`mode`, kept per device and restored before paint. The switches style
themselves with `while('mode', 'dark')`. Closes GAPS #17.

## Swizzy, rewritten in design order

**State:**

| Key | Behaviour |
|---|---|
| `view` | follows the address |
| `service` | follows the address |
| `brief` | kept for the session; the textarea is two-way bound to it |
| `ready` | |
| `attachments[]` | |
| `log[]` | trimmed to 6 |
| `files[]` | |
| `meter{time, tokens, credit, debt, pct, adPct, step}` | |
| `ad` | |
| `hero` | |
| `build` | `idle`, `running`, `paused` or `done` |
| `deploy` | `idle`, `busy` or `done` |
| `device` | |
| `built{name, offer, cta, colours}` | |

**Actions:** each is bound with its own origin, so the compiled dispatch is
a key lookup and the one big `switch` goes away.

| Action | Event | Writes |
|---|---|---|
| pickService | clicked `svc-tile` (row = service) | `service`, `view: brief` |
| backToPick | clicked `svc-chip` | `view: pick` |
| checkBrief | `state:brief` | `ready` |
| attach | filesAdded `composer` | append `attachments` |
| detach | clicked `att-x` (row) | remove from `attachments` |
| start | clicked `start`, `key:Mod+Enter` on `freeta` | starts the simulation |
| approve / anotherHero / review | clicked `ap-ok` / `ap-alt` / `review-key` | `hero`, `build`, dialog open |
| deploy / download / again | clicked | `deploy`, `note`, `view` |
| device / mode | clicked the switch | `device`, `mode` |
| openPreview | clicked `thumb` | drawer open |

**The simulation:**

- It stands in for the `job` server object. It writes the **same state
  shape** the server will send, once per 100ms, as one `setState`.
- When the backend lands, the objects bind to `object:job/<id>.*` instead,
  and the page code does not change.
- What a tick costs: one commit, the few text nodes whose value changed, and
  two compositor-only progress writes.

**What's left in the action:** formatting, the brief parser, and the timer.
No `document`, `window`, `history`, storage or `style`.

## Order of work

1. **Engine.** Each step comes with sdk-compile tests (496 today):
   - E: bindings through `applyProp`, in-memory state, batched commits
   - A: declared state
   - B: conditions
   - C: lists
   - D: events, drawer and dialog
   - F: colour mode as state
2. **Helpers words:** `while`, `whileOpen`, `whileFilesOver`, `ifLast`,
   `ifFromEnd`, `appears`, `easesHeight`, `acceptsFiles`, `shown`/`hidden`.
3. **Swizzy rewrite** against the local link. Check it in the browser pane
   against the current look (commit `0b9bea4`).
4. **GAPS.md:** close #14, #17, #23, #24, #27. Then the release flow (0.6.0).

## Status: built (2026-10-15)

All six features are in `sdk-compile`. Swizzy's studio is rewritten on them
and was checked in the browser through a full build: pick, type, drop files,
⌘/Ctrl+Enter, approve, done, preview, phone, theme, Escape, drag, reload.

**What changed from the plan:**

- **Drawer and dialog were not finished. Plain boxes plus conditions do the
  job.** The preview panel and the approval card are boxes:
  - shown `while('panel', 'open')`, with `appears` / `leaves`;
  - closed by `key:Escape`, by a backdrop click, or by `released` from
    `dragsAside`.

  This turned out more general than finishing the two kinds. Their own
  open/close is still `style.display` with no motion.
- **Declared keys reflect only when a condition reads them.** The brief you
  type never touches `<html>`. `theme.mode` is the exception, because it
  lands on `<body>` before paint.
- **The new events are `filesAdded`, `released` and `key:<combo>`**, written
  like any other: `composer.filesAdded`, `grab.released`,
  `freeta.key:Mod+Enter`.

**Known gaps:**

- A link straight to `?view=work` shows the empty work view for a frame
  before the `loaded` action sends it back to the brief. Resuming a build
  needs the job server object (Swizzy TODO.md).
- `easesHeight` measures twice per change, by design. Not run per frame.
- The browser pane's animation clock does not run, so transitions there sit
  at their start values. Check motion in a real browser.
