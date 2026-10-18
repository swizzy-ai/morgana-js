/**
 * Where a build-time error happened, in the project's own files.
 *
 * Compile actions, plugin definitions and plugins are bundled and evaluated
 * with `new Function`, so a thrown error's stack points into a bundle nobody
 * wrote: `<anonymous>:2107:41`. The bundle carries an inline source map; this
 * reads the error's position, translates it through the map, and answers
 * `src/lib/build-studio.ts:160:41` — the line to open.
 *
 * Done by hand rather than with Node's source-map support because that is a
 * process-wide switch, and the compiler runs inside other people's processes.
 */

/** `new Function(...args, body)` puts the body after a two-line header. */
const FUNCTION_HEADER_LINES = 2

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]))

interface RawMap {
  sources: string[]
  mappings: string
}

/** Per generated line: segments of [generatedColumn, sourceIndex, sourceLine, sourceColumn], all 0-based. */
function decode(mappings: string): number[][][] {
  const lines: number[][][] = []
  let src = 0, srcLine = 0, srcCol = 0
  for (const line of mappings.split(';')) {
    const segments: number[][] = []
    let genCol = 0
    for (const seg of line.split(',')) {
      if (!seg) continue
      const values: number[] = []
      let value = 0, shift = 0
      for (const ch of seg) {
        const digit = B64_INDEX.get(ch)
        if (digit === undefined) return lines
        value += (digit & 31) << shift
        if (digit & 32) shift += 5
        else {
          values.push(value & 1 ? -(value >>> 1) : value >>> 1)
          value = 0
          shift = 0
        }
      }
      genCol += values[0] ?? 0
      if (values.length >= 4) {
        src += values[1]; srcLine += values[2]; srcCol += values[3]
        segments.push([genCol, src, srcLine, srcCol])
      }
    }
    lines.push(segments)
  }
  return lines
}

/** The inline source map at the end of an esbuild bundle, if it has one. */
function inlineMap(code: string): RawMap | null {
  const m = /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/.exec(code)
  if (!m) return null
  try {
    return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as RawMap
  } catch {
    return null
  }
}

/** A 1-based line and column in the bundle → the source file, 1-based line and column. */
function original(map: RawMap, line: number, column: number): { source: string; line: number; column: number } | null {
  const segments = decode(map.mappings)[line - 1]
  if (!segments?.length) return null
  let best: number[] | null = null
  for (const s of segments) {
    if (s[0] <= column - 1) best = s
    else break
  }
  best ??= segments[0]
  const source = map.sources[best[1]]
  if (!source) return null
  return { source: source.replace(/^(\.\.\/)+/, ''), line: best[2] + 1, column: best[3] + 1 }
}

/**
 * The project-file location an error was thrown from, inside a bundle
 * evaluated with `new Function`, or null when it can't tell. Frames inside
 * the SDK or node_modules are skipped: the line worth opening is the user's.
 */
export function locateError(err: unknown, code: string | undefined): string | null {
  if (!code || !(err instanceof Error) || !err.stack) return null
  const map = inlineMap(code)
  if (!map) return null
  for (const m of err.stack.matchAll(/<anonymous>:(\d+):(\d+)\)/g)) {
    const at = original(map, Number(m[1]) - FUNCTION_HEADER_LINES, Number(m[2]))
    if (!at) continue
    if (/(^|\/)node_modules\/|(^|\/)packages\/sdk(-compile)?\/src\//.test(at.source)) continue
    return `${at.source}:${at.line}:${at.column}`
  }
  return null
}

/** Bundles evaluated in this process, by what they produced, so a later error can be located. */
const BUNDLES = new WeakMap<object, string>()

export function rememberBundle(product: unknown, code: string): void {
  if (product && (typeof product === 'object' || typeof product === 'function')) BUNDLES.set(product as object, code)
}

export function bundleOf(product: unknown): string | undefined {
  return product && (typeof product === 'object' || typeof product === 'function') ? BUNDLES.get(product as object) : undefined
}

/** `message` with ` at <file:line:col>` added when the error can be located. */
export function withLocation(message: string, err: unknown, ...codes: Array<string | undefined>): string {
  for (const code of codes) {
    const where = locateError(err, code)
    if (where) return `${message} (at ${where})`
  }
  return message
}
