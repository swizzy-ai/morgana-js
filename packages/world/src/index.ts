/**
 * @studiomorgana/world — worlds from words (MEDIA.md §5, showcase 1).
 *
 *   const w = makeWorld('a choppy ocean at golden hour, with two rocky islands to the north. low mist.')
 *   w.piece      // every handle of every node, resolved (the document)
 *   w.html()     // one self-contained HTML file
 *   mountWorld(canvas, w.scene, SHADERS).play()
 */
import { readWords, resolveDistinct, vocabularyOf, type Ask, type AskLeaf, type Fingerprint, type PieceSpec, type ResolvedPiece } from '@studiomorgana/media'
import { compileWorld, type Scene } from './compile'
import { WORLD } from './generators'
import { worldHtml } from './html'
import { FRAGMENT, VERTEX } from './shader'

export { ocean, sky, island, mist, camera, WORLD } from './generators'
export { compileWorld, type Scene, type CameraPath, type Uniform } from './compile'
export { mountWorld, type WorldView } from './runtime'
export { worldHtml, minifyGlsl } from './html'
export const SHADERS = { vertex: VERTEX, fragment: FRAGMENT }

type Frame = NonNullable<PieceSpec['size']>['frame']

/** `island-1.cliffs.height = 0.9`, `ocean.colour.deep = #0b3d4f`, `style.warmth = 0.6`, `sky.sun.elevation = 4..9`. */
const HANDLE_LINE = /^\s*([a-z][\w-]*)\.([a-z][\w.]*)\s*[=:]\s*(.+?)\s*$/i

function valueOf(raw: string): AskLeaf {
  const range = raw.match(/^(-?[\d.]+)\s*(?:\.\.|–|to)\s*(-?[\d.]+)$/)
  if (range) return [Number(range[1]), Number(range[2])]
  if (/^-?[\d.]+$/.test(raw)) return Number(raw)
  if (/^(true|yes|on)$/i.test(raw)) return true
  if (/^(false|no|off)$/i.test(raw)) return false
  return raw.replace(/^["']|["']$/g, '')
}

function setPath(ask: Ask, path: string, value: AskLeaf) {
  const parts = path.split('.')
  let at = ask
  for (const k of parts.slice(0, -1)) at = (at[k] && typeof at[k] === 'object' && !Array.isArray(at[k]) ? at[k] : (at[k] = {})) as Ask
  at[parts[parts.length - 1]!] = value
}

/**
 * A sentence → a world piece. Ocean, sky, mist and camera are always there;
 * islands when named. Lines like `island-1.cliffs.height = 0.9` set any handle
 * directly (depth 2), over whatever the words asked.
 */
export function readWorld(text: string, opts: { seed?: string; frame?: Frame; length?: number } = {}): { spec: PieceSpec; unknown: string[]; handles: string[] } {
  const lines = text.split('\n')
  const handleLines = lines.filter((l) => HANDLE_LINE.test(l))
  const words = lines.filter((l) => !HANDLE_LINE.test(l)).join(' ')
  const r = readWords(words, WORLD, { always: ['ocean', 'sky', 'mist', 'camera'] })
  const style: { words: string[]; ask: Ask } = { words: r.style, ask: {} }
  const bad: string[] = []
  for (const l of handleLines) {
    const [, id, path, raw] = l.match(HANDLE_LINE)!
    if (id === 'style') { setPath(style.ask, path!, valueOf(raw!)); continue }
    const node = r.nodes.find((n) => n.id === id)
    if (!node) { bad.push(`${id} (there is no ${id}: ${r.nodes.map((n) => n.id).join(', ')})`); continue }
    node.ask = node.ask ?? {}
    setPath(node.ask, path!, valueOf(raw!))
  }
  return {
    handles: handleLines.map((l) => l.trim()),
    unknown: [...r.unknown, ...bad],
    spec: {
      name: words.trim().split(/[.,]/)[0]!.slice(0, 60) || 'world',
      medium: 'world',
      seed: opts.seed,
      style,
      size: { frame: opts.frame ?? '16:9' },
      clock: { length: opts.length ?? 12 },
      nodes: r.nodes,
    },
  }
}

export interface World {
  piece: ResolvedPiece
  scene: Scene
  fingerprint: Fingerprint
  /** How far it is from the nearest earlier world (1 if none). */
  nearest: number
  unknown: string[]
  html(title?: string): string
}

/** Words or a piece → a world, kept apart from `earlier` ones unless the seed is pinned. */
export function makeWorld(input: string | PieceSpec, opts: Parameters<typeof readWorld>[1] & { earlier?: Fingerprint[] } = {}): World {
  const read = typeof input === 'string' ? readWorld(input, opts) : { spec: input, unknown: [] }
  const d = resolveDistinct(read.spec, WORLD, opts.earlier ?? [])
  const scene = compileWorld(d.piece)
  return { piece: d.piece, scene, fingerprint: d.fingerprint, nearest: d.nearest, unknown: read.unknown, html: (title) => worldHtml(scene, { title }) }
}

/** This package's words and handles, as data (vocabulary.json). */
export const vocabulary = () => vocabularyOf('@studiomorgana/world', WORLD)
