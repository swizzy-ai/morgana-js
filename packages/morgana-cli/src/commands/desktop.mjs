/**
 * `morgana desktop` — open the app. It runs it.
 *
 * Compiles, then hands the project to the configured backend's run(): the
 * host boots with a backend-built ctx.desktop, desktop cron schedules, and
 * the window opens on the loopback host. Building without running is
 * `morgana package` — this command always runs.
 */
import path from 'node:path'
import { scanProject } from '@morgana/sdk-compile'
import { build } from './build.mjs'
import { loadBackend, DEFAULT_BACKEND } from './desktop-backend.mjs'
import { say } from '../ui.mjs'

export async function desktop({ dir = process.cwd(), port = 4317, minify } = {}) {
  const projectDir = path.resolve(dir)
  const scan = scanProject({ dir: projectDir })
  const backendName = scan.config.desktop?.backend ?? DEFAULT_BACKEND
  const backend = await loadBackend(projectDir, backendName)
  await build({ dir: projectDir, minify })
  if (typeof backend.run !== 'function') {
    throw new Error('desktop backend "' + backendName + '" exports no run() — it cannot open the app')
  }
  say('desktop backend: ' + backendName)
  await backend.run({ dir: projectDir, port })
}
