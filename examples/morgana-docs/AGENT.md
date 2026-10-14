# Morgana Agent Pack

Distilled from the morgana-docs showcase (every claim below renders live at
`morgana dev` on the docs project). Copy this file into any Morgana project so
agents build with the framework instead of against it.

## 1. What Morgana is

TypeScript actions in three lanes; the compiler emits static HTML/CSS/client.js
plus sandboxed server actions. No routing or templating layer to learn.

| Lane | `config.on` | Runs | Ships to |
|---|---|---|---|
| compile | `'compile'` | Node, at build | nothing (shapes the IR) |
| server | none (called) / `'api…'`, `'cron…'`, `'store…'` | sandbox / dev host | `dist/server/actions/*.js` |
| client | `'clicked'`, `'changed'`, `'loaded'`, … | browser | `dist/assets/client.js` |

Project shape: `morgana.config.ts`, `src/actions/{compile,server,client}/`,
`src/objects/`, `assets/`. Scaffold with `morgana init <name>` (global
`morgana` must be the linked `@morgana/cli` — `morgana --version` is the tell).

## 2. Object catalog (18 handles, all under `ctx.ui.*`)

Every handle shares: `get/set/setProps/make/setWithBreakpoint/bind/place/
clone/copy/move/remove/when/track/emit/animate`. `ctx.ui.get(id)` is the only
runtime lookup; `ctx.ui.<kind>()` creation is compile-lane only (throws in browser).

