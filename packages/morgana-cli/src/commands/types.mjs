/**
 * `morgana types` — generate the project's types into `.morgana/`.
 *
 *   .morgana/types/registry.d.ts   `ctx.actions.run('name', …)` typed from each action's `Contract`
 *   .morgana/objects.d.ts          `ctx.objects.<name>` typed from each server object
 *   .morgana/ui.d.ts               `ctx.ui.<name>` typed from each custom object
 *
 * `build` and `dev` already refresh these on every compile. This command is for
 * when nothing else has run yet — a fresh clone, CI before `tsc`, an agent that
 * just added an action and wants the editor to see it.
 *
 * `--watch` reruns on any change under `src/`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { generateTypes } from '@studiomorgana/sdk-compile'

import { say, row, dim, yellow, green } from '../ui.mjs'

async function once(dir) {
  const r = await generateTypes({ dir })
  say(row('actions', r.actions.join(', ') || dim('(none with a Contract)')))
  if (r.untypedActions.length) say(row('', dim(`+${r.untypedActions.length} without a \`Contract\` export (called as unknown)`)))
  say(row('server objects', r.objects.join(', ') || dim('(none)')))
  say(row('custom objects', r.customObjects.join(', ') || dim('(none)')))
  for (const w of r.warnings) say(row(yellow('warning'), yellow(w)))
  say(row('types', r.written.length ? green(r.written.join(', ')) : dim('up to date')))
  return r
}

export async function types({ dir = process.cwd(), watch = false } = {}) {
  await once(dir)
  if (!watch) return

  const src = path.join(dir, 'src')
  let timer = null
  fs.watch(fs.existsSync(src) ? src : dir, { recursive: true }, (_e, filename) => {
    if (!filename || /(^|[\\/])(node_modules|dist|\.morgana)([\\/]|$)/.test(String(filename))) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      say(dim(`\nchanged: ${filename}`))
      // A half-saved file must not end the watch — the next save retries.
      once(dir).catch((err) => say(row(yellow('error'), yellow(err?.message ?? String(err)))))
    }, 150)
  })
  say(dim('watching for changes — Ctrl-C to stop'))
}
