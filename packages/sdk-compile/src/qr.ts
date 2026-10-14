/**
 * QR code encoder — byte mode, versions 1–40, error correction L/M/Q/H, the
 * standard eight masks with penalty scoring. Dependency-free and pure, so the
 * compile lane renders the SVG and the browser re-encodes on `setValue` with
 * the same code. A port of the reference algorithm (ISO/IEC 18004; structure
 * after Project Nayuki's public-domain implementation).
 */

export type QrEcc = 'L' | 'M' | 'Q' | 'H'

const ECC_INDEX: Record<QrEcc, number> = { L: 0, M: 1, Q: 2, H: 3 }
const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 }

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
]
// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
]

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0
}

function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  return result
}

function numDataCodewords(ver: number, ecl: QrEcc): number {
  const e = ECC_INDEX[ecl]
  return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[e]![ver]! * NUM_ERROR_CORRECTION_BLOCKS[e]![ver]!
}

// ── Reed–Solomon over GF(2^8), polynomial 0x11D ────────────────────────────

function rsMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree - 1).fill(0)
  result.push(1)
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j]!, root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]!
    }
    root = rsMultiply(root, 0x02)
  }
  return result
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => (result[i] ^= rsMultiply(coef, factor)))
  }
  return result
}

// ── Encoding ───────────────────────────────────────────────────────────────

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

/** The module grid for `text`: true = dark. */
export function encodeQr(text: string, ecl: QrEcc = 'M'): boolean[][] {
  const data = utf8Bytes(text)
  // Smallest version that fits: mode (4) + count (8 or 16) + data.
  let ver = 1
  let dataUsedBits = 0
  for (; ; ver++) {
    if (ver > 40) throw new Error('QR: text is too long to encode')
    const countBits = ver <= 9 ? 8 : 16
    dataUsedBits = 4 + countBits + data.length * 8
    if (data.length < 1 << countBits && dataUsedBits <= numDataCodewords(ver, ecl) * 8) break
  }
  // Boost the error correction level while it still fits in this version.
  for (const better of ['M', 'Q', 'H'] as QrEcc[]) {
    if (ECC_INDEX[better] > ECC_INDEX[ecl] && dataUsedBits <= numDataCodewords(ver, better) * 8) ecl = better
  }

  const bits: number[] = []
  const append = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  append(0x4, 4)
  append(data.length, ver <= 9 ? 8 : 16)
  for (const b of data) append(b, 8)
  const capacity = numDataCodewords(ver, ecl) * 8
  append(0, Math.min(4, capacity - bits.length))
  append(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8)
  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

  // Split into blocks, add ECC, interleave.
  const e = ECC_INDEX[ecl]
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[e]![ver]!
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[e]![ver]!
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8)
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
  const shortBlockLen = Math.floor(rawCodewords / numBlocks)
  const blocks: number[][] = []
  const divisor = rsDivisor(blockEccLen)
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = codewords.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, divisor)
    if (i < numShortBlocks) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const finalCodewords: number[] = []
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) finalCodewords.push(block[i]!)
    })
  }

  return new QrMatrix(ver, ecl, finalCodewords).modules
}

class QrMatrix {
  readonly size: number
  readonly modules: boolean[][]
  private readonly isFunction: boolean[][]

  constructor(
    private readonly version: number,
    private readonly ecl: QrEcc,
    codewords: number[],
  ) {
    this.size = version * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.drawFunctionPatterns()
    this.drawCodewords(codewords)
    let best = 0
    let minPenalty = Infinity
    for (let m = 0; m < 8; m++) {
      this.applyMask(m)
      this.drawFormatBits(m)
      const p = this.penalty()
      if (p < minPenalty) {
        best = m
        minPenalty = p
      }
      this.applyMask(m)
    }
    this.applyMask(best)
    this.drawFormatBits(best)
  }

