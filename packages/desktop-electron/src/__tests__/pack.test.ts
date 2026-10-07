import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scaffold } from '../pack'

function project(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-pack-'))
  fs.mkdirSync(path.join(dir, 'dist', 'desktop'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'dist', 'desktop', 'app.json'),
    JSON.stringify({ backend: '@morgana/desktop-electron', os: [], apps: [{ name: 'shop', bundleId: 'com.morgana.shop' }] }),
    'utf8',
  )
  fs.writeFileSync(path.join(dir, 'dist', 'manifest.json'), JSON.stringify({ entry: 'home' }), 'utf8')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo-shop', version: '0.2.0' }), 'utf8')
  return dir
}

describe('scaffold', () => {
  it('writes the installer project with identity, builder config and dist', async () => {
    const dir = project()
    const out = path.join(dir, 'desktop-out')
    const info = await scaffold({ dir, outDir: out })
    expect(info.bundleId).toBe('com.morgana.shop')
    expect(info.version).toBe('0.2.0')
    const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'))
    expect(pkg.build.appId).toBe('com.morgana.shop')
    expect(pkg.build.win.target).toEqual(['nsis'])
    expect(pkg.dependencies['@morgana/desktop-electron']).toMatch(/^\^/)
    const main = fs.readFileSync(path.join(out, 'main.mjs'), 'utf8')
    expect(main).toContain("import { run } from '@morgana/desktop-electron'")
    expect(main).toContain('await run({ dir, port: 0 })')
    expect(fs.existsSync(path.join(out, 'dist', 'desktop', 'app.json'))).toBe(true)
  })

  it('refuses a project with no desktop lane', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-pack-no-'))
    await expect(scaffold({ dir, outDir: path.join(dir, 'out') })).rejects.toThrow('dist/desktop/app.json not found')
  })
})
