/**
 * `morgana eject` — compile the project, then emit a plain React + Express
 * codebase with no framework trace.
 *
 * This module is deliberately thin (<100 lines, zero heavy imports): it
 * parses flags, ensures `@morgana/eject` is installed for the PROJECT (never
 * bundled — resolved from the project dir like desktop backends), loads it,
 * and prints the report. All eject knowledge lives in that package.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { say, warn } from '../ui.mjs'

function resolveEject(dir) {
  try {
    const require = createRequire(path.join(path.resolve(dir), 'package.json'))
    return require.resolve('@morgana/eject')
  } catch {
    return null
  }
}

export async function eject({ dir = process.cwd(), outDir, pages, port, apiPrefix, yes = false } = {}) {
  const projectDir = path.resolve(dir)
  const out = outDir ? path.resolve(outDir) : path.join(projectDir, 'ejected-app')
  let entry = resolveEject(projectDir)
  if (!entry) {
    if (!yes) {
      say('eject needs @morgana/eject — install it in this project:')
      say('  npm install -D @morgana/eject   (or: pnpm add -D @morgana/eject)')
      say('then run `morgana eject` again, or pass --yes to install automatically.')
      return
    }
    say('installing @morgana/eject…')
    const { execSync } = await import('node:child_process')
    const pm = await import('node:fs').then((fs) =>
      fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm',
    )
    execSync(`${pm} ${pm === 'pnpm' ? 'add' : 'install'} -D @morgana/eject`, { stdio: 'inherit', cwd: projectDir })
    entry = resolveEject(projectDir)
    if (!entry) {
      warn('installed but unresolvable — check your package manager state')
      return
    }
  }
  const { ejectProject, printReport } = await import(entry)
  const report = await ejectProject({
    dir: projectDir,
    outDir: out,
    selection: {
      pages: pages && pages.length ? pages : undefined,
      port,
      apiPrefix,
    },
  })
  say(printReport(report))
}
