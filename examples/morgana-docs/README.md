# Morgana Docs

The visual documentation sandbox: every object, every prop, every lane —
rendered live, tunable from the UI, backed by its own backend.

```bash
pnpm install         # from the repo root — links the workspace sdk + cli
pnpm build           # compile src/ to dist/
pnpm dev             # serve on http://localhost:4322
```

The `morgana` binary is the workspace `@morgana/cli`, so the build always
uses this checkout's compiler — no global link to go stale.

- `src/nav.ts` — shared shell (rail, titles); object ids must be
  project-global unique, so shell ids are prefixed per page (`d-<page>-…`)
- `src/actions/compile/` — one file per page (shape phase) + `stores.ts`
  (collection declarations) + `gradients.ts` (the installable stock pack)
- `src/actions/client/` — one knob/log wiring file per page
- `src/actions/server/` — `notes.ts` (docs_notes CRUD, laneEcho), `chat.ts`
- `AGENT.md` — the per-project agent pack: catalog, gotchas, Chakra gap map

Pages: home, objects-basic, objects-input, objects-data, motion, style,
lanes, backend, stream. See `AGENT.md` §5 for how to verify like CI does.
