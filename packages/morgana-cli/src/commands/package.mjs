/**
 * `morgana package` — the building protocol. Produces shippable artifacts,
 * boots nothing, opens no window.
 *
 *   package web      compile to dist/ (the same path `morgana build` takes)
 *   package desktop  compile, then scaffold and build the installer through
 *                    the configured backend's pack()
 *
 * Running is `morgana desktop` (the app) and `morgana dev` (web) — this
 * command never runs anything it built.
 */
import path from 'node:path'
import { scanProject } from '@morgana/sdk-compile'
import { build } from './build.mjs'
import { loadBackend, DEFAULT_BACKEND } from './desktop-backend.mjs'
import { say } from '../ui.mjs'

export async function packageTarget({ target = 'web', dir = process.cwd(), minify, outDir } = {}) {
  const projectDir = path.resolve(dir)
  if (target === 'web') {
    await build({ dir: projectDir, minify })
    say('web package: dist/')
    return
  }
  if (target === 'desktop') {
    await build({ dir: projectDir, minify })
    const scan = scanProject({ dir: projectDir })
    const backendName = scan.config.desktop?.backend ?? DEFAULT_BACKEND
    const backend = await loadBackend(projectDir, backendName)
    if (typeof backend.pack !== 'function') {
      throw new Error('desktop backend "' + backendName + '" exports no pack() — it cannot build an installer')
    }
    const out = await backend.pack({ dir: projectDir, outDir, mode: 'package' })
    say('desktop package: ' + (out?.outDir ?? outDir ?? '(unknown)'))
    return out
  }
  throw new Error('unknown package target "' + target + '" — want "web" or "desktop"')
}
