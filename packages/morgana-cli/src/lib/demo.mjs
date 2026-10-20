/**
 * Demo videos of the running app — `morgana demo`.
 *
 * A demo is a list of scenes. Each scene opens a page (an address, or a
 * screen of the storyboard, by its state), can click, type and scroll the way
 * a person would, can put a caption on screen, and lasts so many seconds.
 *
 *   record: Chrome opens the app at the format's size (1080×1920 for 9:16,
 *           phone layout), plays the scenes in real time and keeps a frame
 *           for every tick;
 *   encode: a second tab plays those frames onto a canvas at the same pace,
 *           mixes in the audio if there is any, and records an MP4 (H.264,
 *           AAC) with the browser's own encoder.
 *
 * Nothing to install: the machine's Chrome, Edge or Chromium does it all.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { evaluate, goto, launch, setPageState } from './cdp.mjs'

/** The formats social video wants: pixels, and the CSS size the page is laid out at. */
export const FORMATS = {
  '9:16': { width: 1080, height: 1920, css: [360, 640], scale: 3, mobile: true, label: 'Reels, TikTok, Shorts' },
  '4:5': { width: 1080, height: 1350, css: [432, 540], scale: 2.5, mobile: true, label: 'Instagram feed' },
  '1:1': { width: 1080, height: 1080, css: [540, 540], scale: 2, mobile: true, label: 'square' },
  '16:9': { width: 1920, height: 1080, css: [1280, 720], scale: 1.5, mobile: false, label: 'YouTube, the web' },
}

/**
 * @typedef {{ click?: string, key?: string, type?: [string, string], wait?: number, scroll?: number }} Step
 * @typedef {{ title?: string, path?: string, state?: Record<string, unknown>, storyboard?: string,
 *   seconds?: number, caption?: string, do?: Step[], skip?: boolean }} Scene
 */

/** A scene that names a storyboard screen takes that screen's address and state. */
export function resolveScene(scene, storyboard = []) {
  if (!scene.storyboard) return scene
  const f = storyboard.find((x) => x.title.toLowerCase() === String(scene.storyboard).toLowerCase())
  if (!f) throw new Error(`No storyboard screen called "${scene.storyboard}". Screens: ${storyboard.map((x) => x.title).join(', ')}`)
  return { title: f.title, ...scene, path: scene.path ?? f.address, state: { ...f.state, ...(scene.state ?? {}) } }
}

/** How long a scene runs: its seconds, or long enough for its steps and a beat after. */
export const sceneSeconds = (s) => Math.max(Number(s.seconds) || 3, stepsSeconds(s.do ?? []) + 1)
const stepsSeconds = (steps) => steps.reduce((t, st) => t + (st.wait ?? 0) + (st.type ? 0.4 + st.type[1].length * 0.045 : 0) + (st.click || st.key ? 0.7 : 0) + (st.scroll ? 0.8 : 0), 0)

/**
 * Record and encode one demo.
 * `stills` also writes each scene's last frame beside the video (`<name>-scene-1.jpg`…), to check
 * a demo at a glance before posting it.
 * @param {{ baseUrl: string, scenes: Scene[], format?: string, fps?: number, audio?: string, out: string, stills?: boolean, log?: (s: string) => void }} opts
 * @returns {Promise<{ file: string, poster: string, stills: string[], seconds: number, bytes: number, mime: string }>}
 */
