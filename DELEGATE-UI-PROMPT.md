# Delegate Prompt — Complete UI System + Actions on QuickJS

**Hand this file to the delegate agent as-is. It is self-contained.**

---

## 1. Mission

Build the **complete UI feature** for the Morgana runtime and **run client actions via QuickJS**.

- You consume the **Morgana declarative UI system** (defined below — this is your contract).
- A separate system will generate the **compiler down to GPUI** from the same declarative spec. **That codegen is not yours. Do not write, read, or modify it.** Your job ends at: a spec-driven UI model + a QuickJS action executor that any generated compiler can drive.
- Output: a runtime component (crate/package, your choice of embedding: `rquickjs` for Rust or `quickjs-emscripten` for JS) that takes the declarative spec as **data** and exposes every UI behavior and action execution described in §3–§6.

## 2. The core idea

UI is **not code**. UI is a **recorded object graph**: a page creates objects, sets props, places children, binds data, wires events. The compiler's shape phase executes the recording API, and the result is plain data (`ProjectIR`). The web lane renders that data to HTML/CSS today. Your lane renders/drives the same data and executes action handlers inside QuickJS. Same spec, different sink.

**Law: domain knowledge never lands in the generic runtime.** The host knows "objects and kinds", never what a specific app means. Never add kind-specific special cases to generic code paths — the kind/prop vocabulary below is data you dispatch on.

## 3. The declarative system — intermediate representation (verbatim)

Source of truth: `packages/sdk-compile/src/ir.ts`.

```ts
export type ObjectKind = string

export interface ObjNode {
  id: string
  kind: ObjectKind
  props: Record<string, unknown>
  children: string[]          // ordered child ids
  parentId: string | null
  contentTemplateId: string | null   // bind() content template (declaration, not a rendered child)
  bindings: BindingRecord[]
  breakpointProps: Record<string, Record<string, unknown>>  // breakpoint -> props
  tracked: string[]           // activity names registered via track()
  inlineWhens: InlineWhenRecord[]
  customObject?: string       // component identity; kind stays a normal kind
}

export interface PageNode {
  name: string
  address: string             // route path, default `/{name}`
  rootIds: string[]
  app: string | null
}

export interface AppNode {
  name: string
  displayName?: string
  pages: string[]
  type?: 'web' | 'desktop'
  platform?: { bundleId: string; icon?: string }
  window?: { width?: number; height?: number; frameless?: boolean; transparent?: boolean; resizable?: boolean; title?: string }
}

export interface BindingRecord {
  prop: string
  source: string               // state path like 'catalog.products' or raw array
  shape?: { items?: string; key?: string; fields?: Record<string, string> }
}

export interface InlineWhenRecord {
  objectId: string
  event: string
}

export interface ProjectIR {
  objects: Map<string, ObjNode>
  pages: Map<string, PageNode>
  // … plus apps/stores/channels/triggers/libraries/customObjects.
  // UI = objects + pages + apps. The rest is not your concern.
}
```

A `ProjectIR` serialized to JSON is your **input**. Treat it as read-only.

## 4. The declarative system — recording API (how the spec is authored)

Source of truth: `packages/sdk/src/handles.ts`, runtime recording in `packages/sdk-compile/src/compile-ctx/handles.ts`. Compile-lane actions (`config.on: 'compile'`) execute this API and every call lands in the IR. **Your runtime must honor the semantics these calls produce.**

### 4.1 Object handle surface

```ts
get(prop) / set(prop, value) / setProps(props)
make(tokenOrProps)                     // transformer shorthand: make('red') | make('radius','lg') | make({...})
setWithBreakpoint(bp, prop, value)     // responsive layer -> breakpointProps
setWithBreakpoint(bp, props)           // e.g. setWithBreakpoint('tablet', { layout: 'row', gap: 8 })
getWithBreakpoint(bp, prop) / breakpointProps() / clearBreakpoint(bp, prop?)

place(child)                            // surfaces only; hierarchy + order
place(child, { mode: 'free', at: [x, y] })  // free placement over a parent
addContent(template)                    // register composed object as bind() content template
bind(source, shape?)                    // data-bound list: records flow through, no manual place()
clone(opts) / copy(opts) / move(to) / remove()

when(event, handler) -> Unsubscribe     // wire event (catalog name or tracked source)
track(event, opts?) -> EventSource      // register shareable activity source (idempotent)
emit(event, payload)                    // direct emit on the handle
animate(name, opts?)
```

Values may be **resolvers**: a literal, a path into state, or a function.

### 4.2 Typed handle behaviors

