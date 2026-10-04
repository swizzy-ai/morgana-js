/**
 * Finding a real browser.
 *
 * Shared by `bench.mjs` (which measures) and `verify.mjs` (which asserts), so
 * the thing that gets benchmarked and the thing that gets verified are the same
 * page in the same browser. Verification is only worth something if it runs the
 * browser the deploy will actually be judged in.
 *
 * `playwright-core` ships no browser binaries — it is a client, not a browser —
 * so the executable is discovered on the host. If none is found the caller
 * decides what that means: the bench skips, verification fails.
 *
 * `CHROME_PATH` wins over everything. That is the escape hatch for CI, where the
 * browser comes from an action and lives somewhere this list would never guess.
 */
import fs from 'node:fs'
import path from 'node:path'

export const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

/** Executables to look for on PATH, as bare names. */
const PATH_NAMES = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'chrome',
  'msedge',
]

/** The first installed browser, or null. */
export function findChrome() {
  const explicit = process.env.CHROME_PATH
  if (explicit && fs.existsSync(explicit)) return explicit

  const known = CHROME_CANDIDATES.find((p) => fs.existsSync(p))
  if (known) return known

  // PATH, without shelling out: walking PATH ourselves is a few lines and
  // avoids a subprocess on a path that runs in CI as well as on a laptop.
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  for (const name of PATH_NAMES) {
    for (const dir of dirs) {
      for (const candidate of [name, `${name}.exe`]) {
        const full = path.join(dir, candidate)
        try {
          if (fs.existsSync(full) && fs.statSync(full).isFile()) return full
        } catch {
          // Unreadable PATH entry (permissions, a broken symlink) — try the next.
        }
      }
    }
  }
  return null
}
