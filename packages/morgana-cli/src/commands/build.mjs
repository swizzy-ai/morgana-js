/**
 * `morgana build` — compile a project to `dist/`.
 *
 * The example's `build.mjs` now re-exports this, so CI proves there is one
 * compile path rather than two that happen to agree today.
 *
 * Two changes were unavoidable and are the only ones:
 *
 *   - `dir` comes from the caller's cwd instead of `import.meta.url`. Inside the
 *     monorepo the script used its own folder; a CLI has to build whatever
 *     directory it was pointed at, and `morgana build --dir` or a bare
 *     `morgana build` in a project root is the whole point of having a CLI.
 *   - the artefact table is printed through the shared `row` helper, so the
 *     output is aligned consistently across commands. The values and their
 *     order are unchanged.
 */

import fs from 'node:fs'
import path from 'node:path'
import { compileProject } from '@morgana/sdk-compile'
import { say, row, dim, yellow } from '../ui.mjs'

/** One line per artefact a visitor actually downloads. */
const PAYLOAD_ARTEFACTS = ['assets/client.js', 'assets/style.css']

const kb = (n) => (n / 1024).toFixed(1) + 'K'

export async function build({ dir, minify } = {}) {
  const projectDir = dir ?? process.cwd()
  const out = path.join(projectDir, 'dist')

  const result = await compileProject({ dir: projectDir, outDir: out, minify })

  const sizeOf = (rel) => {
    try {
      return fs.statSync(path.join(out, rel)).size
    } catch {
      return 0
    }
  }

  say(row('pages', result.pages.join(', ') || '(none)'))
  say(row('entry', result.entry || '(none)'))
  say(row('compile actions', result.compileActions.join(', ') || '(none)'))
  say(row('server actions', result.serverActions.join(', ') || '(none)'))
  say(row('minify', result.minify ? 'on' : 'off'))
  // Yellow, and after the facts rather than among them. These do not stop the
  // build, and several of them are the reason a project works at all, so they
  // read as notes rather than as the outcome — but a warning you have to notice
  // while scanning is a warning most people will not notice.
  for (const w of result.warnings) say(row(yellow('warning'), yellow(w)))
  if (result.warnings.length) say()

  // The payload a visitor actually downloads, per artefact. Reported before the
  // file list because it is the number anyone is looking for; the list is
  // reference.
  say()
  say(dim('sizes:'))
  for (const rel of PAYLOAD_ARTEFACTS) {
    say(row(rel, kb(sizeOf(rel)), 20))
  }
  const actions = result.files.filter((f) => f.startsWith('server/actions/'))
  const actionsTotal = actions.reduce((n, f) => n + sizeOf(f), 0)
  say(row(`server actions (${actions.length})`, kb(actionsTotal), 20))

  say()
  say(dim('files:'))
  for (const f of result.files) say(`  dist/${f}`)
  say(row('hash', result.hash))

  return result
}
