/**
 * The CLI's own version, read from its package.json at runtime so a release
 * bump is one edit. `../package.json` is right from `src/`, `bin/` and the
 * bundled `dist/` alike — all three sit one level under the package root.
 */
import { createRequire } from 'node:module'

export const VERSION = createRequire(import.meta.url)('../package.json').version
