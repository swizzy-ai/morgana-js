/**
 * `morgana demo` — demo videos of the running app, sized for social video.
 *
 *   morgana demo                         list the demos in morgana.demos.json
 *   morgana demo fix-cv                  record one: dist/demos/fix-cv-9x16.mp4 (+ a poster)
 *   morgana demo --all                   record every demo
 *   morgana demo fix-cv --list           its scenes, numbered
 *   morgana demo fix-cv --skip 2,4       leave scenes out; --only 1-3 keeps just those
 *   morgana demo fix-cv --format 1:1     9:16 (Reels, TikTok, Shorts) · 4:5 · 1:1 · 16:9
 *   morgana demo fix-cv --audio a.mp3    with music or a voice-over; --no-audio without
 *   morgana demo --from-storyboard       one demo of every storyboard screen
 *   --stills                             also each scene's last frame, to check it at a glance
 *
 * Records from a running `morgana dev` (or --url). morgana.demos.json:
 *   { "format": "9:16", "demos": { "fix-cv": { "audio": "assets/beat.mp3", "scenes": [
 *       { "path": "/?view=pick", "seconds": 2.5, "caption": "Free tools. Ads pay for them." },
 *       { "path": "/?view=pick", "do": [{ "click": "svc-tile", "key": "fix-cv" }] },
 *       { "storyboard": "Fix my CV: working", "seconds": 3, "caption": "It rewrites from your facts" },
 *       { "path": "/tools/fix-my-cv", "do": [{ "scroll": 500 }], "skip": true } ] } } }
 * A scene can `click` an object by id (a list row by `key`), `type` into one, `scroll` and `wait`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { collectDocs } from '../lib/docs-model.mjs'
import { framesOf } from '../lib/docs-shots.mjs'
import { FORMATS, renderDemo, resolveScene, sceneSeconds } from '../lib/demo.mjs'
import { docsConfig } from './docs.mjs'
import { say, dim } from '../ui.mjs'

function readDemos(dir) {
  const file = path.join(dir, 'morgana.demos.json')
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { throw new Error(`morgana.demos.json isn't valid JSON: ${e.message}`) }
}

/** "2,4" and "1-3" as scene numbers. */
function numbers(spec) {
  const out = new Set()
  for (const part of String(spec ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) throw new Error(`"${part}" isn't a scene number or range (e.g. 2,4 or 1-3)`)
    for (let n = Number(m[1]); n <= Number(m[2] ?? m[1]); n++) out.add(n)
  }
  return out
}

async function findApp(url) {
  if (url) return url
  for (const port of [process.env.PORT, 4317].filter(Boolean)) {
    const u = `http://localhost:${port}`
    try { if ((await fetch(u, { signal: AbortSignal.timeout(1500) })).status < 500) return u } catch {}
  }
  return null
}

export async function demo({ dir, names = [], all = false, list = false, skip, only, format, audio, noAudio = false, url, out, stills = false, fromStoryboard = false }) {
  const root = path.resolve(dir)
  const config = readDemos(root) ?? { demos: {} }
  const demos = { ...(config.demos ?? {}) }

  // The storyboard's screens, which scenes can name, and which can make a demo of their own.
  let storyboard = []
  try {
    const model = collectDocs(root)
    storyboard = framesOf(model, docsConfig(root).storyboard ?? [])
  } catch { /* no build yet: scenes can still use addresses */ }
  if (fromStoryboard) {
    demos.storyboard = { title: 'Every screen', scenes: storyboard.map((f) => ({ storyboard: f.title, seconds: 2.5, caption: f.title })) }
    names = ['storyboard']
  }

  const chosen = all ? Object.keys(demos) : names
  if (!chosen.length) {
    const entries = Object.entries(demos)
    if (!entries.length) {
      say('No demos yet. Write them in morgana.demos.json (see `morgana demo --help`), or record one of every storyboard screen:')
      say(dim('  morgana demo --from-storyboard'))
      return
    }
    say('Demos (morgana.demos.json):')
    for (const [name, d] of entries) {
      const scenes = (d.scenes ?? []).map((s) => resolveScene(s, storyboard))
      const seconds = scenes.filter((s) => !s.skip).reduce((t, s) => t + sceneSeconds(s), 0)
      say(`  ${name.padEnd(18)} ${String(scenes.length).padStart(2)} scenes  ${seconds.toFixed(1).padStart(5)} s  ${dim(d.title ?? '')}`)
    }
    say(dim('Record one with `morgana demo <name>`, or all with --all.'))
    return
  }

  const base = list ? null : await findApp(url)
  if (!list && !base) throw new Error('No running app to record: start `morgana dev`, or pass --url.')
  const outDir = path.resolve(root, out || path.join('dist', 'demos'))
  for (const name of chosen) {
    const d = demos[name]
    if (!d) throw new Error(`No demo "${name}" in morgana.demos.json. Demos: ${Object.keys(demos).join(', ') || 'none'}`)
    const skipped = numbers(skip)
    const kept = only ? numbers(only) : null
    const scenes = (d.scenes ?? []).map((s, i) => {
      const scene = resolveScene(s, storyboard)
      const n = i + 1
      return { ...scene, skip: scene.skip || skipped.has(n) || (kept ? !kept.has(n) : false) }
    })
    if (list) {
      say(`${name}${d.title ? ` · ${d.title}` : ''}`)
      scenes.forEach((s, i) => say(`  ${String(i + 1).padStart(2)}. ${(s.title ?? s.caption ?? s.path ?? 'scene').slice(0, 40).padEnd(40)} ${sceneSeconds(s).toFixed(1).padStart(4)} s${s.skip ? dim('  skipped') : ''}`))
      continue
    }
    const fmt = format || d.format || config.format || '9:16'
    if (!FORMATS[fmt]) throw new Error(`Formats: ${Object.keys(FORMATS).join(', ')} — not "${fmt}".`)
    const track = noAudio ? undefined : (audio || d.audio || config.audio)
    const file = path.join(outDir, `${name}-${fmt.replace(':', 'x')}.mp4`)
    say(`Recording ${name} · ${fmt} (${FORMATS[fmt].label})${track ? ` · audio ${track}` : ''}`)
    const r = await renderDemo({
      baseUrl: base, scenes, format: fmt, fps: config.fps ?? 30, audio: track ? path.resolve(root, track) : undefined,
      out: file, stills, log: (s) => say(dim(s)),
    })
    say(`  ${path.relative(process.cwd(), r.file)} · ${r.seconds.toFixed(1)} s · ${(r.bytes / 1024 / 1024).toFixed(1)} MB${r.mime.includes('webm') ? dim(' (WebM: this browser could not make MP4)') : ''}`)
    if (r.stills.length) say(dim(`  stills: ${r.stills.map((f) => path.basename(f)).join(', ')}`))
  }
}
