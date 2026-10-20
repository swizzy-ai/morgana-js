// @ts-nocheck — browser runtime over three.js, loaded at run time from a CDN.
/**
 * The graphics runtime. Every graphics object is a Morgana custom object;
 * this is what they share in the browser.
 *
 *   canvas   owns the renderer, the scene, the clock and the performance meter
 *   others   register with their nearest canvas when they mount, and send
 *            their prop changes there (onUpdate)
 *
 * What an object is drawn as comes from its kind, in a registry: graphics
 * brings group, shape, text, model and light (kinds.ts); other packages add
 * their own with defineKind (the game package: player, wall, grass).
 *
 * Props every object takes: x, y, z, turn (degrees), scale, opacity, colour,
 * and keys: [[seconds, { prop: value, … }], …] on the canvas's clock.
 */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js'
let threeP = null
/** three.js, loaded once. (Through Function so the page bundler leaves the URL alone.) */
export const loadThree = () => (threeP ??= new Function('u', 'return import(u)')(THREE_URL))

/**
 * A kind: how an object of it is built, and optionally what it does every
 * frame (once per kind, given all its objects) and whether it moves itself
 * (then keys and x/y/z don't place it).
 */
export interface Kind {
  build(stage: any, props: Record<string, any>): any
  frame?(stage: any, items: any[], dt: number): void
  movesItself?: boolean
  /** Props whose change rebuilds the object instead of updating it. */
  rebuildOn?: string[]
}
const KINDS = new Map<string, Kind>()
export const defineKind = (name: string, kind: Kind) => void KINDS.set(name, kind)

const CANVAS = '[data-object="gv-canvas"]'
const ratioOf = (size) => {
  const [w, h] = String(size || '16:9').split(':').map(Number)
  return w > 0 && h > 0 ? w / h : 16 / 9
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const KEYED = ['x', 'y', 'z', 'turn', 'scale', 'opacity']

/** A prop's value at time t from its keys, or its own value. */
export function keyed(props, name, t) {
  const keys = (props.keys || []).filter((k) => k[1] && name in k[1])
  if (!keys.length) return props[name]
  if (t <= keys[0][0]) return keys[0][1][name]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]
    const [t0, v0] = keys[i - 1]
    if (t <= t1) return v0[name] + (v1[name] - v0[name]) * ease((t - t0) / (t1 - t0 || 1))
  }
  return keys[keys.length - 1][1][name]
}

