/**
 * The CLI's own version, read from its package.json at runtime so a release
 * bump is one edit. `../package.json` is right from `src/`, `bin/` and the
 * bundled `dist/` alike — all three sit one level under the package root.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const own = require('../package.json')

export const VERSION = own.version

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
    return `^${require(`${name}/package.json`).version}`
  } catch {
    return `^${VERSION}`
  }
}