- **box**: layout, align, justify, gap, pad, width/height, minW/minH/maxW/maxH, wrap, overflow, grow, surface, radius, border*, borderColor, borderWidth, bg, color, boxShadow, layer, grid. Also `hstack/vstack/container/grid/card/group/stage` creators.
- **text**: content, font, align, surface, radius, border*, bg, color. Fonts: `display display-lg h1 h2 h3 title subtitle body-lg body headline body-me body-sm caption mono`.
- **button**: label, content, disabled, type, variant (`primary secondary outline ghost danger success`), icon, iconPosition.
- **input**: value, placeholder, type, name (**required for `getValues()`**), min/max/step, disabled, error, icon.
- **image**: src, alt, width, height, fallback, aspectRatio, fit (`cover contain fill none`).
- **link**: href, target, textDecoration, icon (+ BoxProps).
- **list**: `append({label})` / `clear()`; stamped rows are plain `<li>`.
- **table**: columns (`key label width sortable filterable align variant format`), rows/data, pagination, sorting, filtering, selection, variant, density, stickyHeader, emptyText, loading.
- **dialog**: open, title, description, size (`sm md lg xl full`), variant (`default danger drawer confirm`), dismissible, confirmLabel, cancelLabel, showFooter. Parts: `overlay (data-close) / content / header / description / footer / cancel / confirm / dismiss`. Methods: `open()/close()`.
- **select**: options (`label value icon description disabled badge`), value, placeholder, multiple, searchable, clearable, disabled, variant.
- **tabs**: items (`key label content icon badge disabled`), activeKey, variant, orientation.
- **badge**: label, variant (`default success warning danger info purple outline pill`), icon, removable, dot.
- **alert**: title, description, variant (`info success warning danger`), dismissible, icon, visible, actionLabel.
- **toggle** (also `switch`, `checkbox`): checked, label, description, disabled, size (`sm md lg`), kind (`switch checkbox`). Methods: `toggle/check/uncheck/isChecked`.
- **form**: values, errors, isSubmitting, isValid, layout (`vertical horizontal inline`). Methods: `getValues/setValues/getValue/setValue/submit/reset/validate`.
- **progress**: value, max, showLabel, variant (`emerald sky amber rose purple`), striped, animated. Methods: `setValue/setProgress/increment/reset`.
- **chart**: kind (`bar line area pie donut scatter`), **series (`number[][]`), labels (`string[]`)**, palette, + `ChartStateView` (orientation, stacked, smooth, markers, axes, legend, gridlines). Methods: `setKind/setSeries/setLabels/setPalette/chartState/download`. SVG renderer; repaints on every setter.
- **accordion**: items (`key title content disabled defaultOpen`), value, multiple, collapsible (lock honored), variant (`outline subtle enclosed plain`), size (`sm md lg`). Methods: `open/close/toggle/isOpen/getOpenKeys/keys/setItems/setMultiple/setCollapsible/setVariant/setSize`. Structural writers sync the `data-*` attributes the click delegation reads.
- **slider**: value, min, max, step (snapped), orientation, disabled, size (`sm md lg`), variant (`outline solid`), showValue. Methods: `getValue/setValue/increment/decrement/setStep/setSize`. Native range input carries keyboard; drag repaints fill live, `change` dispatches once.
- **popover**: title, content, triggerLabel, placement (`top bottom left right`), size (`xs sm md lg`), open, closeOnOutside. Methods: `open/close/toggle/isOpen/setTitle/setContent/setPlacement/setSize`. Trigger toggles, outside click + Esc close.
- **drawer**: title, description, placement (`start end top bottom`), size (`xs sm md lg xl full`), open, dismissible. Methods: `open/close/toggle/isOpen/setTitle/setPlacement/setSize`. Shares dialog's overlay contract; Esc closes.
- **toast**: position (`top bottom top-start top-end bottom-start bottom-end`), duration (0 = sticky), max (cap, oldest first). Methods: `notify({title, description, variant, duration}) → id, dismiss(id?), clear, count`. Region starts empty; toasts stamped at runtime.
- **dropdown**: label/trigger, items (`label value href disabled active separator`), value, open, closeOnSelect, placement, disabled. Methods: `open/close/toggle/isOpen/setItems/setValue`. Item picks close the panel and dispatch `selected`.
- **menu**: same contract as dropdown, laid out horizontally, plus `selectItem(value)` (travels the click delegation, so close + `selected` behave like a user pick).
- **numberInput**: value, min, max, step, disabled, size, variant, placeholder, name. Methods: `getValue/setValue/increment/decrement/setStep`. Steppers clamp; typing mirrors.
- **pinInput**: value, length, disabled, size, mask, otp. Methods: `getValue/setValue/clear/focus`. Auto-advance, Backspace/arrow nav, `complete` event when full.
- **combobox**: options, value, placeholder, disabled, multiple, clearable. Methods: `getValue/setValue/setOptions/open/close/clear`. Search filters live; picks dispatch `changed` + `selected`.
- **layout primitives** (container, grid, card, group, stage, vstack, hstack, header, main, footer, nav, section, article): BoxProps each, track-only handles. Render through the generic path (element + per-object CSS).
- **login/signup**: FormProps each, full form contract (`getValues/setValues/submit/...`).
- **lister**: ListProps, full list contract. **slot**: SharedProps, track-only.
- **tagsInput**: value (`string[]`), placeholder, disabled, max. Methods: `getValue/setValue/add/removeAt/clear`. Enter/comma commits, Backspace drops last.
- **treeView**: items (nested `key label children disabled defaultExpanded`), expandedKeys, selectedKey. Methods: `expand/collapse/toggle/select/getSelected/getExpanded`.
- **rating**: value, max, disabled, size. Methods: `getValue/setValue/clear`. Hover previews via CSS.
- **editable**: value, placeholder, disabled. Methods: `getValue/setValue/edit/submit/cancel/isEditing`. Click edits, Enter/blur submits, Esc cancels.
- **fileUpload**: accept, multiple, maxFiles, disabled. Methods: `getFiles/clear/browse/refresh`. Names/sizes list locally; contents never leave the machine.
- **steps**: items (`key title description`), current, orientation, variant (`solid subtle`), size. Methods: `getCurrent/setCurrent/next/prev/setItems`. Per-step done/current/todo recomputed on every write.
- **timeline**: items (`title time content`), variant, size. Methods: `setItems`.
- **stat**: label, value, delta, trend, helpText, size. Methods: `setValue/setLabel/setDelta`.
- **tag**: label, variant (`subtle solid outline surface`), size, closable. Methods: `setLabel/setVariant/close` (× removes through delegation).
- **tooltip**: content/tip/label, placement, visible. Methods: `show/hide/toggle/isVisible/setContent`. Hover/focus delegation mirrors state; programmatic writes emit `changed`.
- **avatar**: src, alt, name, initials, status, size, shape, ring. Methods: `setSrc/setName/setStatus` (status creates/removes the dot; `none` clears).
- **textarea**: value, placeholder, name, rows, cols, disabled, error. Input-handle family (`value/clear/focus/blur/setError/validate`).
- **label**: content/label/text, for. Methods: `setLabel/setFor`.
- **separator**: orientation, variant (`solid dashed dotted`). Methods: `setOrientation/setVariant`.
- **skeleton**: width, height, radius, animate. Methods: `setSize/setAnimate`.
- **breadcrumbs**: items (`label value href`), separator. Methods: `setItems/setSeparator`.
- **video/audio**: src, poster, controls, autoPlay, loop, muted. Methods: `play/pause/setSrc/setMuted` (empty-src play resolves silently by design).
- **markdown**: content/text (compile-rendered, static by design).
- **code**: content/code/text, language, variant, showLineNumbers, highlight, wrap (compile-rendered, static by design).
- **page**: address, title, meta, favicon. `ctx.ui.pages.create({name, address, …})`, `page.app('main')`.

Events (INTERACTION): `clicked changed submitted loaded entered exited selected picked collided`. Server: `ctx.events.publish(channel, payload)`; browser: `ctx.events.subscribe('channel:x', null, handler)`. Undeclared channels are open locally; member-gated ones 401 without a session.

Styling: `make()` words — surfaces (`card elevated glass-card dark-glass`), effects (`glow* raised shadow inner flat floating bubbly inset`), fonts, colors (14 named + `#`/rgb/hsl; a swatch that stays white never became CSS), behaviors (`draggable expandable tappable clickable`), animation words (`fade-in/out slide-up/down scale-in/out pulse bounce spin smooth bouncy`). Raw `bg/color/border` pass straight to CSS. Responsive: `setWithBreakpoint(bp, props)` → scoped media CSS.

