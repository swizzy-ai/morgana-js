/**
 * The storyboard — one photograph per screen of each page, for `morgana docs`.
 *
 * A page's screens are the values its address-bound states take in its
 * conditions (`view`: pick, brief, work, done), plus any frames the project
 * lists in morgana.docs.json. Each is opened, put in its state through the
 * runtime's console hook once the page has loaded (setPageState), and
 * photographed by the machine's Chrome, Edge or Chromium in headless mode.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { goto, launch, setPageState } from './cdp.mjs'
import { findBrowser } from './pdf.mjs'

/**
 * The frames to photograph: every value of every address-bound state, then
 * the project's own.
 * @param {ReturnType<import('./docs-model.mjs').collectDocs>} model
 * @param {{ title: string, page?: string, path?: string, state?: Record<string, unknown>, note?: string }[]} extra
 */
export function framesOf(model, extra = []) {
  const frames = []
  for (const page of model.pages) {
    // An address with a parameter (/tools/:slug) needs a real one: list those pages' frames with a `path`.
    if (page.address.includes(':')) continue
    const states = page.states.filter((s) => s.values.length)
    if (!states.length) frames.push({ page: page.name, address: page.address, title: titleCase(page.name), state: {} })
    for (const s of states) {
      const values = [s.initial, ...s.values.filter((v) => v !== s.initial)].filter((v) => v !== '' && v != null)
      for (const v of values) frames.push({ page: page.name, address: page.address, title: titleCase(String(v)), state: { [s.key]: v }, by: s.key })
    }
  }
  for (const f of extra) {
    const page = model.pages.find((p) => p.name === (f.page ?? model.pages[0]?.name))
    if (!page || !f.title) continue
    frames.push({ page: page.name, address: f.path ?? page.address, title: f.title, state: f.state ?? {}, note: f.note ?? '' })
  }
  return frames.map((f, i) => ({ ...f, id: `${String(i + 1).padStart(2, '0')}-${slug(f.page)}-${slug(f.title)}` }))
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screen'
const titleCase = (s) => s.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase())

/**
 * Photograph each frame from a running app at `baseUrl` into `outDir`.
 * Frames that come out identical to an earlier one are marked `same`.
 * @returns {Promise<{ frames: any[], problem: string }>}
 */
export async function captureStoryboard(frames, baseUrl, outDir, { width = 1280, height = 820, log = () => {} } = {}) {
  if (!findBrowser()) return { frames, problem: 'No Chrome, Edge or Chromium on this machine to photograph the screens with (set MORGANA_BROWSER).' }
  if (!(await answers(baseUrl))) return { frames, problem: `Nothing answered at ${baseUrl}: start \`morgana dev\` (or pass --url) to photograph the screens.` }
  // A fresh set: photographs of screens that no longer exist don't linger.
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await launch()
  const seen = new Map()
  const out = []
  try {
    const tab = await browser.tab()
    await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    for (const f of frames) {
      try {
        await goto(tab, new URL(f.address || '/', baseUrl).href)
        await setPageState(tab, f.state)
        // Let what appears on load finish appearing.
        await new Promise((r) => setTimeout(r, 700))
        const shot = await tab.send('Page.captureScreenshot', { format: 'png' })
        const buf = Buffer.from(shot.data, 'base64')
        fs.writeFileSync(path.join(outDir, `${f.id}.png`), buf)
        const hash = crypto.createHash('sha1').update(buf).digest('hex')
        const same = seen.get(hash)
        if (!same) seen.set(hash, f.id)
        out.push({ ...f, image: `${f.id}.png`, same: same ?? '' })
        log(`  ${f.title}`)
      } catch (e) {
        out.push({ ...f, image: '', problem: String(e?.message ?? e) })
        log(`  ${f.title}: not photographed (${String(e?.message ?? e)})`)
      }
    }
    await tab.close()
  } finally {
    await browser.close()
  }
  return { frames: out, problem: '' }
}

async function answers(baseUrl) {
  try {
    const r = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) })
    return r.status < 500
  } catch { return false }
}