  private set(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark
    this.isFunction[y]![x] = true
  }

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0)
      this.set(i, 6, i % 2 === 0)
    }
    this.drawFinder(3, 3)
    this.drawFinder(this.size - 4, 3)
    this.drawFinder(3, this.size - 4)
    const pos = this.alignmentPositions()
    const n = pos.length
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0))) this.drawAlignment(pos[i]!, pos[j]!)
      }
    }
    this.drawFormatBits(0)
    this.drawVersion()
  }

  private drawFormatBits(mask: number): void {
    const data = (ECC_FORMAT_BITS[this.ecl] << 3) | mask
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) this.set(8, i, getBit(bits, i))
    this.set(8, 7, getBit(bits, 6))
    this.set(8, 8, getBit(bits, 7))
    this.set(7, 8, getBit(bits, 8))
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, getBit(bits, i))
    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, getBit(bits, i))
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, getBit(bits, i))
    this.set(8, this.size - 8, true)
  }

  private drawVersion(): void {
    if (this.version < 7) return
    let rem = this.version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (this.version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i)
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.set(a, b, bit)
      this.set(b, a, bit)
    }
  }

  private drawFinder(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.set(xx, yy, dist !== 2 && dist !== 4)
      }
    }
  }

  private drawAlignment(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }

  private alignmentPositions(): number[] {
    if (this.version === 1) return []
    const num = Math.floor(this.version / 7) + 2
    const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (num * 2 - 2)) * 2
    const result = [6]
    for (let pos = this.size - 7; result.length < num; pos -= step) result.splice(1, 0, pos)
    return result
  }

  private drawCodewords(data: number[]): void {
    let i = 0
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vert : vert
          if (!this.isFunction[y]![x] && i < data.length * 8) {
            this.modules[y]![x] = getBit(data[i >>> 3]!, 7 - (i & 7))
            i++
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break
          case 1: invert = y % 2 === 0; break
          case 2: invert = x % 3 === 0; break
          case 3: invert = (x + y) % 3 === 0; break
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
        }
        if (!this.isFunction[y]![x] && invert) this.modules[y]![x] = !this.modules[y]![x]
      }
    }
  }

  private penalty(): number {
    const n = this.size
    let result = 0
    const runPenalty = (line: boolean[]) => {
      let p = 0
      let runColor = false
      let runLen = 0
      const history = [0, 0, 0, 0, 0, 0, 0]
      const addHistory = (len: number) => {
        if (history[0] === 0) len += n
        history.pop()
        history.unshift(len)
      }
      const finderLike = () => {
        const c = history[1]!
        const core = c > 0 && history[2] === c && history[3] === c * 3 && history[4] === c && history[5] === c
        return (core && history[0]! >= c * 4 && history[6]! >= c ? 1 : 0) + (core && history[6]! >= c * 4 && history[0]! >= c ? 1 : 0)
      }
      for (const dark of line) {
        if (dark === runColor) {
          runLen++
          if (runLen === 5) p += 3
          else if (runLen > 5) p++
        } else {
          addHistory(runLen)
          if (!runColor) p += finderLike() * 40
          runColor = dark
          runLen = 1
        }
      }
      // Terminate the run against the light border.
      if (runColor) {
        addHistory(runLen)
        runLen = 0
      }
      runLen += n
      addHistory(runLen)
      p += finderLike() * 40
      return p
    }
    for (let y = 0; y < n; y++) result += runPenalty(this.modules[y]!)
    for (let x = 0; x < n; x++) result += runPenalty(this.modules.map((row) => row[x]!))
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const c = this.modules[y]![x]
        if (c === this.modules[y]![x + 1] && c === this.modules[y + 1]![x] && c === this.modules[y + 1]![x + 1]) result += 3
      }
    }
    let dark = 0
    for (const row of this.modules) for (const m of row) if (m) dark++
    const total = n * n
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
    result += k * 10
    return result
  }
}

/** An SVG for `text`: one path, crisp at any size, with a quiet zone. */
export function qrSvg(text: string, opts: { ecc?: QrEcc; color?: string; background?: string; margin?: number } = {}): string {
  const modules = encodeQr(text, opts.ecc ?? 'M')
  const margin = opts.margin ?? 4
  const size = modules.length + margin * 2
  let d = ''
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) d += `M${x + margin},${y + margin}h1v1h-1z`
    })
  })
  const fg = opts.color ?? 'currentColor'
  const bg = opts.background ?? 'transparent'
  return `<svg data-part="code" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img"><rect width="100%" height="100%" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`
}

/** The SVG for a qrCode's props — shared with the runtime so set() repaints identically. */
export function qrMarkup(props: Record<string, unknown>): string {
  const value = typeof props['value'] === 'string' ? props['value'] : props['value'] == null ? '' : String(props['value'])
  if (!value) return ''
  const ecc = (['L', 'M', 'Q', 'H'] as const).find((e) => e === props['ecc']) ?? 'M'
  try {
    return qrSvg(value, {
      ecc,
      color: typeof props['codeColor'] === 'string' ? props['codeColor'] : 'currentColor',
      background: typeof props['codeBackground'] === 'string' ? props['codeBackground'] : '#ffffff',
    })
  } catch {
    return '<span data-part="error">Too long for a QR code</span>'
  }
}

