/**
 * The CLI's own version, read from its package.json at runtime so a release
 * bump is one edit. `../package.json` is right from `src/`, `bin/` and the
 * bundled `dist/` alike — all three sit one level under the package root.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const own = require('../package.json')

export const VERSION = own.version

/**
 * The installed version of a sibling package. `require(name/package.json)` is
 * not enough: most packages' `exports` map hides package.json, so the lookup
 * starts at the resolved entry and walks up to the package named `name`.
 */
function installedVersion(name) {
  let dir = path.dirname(require.resolve(name))
  for (;;) {
    const file = path.join(dir, 'package.json')
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (pkg.name === name) return pkg.version
    }
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

/**
 * The range a new project should depend on for a sibling package. Packages
 * version independently, so it is the CLI's own dependency range — the one the
 * CLI was published and tested with (pnpm writes the real range into the
 * tarball). From the source tree that range is still `workspace:^`, so the
 * sibling's installed version stands in.
 */
export function rangeFor(name) {
  const declared = own.dependencies?.[name]
  if (declared && !declared.startsWith('workspace:')) return declared
  try {
    const v = installedVersion(name)
    if (v) return `^${v}`
  } catch {
    // Not installed next to this CLI: fall through to the CLI's own version.
  }
  return `^${VERSION}`
}
