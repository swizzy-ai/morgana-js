// The asset compiler: one definition + one variant → files. Pure: no fs, no
// clock, no network — the same code runs in the CLI, a browser worker or the cloud.
import type { AssetDefinition, Clips, Kit, Layer, Part } from '../index'
import { compile2d } from './compile2d'
import { compile3d } from './compile3d'
import { writeGlb } from './glb'
import type { ClipInfo } from './motion'

export interface CompiledFile { role: string; name: string; data: Uint8Array | string }

export interface CompiledAsset {
  kind: '2d' | '3d'
  clips: ClipInfo[]
  /** In order: the first file is what a bare `asset:name` points at. */
  files: CompiledFile[]
  /** 3D: how many triangles, for budgets. */
  triangles?: number
}

export function variantsOf(def: AssetDefinition): string[] {
  return def.variants ? Object.keys(def.variants) : ['default']
}

export function compileAsset(def: AssetDefinition, kit: Kit): CompiledAsset {
  const variant = kit.variant
  const v = def.variants?.[variant] ?? {}

  let parts: Array<Part | Layer> = (def.parts ?? []) as Array<Part | Layer>
  let clips: Clips = { ...(def.animations ?? {}) }
  if (def.build) {
    const built = (def.build as (k: Kit) => unknown)(kit) as Array<Part | Layer> | { parts: Array<Part | Layer>; animations?: Clips }
    if (Array.isArray(built)) parts = built
    else { parts = built.parts; clips = { ...clips, ...(built.animations ?? {}) } }
  }

  // A variant's overrides apply to copies: definitions are module-level and shared.
  if (v.set) {
    parts = parts.map((p) => {
      const over = v.set![p.id]
      if (!over) return p
      return Object.assign(Object.create(Object.getPrototypeOf(p)), p, { opts: { ...p.opts, ...over } })
    })
  }

  const base = def.name
  if (def.kind === '3d') {
    const out = compile3d(base, parts as Part[], clips)
    const triangles = out.scene.meshes.reduce((n, m) => n + m.data.positions.length / 9, 0)
    return { kind: '3d', clips: out.clips, triangles, files: [{ role: 'model', name: `${base}.glb`, data: writeGlb(out.scene) }] }
  }

  const out = compile2d(base, parts as Layer[], clips, def.canvas ?? 128, def.fps ?? 12, `${base}.sheet.svg`)
  const files: CompiledFile[] = [{ role: 'still', name: `${base}.svg`, data: out.still }]
  for (const [clip, svg] of Object.entries(out.animated)) files.push({ role: `clip:${clip}`, name: `${base}.${clip}.svg`, data: svg })
  if (out.sheet) {
    files.push({ role: 'sheet', name: `${base}.sheet.svg`, data: out.sheet.svg })
    files.push({ role: 'atlas', name: `${base}.sheet.json`, data: JSON.stringify(out.sheet.atlas, null, 2) + '\n' })
  }
  return { kind: '2d', clips: out.clips, files }
}
