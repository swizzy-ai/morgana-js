# Docs, PDFs and demo videos

Three things Morgana makes from your app with the browser already on your
machine (Chrome, Edge or Chromium, run headless). Nothing to install; set
`MORGANA_BROWSER` if yours isn't in a usual place.

None of it ships in your app: the SDK only declares `ctx.server.pdf`, and
`morgana docs` and `morgana demo` are CLI commands that drive your running app
from the outside.

## `ctx.server.pdf(html)`: a page, printed

```ts
const html = `<!doctype html><style>@page { size: A4; margin: 16mm }</style><h1>Invoice 42</h1>…`
const bytes = await ctx.server.pdf(html)          // Uint8Array
await ctx.server.files.write('invoices/42.pdf', bytes, 'application/pdf')
```

The PDF is exactly what the page looks like in a browser, with real,
selectable text. The page sets its own paper and margins with CSS
(`@page { size: Letter }`). Options: `wait` (ms the page gets to load fonts
and images, default 2000) and `timeout` (default 60000).

Hosts: `morgana dev` prints with the local browser. The cloud host answers with
a clear message until it prints with Browser Rendering.

## `morgana docs`: your project, documented

```bash
morgana docs                        # dist/docs/index.html, photographed from a running morgana dev
morgana docs --url http://localhost:4332
morgana docs --no-shots             # keep the photographs already taken
```

`morgana dev` serves it live at **`/_morgana/docs`**.

It is made from your build and your source, so it is as good as your doc
comments:

| Page | From |
|---|---|
| **Storyboard** | A photograph of every screen: each value of each address-bound state your conditions test (`view`: pick, brief, work…), plus the screens you list |
| **API** | Every server action: how it's reached (`GET /v1/…`, by name, by a trigger), its doc comment, its `Contract` input and output field by field, a call to copy |
| **Events** | Every page event and the action that answers it, server triggers, events server objects emit, and every channel message (`publish(…, { t: 'step' })`) with its fields |
| **Server objects** | Doc comment, channel, what the browser may reach, methods with their parameters, jobs, state fields |
| **Data**, **UI and config** | Collections and columns; pages, address states, custom objects, variables |
| **Demos** | The videos `morgana demo` made |

Screens that only appear with data go in `morgana.docs.json`, with the state to
open them in (set after the page loads, through the runtime's console hook), or
a `path` for a server-rendered page:

```json
{ "storyboard": [
  { "title": "Working", "state": { "view": "work", "build": "running" } },
  { "title": "Landing page", "page": "tool", "path": "/tools/fix-my-cv" }
] }
```

## `morgana demo`: videos for Reels, TikTok and Shorts

```bash
morgana demo                         # the demos in morgana.demos.json
morgana demo signup                  # dist/demos/signup-9x16.mp4 and a poster
morgana demo signup --list           # its scenes, numbered
morgana demo signup --skip 3         # edit: leave scene 3 out (or --only 1-4)
morgana demo --all --audio beat.mp3  # music or a voice-over under every demo
morgana demo --from-storyboard       # one demo of every storyboard screen
```

```json
{ "format": "9:16", "demos": { "signup": { "audio": "assets/beat.mp3", "scenes": [
  { "path": "/", "seconds": 2, "caption": "Sign up in ten seconds" },
  { "path": "/", "do": [{ "click": "start" }, { "type": ["email", "ada@example.com"] }] },
  { "storyboard": "Working", "seconds": 3, "caption": "It does the work" },
  { "path": "/pricing", "do": [{ "scroll": 600 }], "skip": true }
] } } }
```

A scene opens a page or a storyboard screen, then can `click` an object by id
(a list row with `key`), `type` into one, `scroll` and `wait`, with a caption
on screen. Formats: `9:16` (1080×1920, the default), `4:5`, `1:1`, `16:9`.
`--stills` writes each scene's last frame beside the video, to check it at a
glance.

It records in real time, then encodes in real time (H.264 and AAC in an MP4,
with the browser's own encoder), so a 20-second demo takes about 40 seconds.
