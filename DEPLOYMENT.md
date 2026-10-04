# Deployment procedure — Morgana, Swizzy AI

Two separate pipelines that are easy to confuse. Read this once.

| | **Ship the framework** | **Ship the backend** |
|---|---|---|
| What moves | 4 npm packages | 1 Cloudflare Worker |
| Trigger | a version bump | a code change to `morgana-server` |
| Who runs it | you, from a terminal | you, from a terminal |
| Consumers | anyone installing Morgana | every project on the cloud |
| Frequency | rare | often |

**The backend is not published and never will be.** It carries no version. Nobody
installs it. A deploy of the backend does not require a deploy of the packages,
and a deploy of the packages does not touch the backend.

---

## Pipeline A — the backend worker

`packages/morgana-server`. Private, never on npm.

```bash
pnpm --filter @morgana/sdk run build          # its types come from the SDK
pnpm --filter @morgana/agents run build
pnpm --filter morgana-server run deploy       # wrangler deploy --minify
```

Gates, in the order they fail cheapest:

1. `pnpm -r run typecheck`
2. `pnpm -r run test` — 77 worker tests
3. `pnpm --filter morgana-server exec wrangler deploy --dry-run`
4. `pnpm --filter morgana-server run deploy`

### After every backend deploy

Verify the surfaces that a green deploy does not prove. Deploy returning 200 has
never meant the thing works.

```bash
B=https://morgana-server.hello-ad4.workers.dev

# anonymous deploy must be refused
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' "$B/api/deploy"   # 401

# a scoped token deploys to its own project, and only its own
eval "$(node tools/mint-token.mjs $B --shell)"
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "authorization: Bearer $MORGANA_TOKEN" \
  -H 'content-type: application/json' -d "{\"projectId\":\"$MORGANA_PROJECT\",\"apps\":[]}" "$B/api/deploy"      # 200
```

### The credential rules

- **Never set a `DEPLOY_TOKEN`.** It was removed from `requireDeployAuth`. A value
  of that name in the environment is inert, and a test asserts it stays inert.
- **Never commit a token.** Not to the repo, not to a zip, not to a CI variable
  that is echoed.
- Personal tokens live in a password manager. CI mints one per run with
  `tools/mint-token.mjs`.

---

## Pipeline B — the npm packages

Four packages, published in dependency order. The order is not a convention: a
tarball whose dependency is not yet on the registry installs to a version that
does not exist.

```
1. @morgana/sdk          0.3.0     no runtime dependencies
2. @morgana/sdk-compile  0.1.0     → sdk (dependency)
3. @morgana/agents       0.1.0     → sdk (peer), nanoagent (dependency)
4. @morgana/cli          0.1.0     → sdk, sdk-compile, agents (dependencies)
```

`morgana-server` is in none of this.

`@morgana/agents` declares the SDK as a **peer** dependency, not a hard one, so
installing it does not pull the SDK in. A peer still has to resolve at install
time, which is why it cannot be published before the SDK — it just fails later and
less obviously.

### Use `pnpm publish`, never `npm publish`

Every dependency is declared `workspace:^`. pnpm rewrites that to a real version
range when it packs; npm does not, so an `npm publish` tarball ships
`"@morgana/sdk": "workspace:^"` and is uninstallable.

```bash
# gate everything first
pnpm -r run typecheck
pnpm -r run test
pnpm --filter @morgana/sdk run build
pnpm --filter @morgana/sdk-compile run build
pnpm --filter @morgana/agents run build
pnpm --filter @morgana/cli run build

# then publish, in order, one at a time
cd packages/sdk         && pnpm publish --access public
cd packages/sdk-compile && pnpm publish --access public
cd packages/morgana-agents && pnpm publish --access public
cd packages/morgana-cli && pnpm publish --access public
```

### After publishing

Install the published tarball somewhere clean. The unit tests read `src/`, so
they cannot catch a package that does not resolve its own dependencies.

```bash
mkdir /tmp/verify && cd /tmp/verify && npm init -y >/dev/null
npm i @morgana/cli
npx morgana init check && cd check && npm i && npx morgana build
```

If that prints a page and a hash, the publish is good.

### Versions

`@morgana/cli` scaffolding pins `@morgana/sdk: ^0.3.0` and
`@morgana/sdk-compile: ^0.1.0`. **Bump `init.mjs` in the same commit as any SDK
version bump**, or `morgana init` generates a project that asks for a version
which does not exist.

---

## What each package actually ships

Worth checking before a publish, because `files` is doing real work here:

| Package | Ships | Why |
|---|---|---|
| `sdk` | `dist`, `src` | the compiler reads the SDK's TypeScript source to resolve action imports |
| `sdk-compile` | `dist`, `src` | it locates its own `client/runtime.ts` on disk at build time |
| `agents` | `dist` | plain JS, nothing to resolve at runtime |
| `cli` | `dist` | bundled to one file; `src/` is not needed by users |

That `src/` in the first two is not an accident of a loose `files` glob. It is the
mechanism, and a tarball without it fails with "cannot locate the @morgana/sdk
source entry" while the package is plainly installed.

---

## Version bump checklist

```
1. bump the version in the package's package.json
2. pnpm install            (updates pnpm-lock.yaml)
3. build the dependents    (anything with it as workspace:^)
4. run the full gate: typecheck, test, build
5. pnpm publish, in order
6. update the pinned ranges in morgana-cli/src/commands/init.mjs if sdk or
   sdk-compile moved
7. commit and tag
```

---

## Rollback

**npm:** `npm dist-tag add @morgana/sdk@0.3.0 previous`, then move `latest` back.

**The worker:** Cloudflare keeps prior versions.

```bash
pnpm --filter morgana-server exec wrangler versions view
pnpm --filter morgana-server exec wrangler rollback <version-id>
```

**Deployed projects:** nothing to roll back. `morgana deploy` is whole-project —
pages, stores, triggers and assets go in one payload, so a bad deploy is replaced
by redeploying the previous commit. Keep the source; that is the rollback.