export async function renderDemo({ baseUrl, scenes, format = '9:16', fps = 30, audio, out, stills = false, log = () => {} }) {
  const f = FORMATS[format]
  if (!f) throw new Error(`Formats: ${Object.keys(FORMATS).join(', ')} — not "${format}".`)
  const playing = scenes.filter((s) => !s.skip)
  if (!playing.length) throw new Error('Every scene is skipped: nothing to record.')
  if (audio && !fs.existsSync(audio)) throw new Error(`No audio file at ${audio}`)
  // The browser's own screen at the format's density: the screencast then sends full-size frames.
  const browser = await launch({ flags: [`--force-device-scale-factor=${f.scale}`, `--window-size=${f.css[0]},${f.css[1]}`] })
  try {
    const { frames, ends } = await record(browser, { baseUrl, scenes: playing, f, fps, log })
    log(`Encoding ${frames.length} frames (${(frames.length / fps).toFixed(1)} s)`)
    const { bytes, mime } = await encode(browser, { frames, f, fps, audio, out })
    const poster = out.replace(/\.[a-z0-9]+$/i, '') + '.jpg'
    fs.writeFileSync(poster, frames[Math.min(frames.length - 1, Math.round(fps * 0.6))])
    const shots = stills ? ends.map((end, i) => {
      const file = out.replace(/\.[a-z0-9]+$/i, '') + `-scene-${i + 1}.jpg`
      fs.writeFileSync(file, frames[end - 1])
      return file
    }) : []
    return { file: out, poster, stills: shots, seconds: frames.length / fps, bytes, mime }
  } finally {
    await browser.close()
  }
}

// ── record ──────────────────────────────────────────────────────────────────

async function record(browser, { baseUrl, scenes, f, fps, log }) {
  const tab = await browser.tab()
  await tab.send('Emulation.setDeviceMetricsOverride', { width: f.css[0], height: f.css[1], deviceScaleFactor: 0, mobile: f.mobile })
  let latest = null
  let fresh = false
  tab.on('Page.screencastFrame', (p) => {
    latest = Buffer.from(p.data, 'base64')
    fresh = true
    tab.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {})
  })
  await tab.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: f.width, maxHeight: f.height, everyNthFrame: 1 })

  const frames = []
  /** Where each scene ends, in frames. */
  const ends = []
  for (const [i, scene] of scenes.entries()) {
    const url = new URL(scene.path || '/', baseUrl)
    fresh = false
    await goto(tab, url.href)
    await setPageState(tab, scene.state)
    fresh = false
    await evaluate(tab, OVERLAY)
    if (scene.caption) await evaluate(tab, `window.__mgCaption(${JSON.stringify(scene.caption)})`)
    // The first frame of this page, not the last of the one before.
    for (let t = 0; t < 40 && !fresh; t++) await sleep(50)
    if (!latest) throw new Error(`Nothing was painted at ${url.href}`)
    const seconds = sceneSeconds(scene)
    log(`  ${i + 1}. ${scene.title ?? scene.path ?? 'scene'} (${seconds.toFixed(1)} s)`)
    const count = Math.round(seconds * fps)
    const start = Date.now()
    const steps = play(tab, scene.do ?? [])
    for (let n = 0; n < count; n++) {
      const due = start + (n * 1000) / fps
      const wait = due - Date.now()
      if (wait > 0) await sleep(wait)
      frames.push(latest)
    }
    await steps
    ends.push(frames.length)
  }
  await tab.send('Page.stopScreencast').catch(() => {})
  await tab.close()
  return { frames, ends }
}

/** A scene's steps, the way a person does them: a visible tap, typing at a typing pace. */
async function play(tab, steps) {
  await sleep(350)
  for (const st of steps) {
    if (st.wait) await sleep(st.wait * 1000)
    if (st.click) {
      const at = await evaluate(tab, `window.__mgFind(${JSON.stringify(st.click)}, ${JSON.stringify(st.key ?? null)})`)
      if (!at) throw new Error(`No "${st.click}"${st.key ? ` row "${st.key}"` : ''} on the page to click`)
      await evaluate(tab, `window.__mgTap(${at.x}, ${at.y})`)
      await sleep(180)
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await tab.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 })
      }
      await sleep(500)
    } else if (st.key && !st.click) {
      await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key: st.key })
      await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: st.key })
      await sleep(500)
    }
    if (st.type) {
      const [id, text] = st.type
      const ok = await evaluate(tab, `window.__mgFocus(${JSON.stringify(id)})`)
      if (!ok) throw new Error(`No "${id}" on the page to type into`)
      await sleep(300)
      for (const ch of text) {
        await tab.send('Input.insertText', { text: ch })
        await sleep(40)
      }
    }
    if (st.scroll) {
      await evaluate(tab, `window.__mgScroll(${Number(st.scroll)}, 700)`)
      await sleep(150)
    }
  }
}

