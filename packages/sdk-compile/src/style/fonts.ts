/**
 * Project fonts: `config.fonts` and `config.text` → `@font-face` rules and one
 * CSS variable per font.
 *
 *   fonts: { brand: { google: 'Inter', weights: [400, 700] } }
 *     → @font-face { font-family: "Inter"; src: url(_fonts/…woff2) … }
 *       :root { --font-brand: "Inter", system-ui, sans-serif }
 *   text: { body: 'brand' }  → :root { --font-body: var(--font-brand) }
 *
 * An object's `family: 'brand'` resolves to `var(--font-brand)` (style/props.ts).
 *
 * Google fonts are downloaded at build, not linked: the files are served from
 * the project's own /assets, so a visitor's browser never talks to Google, and
 * the page does not wait on a third-party stylesheet. Downloads are cached in
 * `.morgana/fonts/`, so `morgana dev` fetches once, and a build without
 * network still works after the first. A font that cannot be fetched is a
 * warning, and the fallback stack shows.
 *
 * URLs in the emitted CSS are relative (`_fonts/x.woff2`, `fonts/x.woff2`):
 * style.css lives in /assets, so they resolve wherever the host mounts it.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { FontSource, MorganaConfig } from '@studiomorgana/sdk'

export interface ResolvedFonts {
  /** @font-face rules and the :root variables, ready for style.css. */
  css: string
  /** Downloaded files to copy into dist/assets: `{ rel: '_fonts/x.woff2', file }`. */
  files: Array<{ rel: string; file: string }>
}

type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>

const DEFAULT_FALLBACK = 'system-ui, sans-serif'
// Google serves woff2 only to a browser that says it reads woff2.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const FORMATS: Record<string, string> = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' }

const quote = (family: string) => `"${family.replace(/"/g, '')}"`
const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)

/** The Google Fonts CSS API URL for one family. */
export function googleCssUrl(src: { google: string; weights?: number[]; italic?: boolean }): string {
  const weights = [...new Set(src.weights?.length ? src.weights : [400, 700])].sort((a, b) => a - b)
  const family = encodeURIComponent(src.google).replace(/%20/g, '+')
  const axis = src.italic
    ? `ital,wght@${[...weights.map((w) => `0,${w}`), ...weights.map((w) => `1,${w}`)].join(';')}`
    : `wght@${weights.join(';')}`
  return `https://fonts.googleapis.com/css2?family=${family}:${axis}&display=swap`
}

async function googleFaces(
  name: string,
  src: { google: string; weights?: number[]; italic?: boolean },
  cacheDir: string,
  fetchFn: Fetch,
  files: ResolvedFonts['files'],
): Promise<string> {
  const url = googleCssUrl(src)
  const cssCache = path.join(cacheDir, `${hash(url)}.css`)
  let css: string
  if (fs.existsSync(cssCache)) {
    css = fs.readFileSync(cssCache, 'utf8')
  } else {
    const res = await fetchFn(url, { headers: { 'user-agent': UA } })
    if (!res.ok) throw new Error(`Google Fonts answered ${res.status} for "${src.google}" — check the family name`)
    css = await res.text()
  }

  // Fetch every font file the CSS names, then point the CSS at the local copy.
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]!))]
  for (const remote of urls) {
    const fileName = `${hash(remote)}${path.extname(new URL(remote).pathname) || '.woff2'}`
    const local = path.join(cacheDir, fileName)
    if (!fs.existsSync(local)) {
      const res = await fetchFn(remote)
      if (!res.ok) throw new Error(`could not download a "${src.google}" file (${res.status})`)
      fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()))
    }
    files.push({ rel: `_fonts/${fileName}`, file: local })
    css = css.split(remote).join(`_fonts/${fileName}`)
  }
  // Written last: a cached CSS means its files are cached too.
  if (!fs.existsSync(cssCache)) fs.writeFileSync(cssCache, css)
  return css.trim()
}

function fileFaces(
  name: string,
  src: { file: string | string[]; weight?: number | string; style?: string },
  dir: string,
  warnings: string[],
): string {
  const list = Array.isArray(src.file) ? src.file : [src.file]
  const missing = list.filter((f) => !fs.existsSync(path.join(dir, 'assets', f)))
  if (missing.length) warnings.push(`font "${name}": ${missing.map((f) => `assets/${f}`).join(', ')} not found`)
  const srcs = list.map((f) => {
    const format = FORMATS[path.extname(f).toLowerCase()]
    return `url(${f.replace(/^\/+/, '')})${format ? ` format("${format}")` : ''}`
  })
  return [
    '@font-face{',
    `font-family:${quote(name)};`,
    `src:${srcs.join(',')};`,
    `font-weight:${src.weight ?? 400};`,
    `font-style:${src.style ?? 'normal'};`,
    'font-display:swap}',
  ].join('')
}

/** The family name a source paints with, for its CSS variable. */
function familyOf(name: string, src: FontSource): string {
  if (typeof src === 'string') return src
  const fallback = src.fallback ?? DEFAULT_FALLBACK
  return 'google' in src ? `${quote(src.google)}, ${fallback}` : `${quote(name)}, ${fallback}`
}

export async function resolveFonts(opts: {
  dir: string
  config: Pick<MorganaConfig, 'fonts' | 'text'>
  warnings: string[]
  fetch?: Fetch
}): Promise<ResolvedFonts> {
  const { dir, config, warnings } = opts
  const fonts = config.fonts ?? {}
  const files: ResolvedFonts['files'] = []
  const faces: string[] = []
  const vars: string[] = []
  const cacheDir = path.join(dir, '.morgana', 'fonts')
  const fetchFn = opts.fetch ?? (globalThis.fetch as unknown as Fetch)

  for (const [name, src] of Object.entries(fonts)) {
    if (!/^[A-Za-z][\w-]*$/.test(name)) {
      warnings.push(`font "${name}": names are letters, digits, - and _ (it becomes family: '${name}')`)
      continue
    }
    try {
      if (typeof src === 'object' && 'google' in src) {
        fs.mkdirSync(cacheDir, { recursive: true })
        faces.push(await googleFaces(name, src, cacheDir, fetchFn, files))
      } else if (typeof src === 'object' && 'file' in src) {
        faces.push(fileFaces(name, src, dir, warnings))
      }
    } catch (err) {
      warnings.push(`font "${name}" not loaded, its fallback will show: ${(err as Error).message}`)
    }
    vars.push(`--font-${name}:${familyOf(name, src)}`)
  }

  const text = config.text ?? {}
  for (const role of ['body', 'headings', 'mono'] as const) {
    const v = text[role]
    if (!v) continue
    vars.push(`--font-${role}:${fonts[v] !== undefined ? `var(--font-${v})` : v}`)
  }

  const css = [...faces, vars.length ? `:root{${vars.join(';')}}` : ''].filter(Boolean).join('\n')
  return { css, files }
}
