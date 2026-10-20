/**
 * `morgana docs` — the project's documentation, generated.
 *
 *   morgana docs                       write dist/docs/ (photographs screens from a running `morgana dev`)
 *   morgana docs --url http://…:4332   photograph from that address
 *   morgana docs --no-shots            skip the storyboard photographs
 *
 * `morgana dev` also serves it live at /_morgana/docs.
 *
 * Storyboard screens beyond the automatic ones are listed in morgana.docs.json:
 *   { "storyboard": [{ "title": "Brief", "page": "home", "state": { "view": "brief" } }] }
 */
import fs from 'node:fs'
import path from 'node:path'
import { collectDocs } from '../lib/docs-model.mjs'
import { captureStoryboard, framesOf } from '../lib/docs-shots.mjs'
import { renderDocs } from '../lib/docs-site.mjs'
import { say, dim } from '../ui.mjs'

/** The project's own storyboard frames, from morgana.docs.json. */
export function docsConfig(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'morgana.docs.json'), 'utf8')) } catch { return {} }
}

/**
 * Collect, photograph and render into `out`. Returns the index file's path.
 * @param {{ dir: string, out: string, url?: string, shots?: boolean, log?: (s: string) => void }} opts
 */
export async function writeDocs({ dir, out, url, shots = true, log = () => {} }) {
  const model = collectDocs(dir)
  const config = docsConfig(dir)
  const frames = framesOf(model, config.storyboard ?? [])
  if (shots && url) {
    log(`Photographing ${frames.length} screen${frames.length === 1 ? '' : 's'} from ${url}`)
    const shot = await captureStoryboard(frames, url, path.join(out, 'storyboard'), { log })
    model.storyboard = shot.frames
    model.storyboardProblem = shot.problem
    if (shot.problem) log(shot.problem)
  } else {
    // Not photographing now: keep the photographs already taken.
    const dirOf = path.join(out, 'storyboard')
    model.storyboard = frames.map((f) => (fs.existsSync(path.join(dirOf, `${f.id}.png`)) ? { ...f, image: `${f.id}.png` } : f))
    model.storyboardProblem = shots && !model.storyboard.some((f) => f.image) ? 'Start `morgana dev` (or pass --url) to photograph the screens.' : ''
  }
  fs.mkdirSync(out, { recursive: true })
  model.demos = copyDemos(dir, out)
  const file = path.join(out, 'index.html')
  fs.writeFileSync(file, renderDocs(model))
  return file
}

/** The videos `morgana demo` made (dist/demos), copied beside the docs so the page can play them. */
function copyDemos(dir, out) {
  const from = path.join(dir, 'dist', 'demos')
  if (!fs.existsSync(from)) return []
  let titles = {}
  try { titles = JSON.parse(fs.readFileSync(path.join(dir, 'morgana.demos.json'), 'utf8')).demos ?? {} } catch {}
  const to = path.join(out, 'demos')
  fs.mkdirSync(to, { recursive: true })
  return fs.readdirSync(from).filter((f) => /\.(mp4|webm)$/.test(f)).sort().map((f) => {
    const base = f.replace(/\.[a-z0-9]+$/, '')
    const poster = fs.existsSync(path.join(from, `${base}.jpg`)) ? `${base}.jpg` : ''
    for (const x of [f, poster].filter(Boolean)) {
      if (path.resolve(from, x) !== path.resolve(to, x)) fs.copyFileSync(path.join(from, x), path.join(to, x))
    }
    const m = base.match(/^(.*)-(\d+)x(\d+)$/)
    const name = m ? m[1] : base
    return { name, title: titles[name]?.title ?? name, format: m ? `${m[2]}:${m[3]}` : '', file: `demos/${f}`, poster: poster ? `demos/${poster}` : '', bytes: fs.statSync(path.join(from, f)).size }
  })
}

export async function docs({ dir, out, url, shots = true }) {
  const root = path.resolve(dir)
  const target = path.resolve(root, out || path.join('dist', 'docs'))
  let base = url
  if (!base && shots) {
    for (const port of [process.env.PORT, 4317].filter(Boolean)) {
      const u = `http://localhost:${port}`
      try { if ((await fetch(u, { signal: AbortSignal.timeout(1500) })).status < 500) { base = u; break } } catch {}
    }
  }
  const file = await writeDocs({ dir: root, out: target, url: base, shots, log: (s) => say(dim(s)) })
  say(`Docs written: ${path.relative(process.cwd(), file) || file}`)
  if (shots && !base) say(dim('No running app found, so the storyboard has no photographs: start `morgana dev`, or pass --url.'))
}