export class Stage {
  constructor(el, props, T) {
    this.el = el
    this.T = T
    this.props = props
    this.items = new Map()
    this.waiting = new Map()
    this.keys = new Set()
    this.mode = props.mode === '2d' ? '2d' : '3d'
    this.ratio = ratioOf(props.size)

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100%;height:auto;border-radius:18px;outline:none'
    canvas.tabIndex = 0
    el.style.position = 'relative'
    el.appendChild(canvas)
    this.canvas = canvas

    const r = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    r.shadowMap.enabled = true
    r.shadowMap.type = T.PCFSoftShadowMap
    this.renderer = r
    this.scene = new T.Scene()
    this.scene.background = new T.Color(props.background || (this.mode === '2d' ? '#0A0A0B' : '#a7cbe8'))
    if (this.mode === '3d') this.scene.fog = new T.Fog(this.scene.background, 40, 110)
    if (this.mode === '2d') this.camera = new T.OrthographicCamera(-this.ratio, this.ratio, 1, -1, -10, 10)
    else {
      this.camera = new T.PerspectiveCamera(props.lens || 50, this.ratio, 0.1, 500)
      const [cx, cy, cz] = props.camera || [12, 10, 16]
      this.camera.position.set(cx, cy, cz)
      this.camera.lookAt(0, 0, 0)
    }
    this.resize = () => r.setSize(el.clientWidth || 960, (el.clientWidth || 960) / this.ratio, false)
    this.resize()
    window.addEventListener('resize', this.resize)
    this.down = (e) => this.keys.add(e.key.toLowerCase())
    this.up = (e) => this.keys.delete(e.key.toLowerCase())
    window.addEventListener('keydown', this.down)
    window.addEventListener('keyup', this.up)

    // Performance: frames per second, frame time, objects and draw calls (props.stats: false hides it).
    this.meter = document.createElement('div')
    this.meter.style.cssText = 'position:absolute;top:10px;left:10px;padding:4px 8px;border-radius:8px;background:rgba(0,0,0,.55);color:#CCFF33;font:600 12px ui-monospace,monospace;pointer-events:none'
    if (props.stats !== false) el.appendChild(this.meter)
    this.stats = { fps: 0, ms: 0, frames: 0, since: performance.now(), work: 0 }

    this.last = performance.now()
    this.playing = props.plays !== false
    this.t = 0
    const tick = (now) => {
      this.frame = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      if (this.playing) this.t += dt
      const length = Number(this.props.length) || 0
      const t = length ? (this.props.loop === false ? Math.min(this.t, length) : this.t % length) : this.t
      const began = performance.now()
      this.step(t, dt)
      r.render(this.scene, this.camera)
      const s = this.stats
      s.frames++
      s.work += performance.now() - began
      if (now - s.since >= 500) {
        s.fps = Math.round((s.frames * 1000) / (now - s.since))
        s.ms = +(s.work / s.frames).toFixed(1)
        s.frames = 0
        s.work = 0
        s.since = now
        this.meter.textContent = `${s.fps} fps · ${s.ms} ms/frame · ${this.items.size} objects · ${r.info.render.calls} draws`
      }
    }
    this.frame = requestAnimationFrame(tick)
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.down)
    window.removeEventListener('keyup', this.up)
    this.renderer.dispose()
  }

  play() { this.playing = true }
  pause() { this.playing = false }
  seek(s) { this.t = Number(s) || 0 }

  build(kind, props) {
    const k = KINDS.get(kind)
    if (!k) throw new Error(`graphics: no kind "${kind}" (is its package listed in libraries?)`)
    return k.build(this, props)
  }

  add(kind, id, props, parentId, emit) {
    const node = this.build(kind, props)
    const item = { kind, id, props, node, emit, parentId }
    this.items.set(id, item)
    const parent = parentId && this.items.get(parentId)
    if (parentId && !parent) {
      this.waiting.set(parentId, [...(this.waiting.get(parentId) || []), id])
      this.scene.add(node)
    } else (parent ? parent.node : this.scene).add(node)
    for (const childId of this.waiting.get(id) || []) {
      const child = this.items.get(childId)
      if (child) node.add(child.node)
    }
    this.waiting.delete(id)
    this.apply(item, this.t)
  }

  update(id, props) {
    const item = this.items.get(id)
    if (!item) return
    const rebuildOn = KINDS.get(item.kind)?.rebuildOn ?? ['shape', 'size', 'content', 'font', 'w', 'h']
    const rebuild = rebuildOn.some((k) => k in props && props[k] !== item.props[k])
    item.props = { ...item.props, ...props }
    if (rebuild) {
      const parent = item.node.parent
      parent.remove(item.node)
      item.node = this.build(item.kind, item.props)
      parent.add(item.node)
    }
    const mat = item.node.material
    if (mat?.color && item.props.colour && item.kind !== 'text') mat.color.set(item.props.colour)
  }

  remove(id) {
    const item = this.items.get(id)
    if (item?.node?.parent) item.node.parent.remove(item.node)
    this.items.delete(id)
  }

  /** Every object of a kind. */
  all(kind) {
    return [...this.items.values()].filter((i) => i.kind === kind)
  }

  apply(item, t) {
    const n = item.node
    const p = item.props
    const v = Object.fromEntries(KEYED.map((k) => [k, keyed(p, k, t)]))
    if (!KINDS.get(item.kind)?.movesItself) {
      if (v.x !== undefined) n.position.x = v.x
      if (v.y !== undefined) n.position.y = v.y
      if (v.z !== undefined) n.position.z = v.z
    }
    if (v.turn !== undefined) this.mode === '2d' ? (n.rotation.z = (v.turn * Math.PI) / 180) : (n.rotation.y = (v.turn * Math.PI) / 180)
    if (v.scale !== undefined) n.scale.setScalar(v.scale)
    if (v.opacity !== undefined && n.material) n.material.opacity = v.opacity
  }

  /** Every frame: keys for every object, then each kind's own frame work. */
  step(t, dt) {
    for (const item of this.items.values()) this.apply(item, t)
    for (const [name, kind] of KINDS) {
      if (!kind.frame) continue
      const items = this.all(name)
      if (items.length) kind.frame(this, items, dt)
    }
  }
}

// ── what each object file calls ──────────────────────────────────────────────

/** The canvas: make the stage once three.js has loaded. */
export function mountCanvas(el, ctx) {
  el.__gvReady = loadThree().then((T) => {
    const stage = new Stage(el, ctx.props, T)
    el.__gv = stage
    ctx.onCleanup(() => stage.destroy())
    return stage
  })
}

/**
 * Any other object: register with the nearest canvas, inside its nearest
 * object parent. Object files must write the hooks out (`onMount: (el, ctx) =>
 * part.onMount(el, ctx)`): Morgana looks for them in the file's text.
 */
export function mountPart(kind) {
  return {
    onMount(el, ctx) {
      el.style.display = 'none'
      const canvasEl = el.closest(CANVAS)
      if (!canvasEl) return
      const parentEl = el.parentElement?.closest('[data-object^="gv-"]')
      const parentId = parentEl && parentEl !== canvasEl ? parentEl.getAttribute('data-entity') : null
      const wait = () => (canvasEl.__gvReady ? canvasEl.__gvReady : new Promise((r) => requestAnimationFrame(() => r(wait()))))
      wait().then((stage) => {
        stage.add(kind, ctx.id, ctx.props, parentId, ctx.emit)
        ctx.onCleanup(() => stage.remove(ctx.id))
      })
      el.__gvCanvas = canvasEl
    },
    onUpdate(next, ctx) {
      ctx.el.__gvCanvas?.__gvReady?.then((stage) => stage.update(ctx.id, next))
    },
  }
}

/** The canvas's clock, on its handle: play, pause, seek. */
export const clockMethods = {
  play: (handle) => handle.getElement?.()?.__gv?.play(),
  pause: (handle) => handle.getElement?.()?.__gv?.pause(),
  seek: (handle, s) => handle.getElement?.()?.__gv?.seek(s),
}

/** Mount every graphics object on the page, canvases first (call from a `loaded` action). */
export function mountGraphics(ui) {
  const found = [...document.querySelectorAll('[data-object^="gv-"]')]
  const canvases = found.filter((e) => e.getAttribute('data-object') === 'gv-canvas')
  for (const el of [...canvases, ...found.filter((e) => !canvases.includes(e))]) ui.get(el.getAttribute('data-entity'))
}
