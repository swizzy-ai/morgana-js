/**
 * three-scene — a custom object that owns a WebGL context.
 *
 * The one case in this demo that genuinely needs the browser lane. Three.js has
 * no declarative form here, so the component needs an element, an animation
 * loop, and — critically — somewhere to release both when the object leaves the
 * page. A WebGL context that is never released is not a slow leak; the browser
 * starts refusing new ones and the tab degrades.
 *
 * That is what `onCleanup` is for. It is not optional politeness here, it is the
 * difference between a demo that works and one that works until you reload five
 * times.
 *
 * `onPrepare` preloads the library. It is async, so the page waits for it rather
 * than mounting into a canvas that has no renderer yet.
 *
 * The interior is a plain `box` — the canvas is created imperatively inside it,
 * because a `<canvas>` is not one of the kinds we ship. Everything the object
 * *does* with the scene goes through the handle, so a browser action can drive it
 * by name like any other object.
 */
import { createCustomObject } from '@morgana/sdk'

/** The library is loaded once per page, no matter how many scenes exist. */
const THREE_CDN = 'https://unpkg.com/three@0.160.0/build/three.module.js'

let loading: Promise<unknown> | null = null

function loadThree(): Promise<unknown> {
  if (loading) return loading
  loading = (async () => {
    const mod = await import(/* @vite-ignore */ THREE_CDN)
    return mod
  })()
  return loading
}

export default createCustomObject({
  name: 'three-scene',

  defaultProps: {
    geometry: 'box',
    color: '#3182ce',
    roughness: 0.4,
    metalness: 0.1,
    wireframe: false,
    autoRotate: true,
    speed: 1,
    height: 320,
    background: '#111827',
    fov: 55,
  },

  state: { frames: 0, ready: false },
  events: ['ready', 'frame', 'error'],

  define: (handle, ctx) => {
    // A plain container; the canvas is created imperatively inside it on mount,
    // because a `<canvas>` is not one of the kinds we ship.
    const stage = ctx.ui.box({
      id: 'stage',
      radius: 'lg',
      overflow: 'hidden',
      bg: String(ctx.props['background'] ?? '#111827'),
    })
    handle.place(stage)
  },

  onPrepare: async () => {
    // Preload once. A failure here is reported and the object is not mounted,
    // rather than mounting into a dead canvas.
    await loadThree()
  },

  onMount: (el, ctx) => {
    const scene = { instance: null as unknown, mesh: null as unknown, renderer: null as unknown }
    let raf = 0
    let disposed = false

    const width = () => el.clientWidth || 640
    const height = () => el.clientHeight || Number(ctx.props['height'] ?? 320)

    el.style.height = `${height()}px`

    const start = (): void => {
      const three = (globalThis as unknown as { THREE?: Record<string, any> }).THREE
      if (!three) {
        ctx.emit('error', { reason: 'three.js not available' })
        return
      }

      const container = document.createElement('div')
      container.style.cssText = 'width:100%;height:100%'
      el.appendChild(container)

      const s = new three['Scene']()
      const camera = new three['PerspectiveCamera'](Number(ctx.props['fov'] ?? 55), width() / height(), 0.1, 100)
      camera.position.set(2.4, 2, 3.2)
      camera.lookAt(0, 0, 0)

      const renderer = new three['WebGLRenderer']({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2))
      renderer.setSize(width(), height())
      container.appendChild(renderer.domElement)

      const geometryName = String(ctx.props['geometry'] ?? 'box')
      const geometry = new three[geometryName[0]!.toUpperCase() + geometryName.slice(1)](1, 1, 1)
      const material = new three['MeshStandardMaterial']({
        color: String(ctx.props['color'] ?? '#3182ce'),
        roughness: Number(ctx.props['roughness'] ?? 0.4),
        metalness: Number(ctx.props['metalness'] ?? 0.1),
        wireframe: ctx.props['wireframe'] === true,
      })
      const mesh = new three['Mesh'](geometry, material)
      s.add(mesh)

      scene.instance = s
      scene.mesh = mesh
      scene.renderer = renderer

      const tick = (): void => {
        if (disposed) return
        mesh.rotation.y += 0.005 * Number(ctx.props['speed'] ?? 1)
        if (ctx.props['autoRotate'] === true) mesh.rotation.x += 0.002
        renderer.render(s, camera)
        ctx.state.set('frames', Number(ctx.state.get('frames') ?? 0) + 1)
        raf = requestAnimationFrame(tick)
      }

      // Everything started here is registered for teardown. Without this the
      // loop keeps running and the context is never released.
      ctx.onCleanup(() => {
        disposed = true
        cancelAnimationFrame(raf)
        renderer.dispose()
        geometry.dispose()
        material.dispose()
        container.remove()
      })

      ctx.state.set('ready', true)
      ctx.emit('ready', { geometry: geometryName })
      tick()
    }

    // The library is already resolved by onPrepare, so this is synchronous —
    // but keep the async path so a cold load is not a crash.
    Promise.resolve().then(start)
  },

  onUpdate: (nextProps, ctx) => {
    const el = ctx.element
    const three = (globalThis as unknown as { THREE?: Record<string, any> }).THREE
    if (!three) return
    el.style.height = `${nextProps['height'] ?? 320}px`
    const materials = (ctx.handle['__three_material'] ?? null) as Record<string, any> | null
    if (materials) {
      materials['color'] = String(nextProps['color'] ?? '#3182ce')
      materials['roughness'] = Number(nextProps['roughness'] ?? 0.4)
      materials['metalness'] = Number(nextProps['metalness'] ?? 0.1)
      materials['wireframe'] = nextProps['wireframe'] === true
    }
  },

  onDestroy: (ctx) => {
    // onCleanup already released the GPU resources; this fires for the
    // component's own bookkeeping.
    ctx.state.set('ready', false)
  },

  methods: {
    /** Drive the scene from a browser action: ctx.ui.get('hero3d').spin(0.5) */
    spin(handle: any, delta: number): void {
      const three = (globalThis as unknown as { THREE?: Record<string, any> }).THREE
      void three
      handle['__spin'] = (handle['__spin'] ?? 0) + delta
    },
    /** Current frame count — a live value without touching the DOM. */
    frames(handle: any): number {
      return Number(handle.state.get('frames') ?? 0)
    },
    isReady(handle: any): boolean {
      return handle.state.get('ready') === true
    },
  },
})
