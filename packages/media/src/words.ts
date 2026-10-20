/**
 * From a sentence to a piece's nodes, using only the generators' own nouns and
 * words: "a choppy ocean at golden hour, with two rocky islands to the north
 * and low mist".
 *
 * Each clause names a thing (or keeps talking about the last one); the words
 * in it go to the thing that knows them. A word only another generator knows
 * goes to that generator, adding it if the piece doesn't have it yet. Words
 * nobody knows come back in `unknown`, so the caller can say so.
 */
import type { Generator, NodeSpec } from './piece'
import { STYLE } from './piece'

export interface Read {
  nodes: NodeSpec[]
  style: string[]
  /** Words no generator knows. */
  unknown: string[]
}

const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, few: 3, several: 3 }
const FILLER = new Set(['a', 'an', 'the', 'at', 'of', 'in', 'on', 'with', 'and', 'its', 'it', 'is', 'are', 'there', 'some', 'very', 'over', 'into', 'to', 'by', 'from', 'up', 'that', 'this', 'which', 'while', 'then', 'as', 'for'])

/** The longest phrases first, so "golden hour" wins over "golden". */
const phrases = (list: string[]) => [...new Set(list)].sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length)

export function readWords(text: string, generators: Generator[], opts: { always?: string[] } = {}): Read {
  const gens = [...generators]
  const clauses = text.toLowerCase().replace(/[“”"']/g, '').split(/[.;]|,|\bwith\b|\band\b(?! (?:then|back))/).map((c) => c.trim()).filter(Boolean)
  const nodes: NodeSpec[] = []
  const style: string[] = []
  const unknown: string[] = []
  const byKind = (k: string) => nodes.filter((n) => n.kind === k)
  const add = (g: Generator, count = 1, words: string[] = []): NodeSpec[] => {
    const made: NodeSpec[] = []
    for (let i = 0; i < count; i++) {
      const have = byKind(g.kind).length
      if (have >= (g.max ?? 1)) break
      const n: NodeSpec = { id: (g.max ?? 1) > 1 ? `${g.kind}-${have + 1}` : g.kind, kind: g.kind, words: [...words] }
      nodes.push(n)
      made.push(n)
    }
    return made
  }
  const nounOf = new Map<string, Generator>()
  for (const g of gens) for (const n of g.nouns) nounOf.set(n, g)
  const nounPhrases = phrases([...nounOf.keys()])
  let subject: NodeSpec[] = []

  for (const raw of clauses) {
    let clause = ` ${raw} `
    // 1. A thing named in this clause becomes the subject, with how many of it.
    for (const noun of nounPhrases) {
      const m = clause.match(new RegExp(` (?:(\\w+) )?(?:(\\w+) )?${noun.replace(/ /g, ' ')} `))
      if (!m) continue
      const g = nounOf.get(noun)!
      const count = Math.max(1, NUMBERS[m[1] ?? ''] ?? NUMBERS[m[2] ?? ''] ?? (/s$/.test(noun) && !g.nouns.includes(noun.replace(/s$/, '')) ? 2 : 1))
      const existing = byKind(g.kind)
      subject = existing.length && count <= existing.length && !/s$/.test(noun) ? existing.slice(0, 1) : add(g, count)
      if (!subject.length) subject = existing
      clause = clause.replace(` ${noun} `, ' ')
      break
    }
    // 2. Each known phrase goes to the subject if it knows it; else to whoever does.
    const subjectKind = subject[0]?.kind
    const candidates: [string, Generator][] = []
    for (const g of [STYLE, ...gens]) for (const w of Object.keys(g.words)) candidates.push([w, g])
    for (const w of phrases(candidates.map(([w]) => w))) {
      if (!clause.includes(` ${w} `)) continue
      const owners = candidates.filter(([x]) => x === w).map(([, g]) => g)
      const owner = owners.find((g) => g.kind === subjectKind) ?? owners.find((g) => g.kind !== 'style' && byKind(g.kind).length) ?? owners.find((g) => g.kind !== 'style') ?? owners[0]!
      if (owner.kind === 'style') style.push(w)
      else {
        const targets = owner.kind === subjectKind ? subject : byKind(owner.kind).length ? byKind(owner.kind) : add(owner)
        for (const t of targets) t.words!.push(w)
      }
      clause = clause.replace(` ${w} `, '  ')
    }
    // 3. What's left that isn't filler or a number is unknown.
    for (const word of clause.split(/\s+/).filter(Boolean)) {
      if (!FILLER.has(word) && !(word in NUMBERS) && !/^\d+$/.test(word)) unknown.push(word)
    }
  }
  for (const k of opts.always ?? []) {
    const g = gens.find((x) => x.kind === k)
    if (g && !byKind(k).length) add(g)
  }
  return { nodes, style, unknown }
}