/** What a recording page gets: a caption, a tap ripple, and ways to find things by their ids. */
const OVERLAY = `(() => {
  if (window.__mgFind) return true
  const css = document.createElement('style')
  css.textContent = '.mg-cap{position:fixed;left:6%;right:6%;bottom:9%;z-index:2147483646;text-align:center;pointer-events:none;animation:mg-in .45s cubic-bezier(.2,.8,.2,1) both}' +
    '.mg-cap span{display:inline-block;padding:10px 16px;border-radius:14px;background:#0c0c0e;border:1px solid rgba(255,255,255,.14);color:#fff;font:700 19px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.5)}' +
    '.mg-tap{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.55);border:2px solid #fff;z-index:2147483647;pointer-events:none;animation:mg-tap .6s ease-out forwards}' +
    '@keyframes mg-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
    '@keyframes mg-tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.6);opacity:0}}'
  document.head.appendChild(css)
  window.__mgCaption = (text) => {
    document.querySelectorAll('.mg-cap').forEach((e) => e.remove())
    const d = document.createElement('div'); d.className = 'mg-cap'
    const s = document.createElement('span'); s.textContent = text; d.appendChild(s)
    document.body.appendChild(d)
  }
  const pick = (id, key) => {
    const q = (s) => Array.from(document.querySelectorAll(s)).find((e) => e.getBoundingClientRect().width > 0)
    if (key != null) return q('[data-tpl="' + id + '"][data-row-key="' + key + '"]')
    return q('[data-entity="' + id + '"]') || q('[data-tpl="' + id + '"]')
  }
  window.__mgFind = (id, key) => {
    const el = pick(id, key); if (!el) return null
    el.scrollIntoView({ block: 'nearest' })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }
  window.__mgFocus = (id) => {
    const el = pick(id, null); if (!el) return false
    const field = el.matches('input,textarea,[contenteditable]') ? el : el.querySelector('input,textarea,[contenteditable]')
    ;(field || el).focus(); return true
  }
  // An eased scroll of whatever scrolls (the page, or the biggest scrolling box), frame by frame:
  // smooth scrolling doesn't run in a headless browser.
  window.__mgScroll = (by, ms) => new Promise((done) => {
    const fits = (e) => e && e.scrollHeight > e.clientHeight + 4
    let el = document.scrollingElement
    if (!fits(el)) el = Array.from(document.querySelectorAll('*')).filter((e) => fits(e) && /(auto|scroll)/.test(getComputedStyle(e).overflowY)).sort((a, b) => b.clientHeight - a.clientHeight)[0] || el
    const from = el.scrollTop, start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      el.scrollTop = from + by * e
      t < 1 ? requestAnimationFrame(step) : done(true)
    }
    requestAnimationFrame(step)
  })
  window.__mgTap = (x, y) => {
    const t = document.createElement('div'); t.className = 'mg-tap'; t.style.left = x + 'px'; t.style.top = y + 'px'
    document.body.appendChild(t); setTimeout(() => t.remove(), 700)
  }
  return true
})()`

// ── encode ──────────────────────────────────────────────────────────────────

/**
 * Play the frames onto a canvas at the frame rate and record it, with the
 * audio mixed in. A local server hands the page the frames and takes the file.
 */