- `ButtonHandle`: `click()`, `disable()`, `enable()`, `setLoading(bool)`
- `InputHandle`: `value` get/set, `clear()`, `focus()`, `blur()`, `validate()`, `setError(msg)`
- `ListHandle`: `append(record)` (state-backed stamping), `patch(record)` (O(1) tail patch), `lock()/unlock()` (suppress restamps during streaming), `subscribe(store, opts)`
- `PageHandle`: `address`, `params` (route + query, live), `route(path)`, `spa(route?)`, `app(name)`, `navigate(path)`
- Object kinds only accept `place()` (surfaces); others are leaves — placement on a non-surface is a build error.

### 4.3 Kind vocabulary

**Surfaces (may hold children)** — `packages/sdk-compile/src/compile-ctx/handles.ts:8`:

```
page box container grid card group stage vstack hstack
tabs accordion dialog dropdown tooltip form login signup
header main footer nav section article slot list link button
```

**Special render kinds** — `packages/sdk-compile/src/render/node.ts:117–184`:

```
button input textarea select table tabs dialog badge alert image
toggle switch checkbox radio list lister chart progress form login
signup label accordion dropdown menu tooltip breadcrumbs avatar
separator skeleton slot video audio markdown code
```

**Generic kinds** (render via default path): `box text vstack hstack grid card link header footer nav section main article image …` — anything not special-cased. `kind` is a plain `string` in the IR; unknown kinds must degrade to the generic path, never crash.

**Families** — `packages/sdk/src/families.ts`: `interactive | spatial | graphic` (+ aliases, e.g. `stack` → spatial). Checked against a compatibility table when placing.

### 4.4 Prop and token vocabulary — `packages/sdk/src/layout.ts`, `props.ts`

```
LAYOUT_TOKENS   col row grid stacked none horizontal vertical h v
ALIGN_TOKENS    start center end stretch baseline left right
JUSTIFY_TOKENS  start center end between around evenly
SURFACE_TOKENS  (surface fill tokens)
RADIUS_TOKENS   none sm md lg xl 2xl full
BUTTON_VARIANTS primary secondary outline ghost danger success
TEXT_ALIGNS     start center end left right justify
INPUT_TYPES     text password email number search tel url date time color range hidden
PAGE_VIEWPORTS  fill hug
```

Core props used by every example: `layout, align, justify, gap, pad, spacing, grid: { cols }, width, height, font, content, label, src, variant, icon, iconPosition, radius, style (raw CSS string), display`.

### 4.5 Breakpoints, measures, icons, state

```ts
ctx.ui.breakpoints.define('tablet',  { minWidth: 640 })
ctx.ui.breakpoints.define('desktop', { minWidth: 1024 })
ctx.ui.measure.define('content', 300)             // named size unit
ctx.ui.icons.define('check', { kind: 'glyph', glyph: '✓' })
ctx.ui.icons.define('arrow', { kind: 'library', library: 'lucide', name: 'arrow-right' })

ctx.ui.state.set('cart.open', true)               // dot-path state store
ctx.ui.state.get('cart.open')
```

Breakpoint props are an **override layer** keyed by breakpoint; effective props = base props overridden by the active breakpoint's map. Active breakpoint = the highest-defined breakpoint whose `minWidth` is satisfied.

### 4.6 Data binding semantics

`bind(source, shape?)` on a container:
- `source` is a state path (`'catalog.products'`) or a literal array.
- Records auto-flow through the container — **no manual `place()` per instance**.
- `shape.items` selects the array; `shape.key` is the record key; `shape.fields` renames fields onto the template.
- The content template (registered via `addContent`) is instantiated **per record**; prop bindings of the form `*field` resolve against the record. The template is a declaration, never a rendered child.
- State change to `source` re-instantiates (or patches) the children.

## 5. Events → actions

### 5.1 Action factories — `packages/sdk/src/actions.ts`

```ts
defineClientAction({ config, handler })   // ClientContext — UI objects/state/theme. THIS IS YOURS.
defineServerAction({ config, handler })   // ServerContext — runs in the backend. Not yours.
defineDesktopAction({ config, handler })  // DesktopContext — the host. Not yours.
```

- `handler: (ctx) => output` — **ctx only, never an args parameter.**
- `config.on` wires the action: `'compile'` (shape phase, runs idempotently at build time), `'http.get /path'`, `'cron(...)'`, `'store.x.record.created'`, `'channel:name'`.
- The exported const name **is** the action name.
- Client actions currently execute in the browser's bundled JS (`defineClientAction` → `handler` source bundled and emitted). **Your job: execute those same `handler` sources inside QuickJS.**

### 5.2 Event flow (web reference — mirror this shape)

1. Author wires: `btn.when('click', handler)` / `handle.track('change', …)` → recorded as `inlineWhens` / `tracked`.
2. DOM-ish events dispatch `dispatchPageEvent(event, origin, objectId, payload)` → `packages/sdk-compile/src/client/dom-events.ts`.
3. Handler or binding calls `ctx.actions.run(name, params)` → HTTP to the backend (`packages/sdk-compile/src/client/actions.ts`).
4. Backend result patches state / emits events → UI re-renders from state.

