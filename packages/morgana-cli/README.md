# @morgana/cli

The `morgana` command — build and deploy a Morgana project.

```bash
npm i -g @morgana/cli
morgana init my-app
cd my-app && npm install
npx morgana dev
```

## Commands

| | |
|---|---|
| `morgana init [name]` | scaffold a project — a config, one compile action, the directory layout |
| `morgana build` | compile to `dist/` |
| `morgana dev` | compile, serve on `:4317`, recompile on change |
| `morgana deploy` | build, publish, and check that the page and every asset it references serve |
| `morgana login` | sign in through the worker in your browser; stores a project-scoped token |
| `morgana logout` | forget the stored token |
| `morgana status` | what the worker holds for this project |

## Deploying takes no arguments

`morgana deploy` publishes to the Morgana cloud by default — the URL is compiled
in, so a fresh project deploys without being told where to.

Credentials resolve in order, first match wins:

1. `--token`
2. `MORGANA_TOKEN` — how CI runs unattended
3. the stored token from `morgana login`
4. **`morgana login`, run automatically** in your browser when there is nothing else

Sign in once and every later deploy is silent. A credential is scoped to one
project and expires; there is no shared deploy key, because a deploy uploads code
that then executes on the worker.

## Pointing somewhere else

Self-hosting is a supported destination, not a fork. Name your worker:

```bash
morgana deploy --url https://your-worker.workers.dev
# or
export MORGANA_URL=https://your-worker.workers.dev
```

## Headless deploys

```bash
MORGANA_TOKEN=$(node tools/mint-token.mjs https://your-worker.workers.dev)
```

`tools/mint-token.mjs` signs in over HTTP with a generated identity, so a machine
gets a real token rather than a shared secret. It ships in the framework
repository rather than here, because it is only useful to someone deploying.

## What deploy does and does not check

It verifies that the page loads and that every asset it references returns 200.
It does **not** drive a browser — that would mean requiring Chrome on every
machine that deploys. Whether the page actually *works* (stylesheet applied,
runtime booted, no console errors) is checked in CI, where a browser is installed
deliberately.

## Licence

Apache-2.0