async function encode(browser, { frames, f, fps, audio, out }) {
  let resolveOut
  let rejectOut
  const result = new Promise((res, rej) => { resolveOut = res; rejectOut = rej })
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    if (u.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(ENCODER_PAGE)
    }
    if (u.pathname.startsWith('/frame/')) {
      const buf = frames[Number(u.pathname.slice(7))]
      if (!buf) { res.writeHead(404); return res.end() }
      res.writeHead(200, { 'content-type': 'image/jpeg' })
      return res.end(buf)
    }
    if (u.pathname === '/audio' && audio) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' })
      return fs.createReadStream(audio).pipe(res)
    }
    if (u.pathname === '/out' && req.method === 'POST') {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const buf = Buffer.concat(chunks)
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, buf)
        res.end('ok')
        resolveOut({ bytes: buf.length, mime: String(req.headers['content-type'] ?? '') })
      })
      return
    }
    if (u.pathname === '/fail' && req.method === 'POST') {
      let text = ''
      req.on('data', (c) => { text += c })
      req.on('end', () => { res.end('ok'); rejectOut(new Error(`encoding failed: ${text}`)) })
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const tab = await browser.tab()
  try {
    await tab.send('Page.bringToFront')
    const q = new URLSearchParams({ n: String(frames.length), fps: String(fps), w: String(f.width), h: String(f.height), audio: audio ? '1' : '0' })
    await goto(tab, `http://127.0.0.1:${port}/?${q}`)
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('encoding took far longer than the video')), (frames.length / fps) * 1000 * 3 + 60000))
    return await Promise.race([result, timeout])
  } finally {
    await tab.close()
    server.close()
  }
}

const ENCODER_PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<script>
(async () => {
  const q = new URLSearchParams(location.search)
  const n = +q.get('n'), fps = +q.get('fps'), w = +q.get('w'), h = +q.get('h'), withAudio = q.get('audio') === '1'
  const fail = (e) => fetch('/fail', { method: 'POST', body: String(e && e.stack || e) })
  try {
    // Not placed in the page: headless Chrome records a placed canvas as black.
    const c = document.createElement('canvas'); c.width = w; c.height = h
    // A canvas kept in memory, not on the GPU: headless Chrome records a GPU canvas as black.
    const g = c.getContext('2d', { willReadFrequently: true })
    const stream = c.captureStream(fps)
    const seconds = n / fps
    let ctx = null, src = null
    if (withAudio) {
      ctx = new AudioContext()
      const data = await (await fetch('/audio')).arrayBuffer()
      const buf = await ctx.decodeAudioData(data)
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = buf.duration < seconds
      const gain = ctx.createGain()
      const dest = ctx.createMediaStreamDestination()
      src.connect(gain).connect(dest)
      const t = ctx.currentTime
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(1, t + 0.3)
      gain.gain.setValueAtTime(1, t + Math.max(0.3, seconds - 1.2))
      gain.gain.linearRampToValueAtTime(0, t + seconds)
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr))
    }
    // H.264 High, level 5.0: Chrome's encoder refuses 1080×1920 at the usual 4.0.
    const types = withAudio ? ['video/mp4;codecs=avc1.640032,mp4a.40.2', 'video/webm;codecs=vp9,opus'] : ['video/mp4;codecs=avc1.640032', 'video/webm;codecs=vp9']
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10000000, audioBitsPerSecond: 160000 })
    const chunks = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise((r) => { rec.onstop = r })
    // Frames load ahead of time; each is drawn on its tick.
    const ahead = new Map()
    const load = (i) => { if (i < n && !ahead.has(i)) ahead.set(i, fetch('/frame/' + i).then((r) => r.blob()).then((b) => createImageBitmap(b))) }
    for (let i = 0; i < 45; i++) load(i)
    const first = await ahead.get(0)
    g.drawImage(first, 0, 0, w, h)
    rec.start()
    if (src) src.start()
    const t0 = performance.now()
    const fade = 0.35 * fps
    for (let i = 0; i < n; i++) {
      load(i + 45)
      const img = await ahead.get(i); ahead.delete(i)
      const wait = t0 + (i * 1000) / fps - performance.now()
      if (wait > 1) await new Promise((r) => setTimeout(r, wait))
      g.drawImage(img, 0, 0, w, h); img.close()
      const edge = Math.min(i, n - 1 - i)
      if (edge < fade) { g.fillStyle = 'rgba(0,0,0,' + (1 - edge / fade).toFixed(3) + ')'; g.fillRect(0, 0, w, h) }
    }
    await new Promise((r) => setTimeout(r, 1000 / fps + 120))
    rec.stop()
    await done
    if (src) src.stop()
    const blob = new Blob(chunks, { type: mimeType })
    await fetch('/out', { method: 'POST', headers: { 'content-type': mimeType }, body: blob })
  } catch (e) { fail(e) }
})()
</script>`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