### 5.3 QuickJS execution contract

Execute the client action handler **source** in a QuickJS context. Inject these host APIs (they must be **your** shims, matching what the web runtime provides):

```js
ctx.ui.state.get(path)                     -> value          // backed by your state store
ctx.ui.state.set(path, value)              -> value
ctx.ui.theme.get() / ctx.ui.theme.set(mode)
ctx.actions.run(name, params)              -> Promise<result>  // POST to the local backend over HTTP (loopback), never a direct import
ctx.navigate(url, opts)
ctx.dispatchPageEvent(event, origin, id, payload)
ctx.ui.<objectId>.<prop reads/writes>       // live object access for handlers that touch handles
```

- Handlers may be async; honor returned promises.
- A handler source that reaches anything outside the injected surface throws a **named** error (`compileOnly`-style: e.g. *"server-only op in client action <name>"*) — never undefined, never a silent no-op.
- State writes must round-trip: `state.set` in QuickJS is visible to the UI model and to bindings.
- QuickJS is not yet a dependency of this repo. Choose the binding (`rquickjs` or `quickjs-emscripten`) and declare it explicitly.

## 6. What "complete UI feature" means (definition of done)

1. **Spec intake**: accept a `ProjectIR` (JSON) and build the live object graph — all of §3.
2. **Every handle behavior in §4** works against the graph: place/set/setProps/make/breakpoints/bind/when/track/clone/move/remove, typed handle behaviors (§4.2), free placement, data binding with template instantiation (§4.6), breakpoint override resolution (§4.5).
3. **A render-agnostic view interface**: expose the resolved tree (kind + effective props + children + resolved bindings/state) per frame. Do NOT encode GPUI, HTML, or any platform knowledge — the generated compiler consumes this interface.
4. **Events dispatch** to `when` handlers and tracked sources; payloads arrive intact.
5. **Client actions run in QuickJS** end to end: handler source executes, `ctx.ui.state.*` round-trips, `ctx.actions.run` reaches a backend over HTTP and its result is applied back to state (§5.3).
6. **Verification**: drive the real demo spec — `examples/sdk-compile-demo` (`morgana.config.ts`, compile-lane actions in `src/actions/compile/`) — and assert: landing page graph matches the IR, breakpoint switches flip effective props, a `bind` list instantiates N records, `state.set('cart.open', true)` is observed by bindings, and one client action (`src/actions/client/`) executes in QuickJS.

## 7. Read these files (in order)

| File | Why |
|---|---|
| `packages/sdk-compile/src/ir.ts` | The IR — your input contract |
| `packages/sdk/src/handles.ts` | The authoring API surface |
| `packages/sdk-compile/src/compile-ctx/handles.ts` | How calls record into the IR (surfaces table, placement rules) |
| `packages/sdk-compile/src/compile-ctx/registries.ts` | breakpoints/measure/icons registries |
| `packages/sdk/src/layout.ts`, `packages/sdk/src/props.ts` | Tokens + prop vocabulary |
| `packages/sdk-compile/src/render/node.ts` | Kind dispatch reference (the kind semantics web chose) |
| `packages/sdk-compile/src/style/props.ts` | How props resolve to effective values per kind |
| `packages/sdk-compile/src/client/runtime.ts` | How the web applies props/bindings to elements |
| `packages/sdk-compile/src/client/dom-events.ts` | Event dispatch shape |
| `packages/sdk-compile/src/client/actions.ts` | `ctx.actions.run` shape |
| `packages/sdk/src/actions.ts` | Action factories + config |
| `examples/sdk-compile-demo/src/actions/compile/landing.ts` | The full declarative authoring style |
| `examples/sdk-compile-demo/morgana.config.ts` | Config, apps, desktop block |

## 8. Constraints

- **Do not modify**: the IR types, the recording API, the compiler packages, or anything under `desktop-lane.mjs`'s ownership. This task **consumes** the system; it does not change it.
- **No platform knowledge** in your model layer (§6.3). No HTML tags, no GPUI types, no CSS strings interpreted by you — `style` is an opaque passthrough string.
- Unknown kinds, unknown props, unknown tokens: **degrade to generic + warn**, never throw, never crash mid-render.
- No new domain vocabulary. Reuse the names above exactly — the generated compiler and the rest of the system already speak them.
- Handler code is untrusted at runtime: it runs in QuickJS with only the injected surface. Anything else = named error.
- Keep the component free of server/desktop concerns: no `ctx.server`, no `ctx.os`, no filesystem. It is the UI lane + the action executor, nothing else.
