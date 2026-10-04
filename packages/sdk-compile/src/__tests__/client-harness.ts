/**
 * Client test harness — builds a real `client.js` from real action files.
 *
 * The runtime parts are the thing under test, but they now arrive alongside
 * author code bundled by esbuild, so the tests exercise the same path the
 * compiler does rather than pasting handler text into the bundle by hand.
 */
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { renderClientJs } from '../client'
import type { SdkActionMeta } from '../extract'

/**
 * Infer the authoring style from the source so the bundler picks the right
 * export. Test sources are written as bare `export const <name> = fn`, which
 * the bundler resolves by name — the same path a factory action takes, where
 * the named export is an `{ config, handler }` object.
 */
function factoryOf(source: string): SdkActionMeta['factory'] {
  if (source.includes('defineClientAction')) return 'client'
  if (source.includes('defineServerAction')) return 'server'
  if (/\bfunction\s+handle\b/.test(source)) return 'plain-handle'
  if (/\bfunction\s+run\b/.test(source)) return 'plain-run'
  return 'client'
}

export type ActionSources = Record<string, string>

/**
 * A manifest with no objects — enough for the runtime to boot on a page whose
 * objects the stub DOM does not render. Tests that assert on live handles
 * should build their own entries.
 */
export function emptyManifest(page = 'home'): string {
  return JSON.stringify({
    page,
    address: `/${page}`,
    objects: {},
    roots: { [page]: [] },
    pages: { [page]: { address: `/${page}`, app: null } },
    apps: [],
    icons: {},
    libraries: [],
    breakpoints: {},
    style: {
      measures: {},
      surfaceOverrides: {},
      effectOverrides: {},
      radiusOverrides: {},
      fontOverrides: {},
    },
  })
}

export async function makeClientJs(
  actions: ActionSources,
  bindings: Array<{ event: string; action: string }> = [],
): Promise<string> {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'morgana-client-'))
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    const specs = Object.entries(actions).map(([name, source]) => {
      const file = path.join(root, 'src', `${name}.ts`)
      fs.writeFileSync(file, source, 'utf8')
      return { projectDir: root, file, name, factory: factoryOf(source) }
    })
    return await renderClientJs(root, specs, bindings)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
