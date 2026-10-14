/**
 * Desktop backend loader — shared by `morgana desktop` and
 * `morgana package`.
 *
 * Resolved from the PROJECT, never from the CLI's own dependencies: the
 * backend is the project's dependency, so a project can pin, fork or replace
 * it and both commands keep working without knowing any backend by name.
 * One copy, here — two copies would mean every backend-resolution fix has to
 * be remembered twice.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

export const DEFAULT_BACKEND = '@studiomorgana/desktop-electron'

export async function loadBackend(dir, name) {
  let resolved
  try {
    resolved = createRequire(path.join(dir, 'package.json')).resolve(name)
  } catch {
    throw new Error(
      'desktop backend "' + name + '" is not installed in ' + dir +
      ' — install it first (e.g. `pnpm add -D ` + name + `)`',
    )
  }
  return import(pathToFileURL(resolved).href)
}
