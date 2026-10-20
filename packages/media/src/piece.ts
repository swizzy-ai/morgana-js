/**
 * Generators, styles and pieces.
 *
 * A generator is a known thing (an ocean, an island) as code: its full handle
 * tree, the words that narrow it, and the nouns that name it. A piece is a
 * set of nodes made by generators, with one seed and one style.
 */
import { group, merge, num, resolve, type Ask, type Handles, type Values } from './handles'
import { childSeed, newSeed } from './random'

export interface Generator {
  /** `ocean`, `island`. */
  kind: string
  /** What people call it: `['ocean', 'sea']`; plurals too: `['islands']`. */
  nouns: string[]
  doc: string
  /** The full handle tree. */
  handles: Handles
  /**
   * Words and what they ask of the handles, as ranges: `choppy: { waves: { height: [1.2, 2.5] } }`.
   * Multi-word phrases are fine: `'golden hour'`, `'to the north'`.
   */
  words: Record<string, Ask>
  /** How many can be in one piece (islands: 4). Default 1. */
  max?: number
}

export const defineGenerator = (g: Generator): Generator => g

// ── style ───────────────────────────────────────────────────────────────────

/**
 * A project's style DNA: the same handles for every generator to read, so a
 * project's pieces belong together and two projects' pieces differ.
 */
export const STYLE: Generator = defineGenerator({
  kind: 'style',
  nouns: ['style'],
  doc: 'The look every generator in a piece reads: warmth, saturation, contrast, detail, drama.',
  handles: {
    warmth: num(-1, 1, 0, { doc: 'Cool (−1) to warm (1): shifts colours and light' }),
    saturation: num(0.4, 1.6, 1, { doc: 'Muted to vivid' }),
    contrast: num(0.6, 1.5, 1, { doc: 'Soft to punchy' }),
    detail: num(0, 1, 0.6, { doc: 'Simple to intricate: octaves, noise, small features' }),
    drama: num(0, 1, 0.4, { doc: 'Calm to dramatic: light angles, clouds, motion' }),
    grain: num(0, 1, 0.12, { vary: 0.25, doc: 'Film grain and texture' }),
  },
  words: {
    warm: { warmth: [0.4, 0.9] },
    cool: { warmth: [-0.9, -0.4] },
    muted: { saturation: [0.45, 0.75] },
    vivid: { saturation: [1.2, 1.6] },
    pastel: { saturation: [0.5, 0.8], contrast: [0.6, 0.8] },
    moody: { drama: [0.7, 1], contrast: [1.1, 1.4], saturation: [0.6, 0.9] },
    dramatic: { drama: [0.75, 1], contrast: [1.2, 1.5] },
    calm: { drama: [0, 0.3] },
    serene: { drama: [0, 0.25], contrast: [0.7, 0.9] },
    detailed: { detail: [0.75, 1] },
    simple: { detail: [0, 0.3] },
    cinematic: { contrast: [1.1, 1.3], grain: [0.25, 0.45], drama: [0.5, 0.8] },
    clean: { grain: [0, 0.05] },
    filmic: { grain: [0.3, 0.6] },
  },
})

// ── pieces ──────────────────────────────────────────────────────────────────

export interface NodeSpec {
  id: string
  kind: string
  /** Words, applied in order, then `ask` over them. */
  words?: string[]
  ask?: Ask
  /** Pin this node's seed. Otherwise it is derived from the piece's seed and the id. */
  seed?: string
}

export interface PieceSpec {
  name: string
  medium: 'drawing' | 'picture' | 'motion' | 'sound' | 'world' | 'game'
  /** Pin the seed to make the same piece again. Leave it out and every build is new. */
  seed?: string
  style?: { words?: string[]; ask?: Ask }
  size?: { frame?: '16:9' | '9:16' | '4:5' | '1:1'; width?: number; height?: number }
  clock?: { bpm?: number; length?: number }
  nodes: NodeSpec[]
}

export const definePiece = (p: PieceSpec): PieceSpec => p

export interface ResolvedNode {
  id: string
  kind: string
  seed: string
  values: Values
  /** Handle paths someone asked for, by word or value. */
  asked: string[]
  words: string[]
}

export interface ResolvedPiece {
  name: string
  medium: PieceSpec['medium']
  seed: string
  /** Whether the seed was pinned, or drawn for this build. */
  pinned: boolean
  style: Values
  size: Required<Pick<NonNullable<PieceSpec['size']>, 'width' | 'height'>> & { frame: string }
  clock: { bpm: number; length: number }
  nodes: ResolvedNode[]
}

const FRAMES: Record<string, [number, number]> = { '16:9': [1920, 1080], '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080] }

/** The words a generator knows that a node asked for, merged into one ask. Unknown words are an error that names them. */
export function askOf(g: Generator, words: string[] = [], ask?: Ask): Ask {
  const unknown = words.filter((w) => !g.words[w])
  if (unknown.length) throw new Error(`${g.kind} doesn't know ${unknown.map((w) => `"${w}"`).join(', ')}. It knows: ${Object.keys(g.words).join(', ')}`)
  return merge(...words.map((w) => g.words[w]), ask)
}

/** Every handle of every node a value, with one seed. */
export function resolvePiece(spec: PieceSpec, generators: Generator[], seed = spec.seed ?? newSeed()): ResolvedPiece {
  const byKind = new Map(generators.map((g) => [g.kind, g]))
  const style = resolve(STYLE.handles, askOf(STYLE, spec.style?.words, spec.style?.ask), childSeed(seed, 'style')).values
  const counts = new Map<string, number>()
  const nodes = spec.nodes.map((n): ResolvedNode => {
    const g = byKind.get(n.kind)
    if (!g) throw new Error(`No generator for "${n.kind}". Known: ${[...byKind.keys()].join(', ')}`)
    const count = (counts.get(n.kind) ?? 0) + 1
    counts.set(n.kind, count)
    if (count > (g.max ?? 1)) throw new Error(`A piece can hold at most ${g.max ?? 1} ${g.kind}${(g.max ?? 1) > 1 ? 's' : ''}`)
    const nodeSeed = n.seed ?? childSeed(seed, n.id)
    const r = resolve(g.handles, askOf(g, n.words, n.ask), nodeSeed)
    return { id: n.id, kind: n.kind, seed: nodeSeed, values: r.values, asked: r.asked, words: n.words ?? [] }
  })
  const [w, h] = FRAMES[spec.size?.frame ?? '16:9'] ?? FRAMES['16:9']!
  return {
    name: spec.name,
    medium: spec.medium,
    seed,
    pinned: !!spec.seed,
    style,
    size: { frame: spec.size?.frame ?? '16:9', width: spec.size?.width ?? w, height: spec.size?.height ?? h },
    clock: { bpm: spec.clock?.bpm ?? 80, length: spec.clock?.length ?? 12 },
    nodes,
  }
}

/** The style handles, for documentation and tools. */
export const styleHandles = (): Handles => ({ style: group(STYLE.doc, STYLE.handles) })
