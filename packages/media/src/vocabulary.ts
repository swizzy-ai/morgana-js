/**
 * A package's vocabulary, as data: its generators, their nouns, words and full
 * handle trees. Godtongue and agents read this; nothing keeps its own lists.
 */
import type { Handle, Handles } from './handles'
import type { Generator } from './piece'

type HandleDoc =
  | { kind: 'number'; min: number; max: number; default: number; unit?: string; int?: boolean; doc?: string }
  | { kind: 'choice'; options: readonly string[]; default: string; doc?: string }
  | { kind: 'colour'; default: string; doc?: string }
  | { kind: 'flag'; default: boolean; doc?: string }
  | { kind: 'group'; doc?: string; handles: Record<string, HandleDoc> }

function docOf(h: Handle): HandleDoc {
  switch (h.kind) {
    case 'group': return { kind: 'group', doc: h.doc, handles: docsOf(h.handles) }
    case 'number': return { kind: 'number', min: h.min, max: h.max, default: h.default, unit: h.unit, int: h.int, doc: h.doc }
    case 'choice': return { kind: 'choice', options: h.options, default: h.default, doc: h.doc }
    case 'colour': return { kind: 'colour', default: h.default, doc: h.doc }
    case 'flag': return { kind: 'flag', default: h.default, doc: h.doc }
  }
}
const docsOf = (hs: Handles) => Object.fromEntries(Object.entries(hs).map(([k, h]) => [k, docOf(h)]))

export function vocabularyOf(pkg: string, generators: Generator[]) {
  return {
    package: pkg,
    generators: generators.map((g) => ({
      kind: g.kind,
      nouns: g.nouns,
      doc: g.doc,
      max: g.max ?? 1,
      words: Object.keys(g.words),
      handles: docsOf(g.handles),
    })),
  }
}
