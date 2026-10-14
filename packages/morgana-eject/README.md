# @studiomorgana/eject

`morgana eject` — turn a Morgana project into a plain **React + Express**
codebase with no framework left in it. The pages become React components, the
server actions become Express routes, and nothing imports `@studiomorgana/*`.

The CLI installs this package on demand the first time you eject; you do not
need to add it yourself.

```bash
npx morgana eject                      # into ./ejected
npx morgana eject --outDir ../my-app --pages board,admin --port 3000
```

| Flag | |
|---|---|
| `--outDir <path>` | where to write the new codebase |
| `--pages a,b` | only these pages |
| `--port <n>` | the Express server's port |
| `--apiPrefix <p>` | where the server routes mount |
| `--yes` | do not ask before writing |

The ejected code is checked for any remaining framework reference before it is
written, so "no framework trace" is enforced, not hoped for.

New to Morgana? Start with the [guide](https://github.com/swizzy-ai/morgana-js/tree/main/docs).

## Licence

Apache-2.0.
