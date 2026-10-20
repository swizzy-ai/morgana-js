# 0.7: release notes and test plan

Written 2026-10-20. Packages: `@studiomorgana/sdk`, `sdk-compile`, `cli` 0.7.0;
`helpers` 0.3.0; `points` 0.1.0 and `assets` 0.1.0 (first releases). npm has up
to 0.6.5 today.

## What's in it

| Area | Change | Commit |
|---|---|---|
| Plugins | Plugins, `@studiomorgana/assets`, step-by-step artifact deploy | `d63e3e5` |
| Points | `@studiomorgana/points`: one standard way to say an amount; its own package, no SDK dependency | `89373f2`, `a3580ab` |
| Server | `ctx.server.sandbox`: files, packages and programs from a server action (dev host) | `3995632` |
| Server | `ctx.server.pdf(html)`: print a page to a PDF (dev host) | `e4fe9e2` |
| Compile | The TypeScript program is built only for contracts, and reused: ~2.5 s → ~0.4 s per edit | `b6608ac` |
| Compile | Each file gets the SDK names it imports (shim fix) | `24a3596` |
| Runtime | `config.debounce` / `config.throttle` take effect | `1abfefd` |
| Runtime | Address states don't leak onto other pages; dropped files carry a readable `url` | `32d8abd` |
| Runtime | `pages.navigate` to a static page loads it | `23e95bd` |
| Helpers | Bricks, `steps()`, `vocabulary.json`, page `background()`, rail, segmented values, theme icons | `87b7b6e`, `bbcbe16`, `040eb24`, `43f0b4a` |
| CLI | Models in `morgana dev` come from the Morgana cloud (`morgana login`) | `9b1feec` |
| CLI | `morgana docs` and `morgana demo`; `/_morgana/docs` in dev; binary responses; routes picked up while dev runs | `d669308` |

## Automated tests (all passing at `d669308`)

| Package | Tests | Typecheck |
|---|---|---|
| sdk-compile | 531 | clean |
| cli | 112 | n/a (JS) |
| sdk | 53 | clean |
| helpers | 40 | clean |
| points | 18 | |
| wizard | 14 | |
| assets | 10 | |

`pnpm release` runs the gate again (typecheck and tests for every package)
before it publishes anything.

## Manual test plan

Run against a real project (Swizzy, `budding-gilgamesh/swizzy`) on the
workspace build before publishing, and again on the published packages after.

| # | Check | How | Expect |
|---|---|---|---|
| 1 | Fresh project | `npx @studiomorgana/cli init x && cd x && npx morgana dev` | Builds, serves on 4317, no warnings |
| 2 | Build and typecheck | `npm run typecheck && npx morgana build` in Swizzy | Clean |
| 3 | Edit speed | Save a page file during `morgana dev` | Rebuild under ~0.5 s |
| 4 | Address states | Open `/tools/fix-my-cv` | Address stays `/tools/fix-my-cv` (no `?view=`) |
| 5 | File drop | Drop a PDF CV on Fix my CV's box | The chip shows the file; text read in the browser |
| 6 | PDF | `node .try/fix-cv.mjs` (scripts/try-fix-cv.ts) | `.try/fix-cv/*.pdf` opens, A4, selectable text |
| 7 | Dev models | `morgana login`, then run Fix my CV end to end | Steps stream, result page opens, PDF downloads |
| 8 | Not signed in | Log out, start a run | One clear line: run `morgana login` |
| 9 | Docs | `morgana docs --url …` | 15 screens photographed; API, Events, Objects, Data, Demos pages |
| 10 | Docs live | `/_morgana/docs/` in dev | Same site, served |
| 11 | Demo | `morgana demo fix-cv --stills` | 1080×1920 MP4 plays in a phone-size player; stills match the scenes |
| 12 | Demo audio | `--audio some.mp3` | Audio fades in and out; loops if short |
| 13 | Demo editing | `--list`, `--skip 3`, `--only 1-2` | Scenes numbered; the cut video leaves them out |
| 14 | Production pages | `morgana build`, search `dist/` for `__morgana_frame` | Not found: the tools add nothing to pages |
| 15 | Deploy | `morgana deploy` of a test project | Deploys; `ctx.server.pdf` and `sandbox` answer with their "dev only for now" message |

## Known gaps (documented, not blocking)

- **Cloud host:** `ctx.server.pdf` (needs Browser Rendering), `ctx.server.sandbox`
  (needs container sandboxes) and binary response bodies are dev-host only.
- `morgana demo` and `morgana docs` photographs need a local Chrome, Edge or
  Chromium.
- Docs, demo and the DevTools client live in the CLI; they move to their own
  package (`@studiomorgana/studio-tools`) next, so the CLI stays small.

## Releasing

```bash
pnpm release:bump --dry-run   # what would bump
pnpm release --dry-run        # gate + pnpm publish --dry-run
pnpm release                  # gate, publish, tag <name>@<version>, push
```