Gradients: named via `ctx.ui.transformers.gradients.add(name, {type, angle, stops})` (linear/radial/conic, validated at define time — bad specs fail the build naming the action). Apply anywhere a background works: `make('gradient:sunset')`, bare `make('sunset')` once registered, `bg: 'gradient:sunset'`. Boundary: NOT `color` (no gradient text color in CSS) or `borderColor` (needs border-image). Stock pack = one file (`actions/compile/gradients.ts`, 16 backgrounds) + a hooks entry — install by copying. Registry ships in the style JSON so the browser resolves the same names at runtime.

Animation: `handle.animate.<preset>(opts)` — 16 presets + `animate(name)` + `animate.to(keyframes)`. Always promised, always emits `<id>.animated`. Infinite runs never settle: fire and forget. Reduced motion settles silently (one console note per page).

## 3. Gotchas that cost hours (all proven in docs)

1. **`config.on` must be a string literal.** Static extraction cannot see spreads/computed arrays — the action compiles and never fires. Zero errors.
2. **Read controls from the DOM, not the handle.** Handle getters lag the just-fired change. `h.getElement()` → native `select/input.value`, or `data-checked`.
3. **Handle-semantic props paint through shared helpers.** `checked`/progress-`value`/chart kind-series-labels route in `applyProp` to the same painters the methods use — generic `set()` works everywhere now (proven by `runtime.test.ts`). Methods remain the documented API.
4. **Any event the runtime emits is subscribable.** `copied/copyFailed/complete/notified/dismissed/cancelled/closed/opened/patched/invalid/filtered/appended` flow through aliases → router → emittable → dispatch. If a new component emits a new event, add it to all four or its bindings compile and never fire.
5. **Collections must be declared at compile time.** A `defineServerAction` with `on: 'compile'` calling `ctx.server.collections.create(name, {columns})`, or every query fails with "not declared".
6. **Chart data is `series: number[][]` + `labels: string[]`.** Anything else renders "No data".
7. **Server action args arrive flat.** `ctx.actions.run('notesAdd', {text})` → `ctx.args.text`. Test directly: `POST /api/actions/<name>/run` with a JSON body.
8. **Dev server never serves stale bytes** (`cache-control: no-store`), but it provisions stores at boot — restart it after adding collections.
9. **Object ids are project-global, not per-page.** Duplicate explicit ids now fail fast naming both claimants — prefix shared ids per page (`d-<page>-…`).

10. **Pages have three render modes.** `render: 'static'` prerenders (default), `'spa'` serves a shell, `'server'` renders per request from `server/pages/<name>.json`. A server page needs an owning `on: 'http.get /<address>/'` action or it serves its prerender (build warns).
11. **Server actions load objects, never state.** `await ctx.ui.get(id)` then `.setProps(...)`, then `return ctx.ui.pages.render(name)` (or the flat alias `ctx.ui.renderPage(name)` � same call, and the only form the cloud sandbox guarantees). `ctx.state` in an action is that action's own short-lived state � it connects to no page. The whole server-ui surface is async on both hosts so one shape works everywhere.
12. **Address is the URL.** Pages emit to `dist/<address>/index.html`; `/pages/<name>.html` is a permanent alias. `address` is required, unique, and must not collide with /api, /assets, /apps, /pages.

## 4. Gap map vs Chakra UI (surveyed chakra-ui@main, 76 recipes)

Morgana's 18 handles cover Chakra's core: button/input/select/tabs/dialog/alert/badge/progress/table/switch/checkbox/avatar-ish/link/text/textarea-ish/form/image. Chakra vocabulary worth adopting: sizes (`2xs–2xl`), button variants (`solid subtle surface outline ghost plain`), input variants (`outline subtle flushed`), dialog sizes (`xs–full`) + placement (`center top bottom`), tabs variants (`line subtle enclosed outline`), table variants (`line outline`), badge/tag variants (`solid subtle outline surface`), switch (`solid raised`).

**Missing components** (no Morgana handle): tooltip, popover, menu, accordion, slider, number-input, pin-input, combobox, tags-input, date-picker, color-picker, drawer (dialog variant exists), toast, skeleton (template exists), avatar, breadcrumb, pagination, steps, timeline, stat, tabs-content parts, tree-view, textarea (distinct), radio-group (distinct), rating, QR-code, marquee, carousel, collapsible.

**Structural difference**: Chakra components are compound (`Dialog.Root/Trigger/Content/Header/Footer`); Morgana handles are single objects with props + `data-part` internals. Match prop-for-prop where handles exist; new handles follow the single-object shape, not the compound one.

## 5. Verify like the docs do

`morgana build` (zero `✖`), `morgana dev --port <n>`, then a real browser
(headless lies about reduced motion): every page loads with no `pageerror`,
every knob visibly repaints its target, every log line proves its event.
A control that does nothing is a framework gap — file it with the page, the
prop, and the expected Chakra behavior.
