// Builds dist/ from this SDK project using the compiled compiler.
//
//   node build.mjs                 # minify per morgana.config.ts
//   node build.mjs --no-minify     # readable output for debugging
//   node build.mjs --minify        # force it on
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { compileProject } from '../../packages/sdk-compile/dist/index.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(dir, 'dist')

function flag(name) {
  return process.argv.includes(`--${name}`)
}
// Absent → undefined → the compiler falls back to morgana.config.ts.
const minify = flag('no-minify') ? false : flag('minify') ? true : undefined

const result = await compileProject({ dir, outDir: out, minify })

const kb = (n) => (n / 1024).toFixed(1) + 'K'
const sizeOf = (rel) => {
  try {
    return fs.statSync(path.join(out, rel)).size
  } catch {
    return 0
  }
}

console.log('pages:         ', result.pages.join(', ') || '(none)')
console.log('entry:         ', result.entry || '(none)')
console.log('compile actions:', result.compileActions.join(', ') || '(none)')
console.log('server actions: ', result.serverActions.join(', ') || '(none)')
console.log('minify:        ', result.minify ? 'on' : 'off')
for (const w of result.warnings) console.log('warning:       ', w)

// The payload a visitor actually downloads, per artefact.
console.log('sizes:')
for (const rel of ['assets/client.js', 'assets/style.css']) {
  console.log(`  ${rel.padEnd(18)} ${kb(sizeOf(rel))}`)
}
const actions = result.files.filter((f) => f.startsWith('server/actions/'))
const actionsTotal = actions.reduce((n, f) => n + sizeOf(f), 0)
console.log(`  ${`server actions (${actions.length})`.padEnd(18)} ${kb(actionsTotal)}`)
console.log('files:')
for (const f of result.files) console.log('  dist/' + f)
console.log('hash:', result.hash)
