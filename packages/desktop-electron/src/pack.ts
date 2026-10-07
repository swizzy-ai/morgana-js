/**
 * Installer project — scaffold + package.
 *
 * scaffold() writes a standalone Electron project into outDir: a package.json
 * (app identity + electron-builder config), a main.mjs that boots run(), and
 * the compiled dist/ copied in. pack() with mode 'package' then runs
 * electron-builder on it. Modes are separate because scaffolding is instant
 * and reviewable while packaging downloads toolchains — conflating them would
 * make a dry look at the project cost a build.
 *
 * Windows (nsis) only for v1. A second target is one config line when the
 * second OS is tested, not before.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

export interface PackOptions {
  dir?: string
  outDir?: string
  mode?: 'scaffold' | 'package'
}

export interface PackResult {
  outDir: string
  bundleId: string
  name: string
  version: string
}

function readJson(file: string, fallback: never): never
function readJson<T>(file: string, fallback: T): T
function readJson(file: string, fallback: unknown): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
  } catch {
    return fallback
  }
}

/** This package's own version — works from src/ and from dist/. */
function ownVersion(): string {
  try {
    const pkgFile = new URL('../package.json', import.meta.url)
    return (JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { version?: string }).version ?? '0.1.0'
  } catch {
    return '0.1.0'
  }
}

/** An installed dependency's version, resolved from here (exports-map safe). */
function installedVersion(name: string, entry: string): string {
  try {
    const resolved = createRequire(import.meta.url).resolve(name + '/' + entry)
    const pkgFile = path.join(path.dirname(resolved), 'package.json')
    return (JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { version?: string }).version ?? '0.1.0'
  } catch {
    return '0.1.0'
  }
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, item.name)
    const to = path.join(dest, item.name)
    if (item.isDirectory()) copyDir(from, to)
    else if (item.isFile()) fs.copyFileSync(from, to)
  }
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'morgana-desktop'
}

export async function scaffold({ dir = process.cwd(), outDir }: PackOptions = {}): Promise<PackResult> {
  const projectDir = path.resolve(dir)
  const out = path.resolve(outDir ?? path.join(projectDir, 'desktop-out'))
  const dist = path.join(projectDir, 'dist')
  const appFile = path.join(dist, 'desktop', 'app.json')
  if (!fs.existsSync(appFile)) {
    throw new Error('dist/desktop/app.json not found — run `morgana build` on a project that declares the desktop lane first')
  }
  const appJson = readJson<{ backend?: string; apps?: Array<{ name: string; displayName?: string; bundleId: string; icon?: string }> }>(appFile, {})
  const projectPkg = readJson<{ name?: string; version?: string }>(path.join(projectDir, 'package.json'), {})
  const primary = appJson.apps?.[0]
  const name = slug(primary?.name ?? projectPkg.name ?? 'morgana-desktop')
  const version = projectPkg.version ?? '0.1.0'
  const bundleId = primary?.bundleId ?? 'com.morgana.desktop'
  const displayName = primary?.displayName ?? primary?.name ?? 'Morgana Desktop'

  const generated = {
    name,
    version,
    main: 'main.mjs',
    type: 'module',
    dependencies: {
      '@morgana/desktop-electron': '^' + ownVersion(),
      '@morgana/cli': '^' + installedVersion('@morgana/cli', 'host'),
      electron: '^33.0.0',
    },
    build: {
      appId: bundleId,
      productName: displayName,
      win: { target: ['nsis'] },
      files: ['main.mjs', 'package.json', 'dist/**/*'],
      directories: { output: 'release' },
    },
  }
  const main = [
    "import path from 'node:path'",
    "import { fileURLToPath } from 'node:url'",
    "import { run } from '@morgana/desktop-electron'",
    '',
    'const dir = path.dirname(fileURLToPath(import.meta.url))',
    '',
    '// Packaged app: an ephemeral loopback port — the window reads the real',
    '// one back from the booted host, so no port is ever reserved or clashed.',
    'await run({ dir, port: 0 })',
    '',
  ].join('\n')

  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(generated, null, 2) + '\n', 'utf8')
  fs.writeFileSync(path.join(out, 'main.mjs'), main, 'utf8')
  if (!fs.existsSync(dist)) throw new Error('dist/ not found in ' + projectDir + ' — run `morgana build` first')
  copyDir(dist, path.join(out, 'dist'))
  return { outDir: out, bundleId, name, version }
}

export async function pack({ dir = process.cwd(), outDir, mode = 'scaffold' }: PackOptions = {}): Promise<PackResult> {
  const info = await scaffold({ dir, outDir })
  if (mode === 'scaffold') return info
  // Required lazily and dynamically: electron-builder is a heavy toolchain
  // and scaffolding must never pay for it. createRequire (not import) because
  // the package ships no static types here by design.
  const req = createRequire(import.meta.url)
  let builder: { build: (opts: unknown) => Promise<unknown> }
  try {
    builder = req('electron-builder') as { build: (opts: unknown) => Promise<unknown> }
  } catch {
    throw new Error('electron-builder is not installed — pnpm add -D electron-builder in @morgana/desktop-electron to build installers')
  }
  await builder.build({ projectDir: info.outDir, win: ['nsis'] })
  return info
}
