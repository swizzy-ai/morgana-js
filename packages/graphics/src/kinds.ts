// @ts-nocheck — three.js objects, built in the browser.
/** The base graphics kinds: group, shape, text, model, light. */
import { defineKind } from './runtime'

/** A solid three.js mesh: box, sphere, plane, cylinder or capsule. Shared with other packages (walls, players). */
export function solid(stage, p, shape = p.shape || 'box', fallbackColour = '#cccccc') {
  const T = stage.T
  const [sx, sy, sz] = Array.isArray(p.size) ? p.size : [Number(p.size ?? 1), Number(p.size ?? 1), Number(p.size ?? 1)]
  const geo = shape === 'sphere' ? new T.SphereGeometry(sx / 2, 32, 16)
    : shape === 'plane' ? new T.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2)
    : shape === 'capsule' ? new T.CapsuleGeometry(0.4, 0.9, 8, 16).translate(0, 0.85, 0)
    : shape === 'cylinder' ? new T.CylinderGeometry(sx / 2, sx / 2, sy, 32)
    : new T.BoxGeometry(sx, sy, sz).translate(0, sy / 2, 0)
  const mat = stage.mode === '2d' ? new T.MeshBasicMaterial({ color: p.colour || fallbackColour, transparent: true })
    : new T.MeshStandardMaterial({ color: p.colour || fallbackColour, roughness: 0.85, transparent: true })
  const mesh = new T.Mesh(geo, mat)
  mesh.castShadow = shape !== 'plane'
  mesh.receiveShadow = true
  return mesh
}

defineKind('group', { build: (stage) => new stage.T.Group() })

defineKind('model', { build: (stage, p) => solid(stage, p) })

defineKind('shape', {
  build(stage, p) {
    const T = stage.T
    const s = Number(p.size ?? 0.5)
    const geo = p.shape === 'rect' ? new T.PlaneGeometry(Number(p.w ?? s), Number(p.h ?? s))
      : p.shape === 'ring' ? new T.RingGeometry(s * 0.82, s, 96)
      : new T.CircleGeometry(s, 96)
    return new T.Mesh(geo, new T.MeshBasicMaterial({ color: p.colour || '#ffffff', transparent: true }))
  },
})

defineKind('text', {
  build(stage, p) {
    const T = stage.T
    const c = document.createElement('canvas')
    const g = c.getContext('2d')
    const px = 160
    const font = `${p.weight || 800} ${px}px ${p.font === 'body' ? 'Barlow' : '"Barlow Condensed"'}, sans-serif`
    g.font = font
    const text = String(p.content ?? '')
    c.width = Math.ceil(g.measureText(text).width) + 40
    c.height = px * 1.3
    g.font = font
    g.fillStyle = '#ffffff'
    g.textBaseline = 'middle'
    g.fillText(text, 20, c.height / 2)
    const tex = new T.CanvasTexture(c)
    tex.colorSpace = T.SRGBColorSpace
    const h = Number(p.size ?? 0.2)
    return new T.Mesh(new T.PlaneGeometry(h * (c.width / c.height), h), new T.MeshBasicMaterial({ map: tex, transparent: true, color: p.colour || '#ffffff' }))
  },
})

defineKind('light', {
  build(stage, p) {
    const T = stage.T
    if (p.kind === 'ambient') return new T.HemisphereLight('#ffffff', '#4a6b3a', Number(p.strength ?? 0.8))
    const l = new T.DirectionalLight(p.colour || '#fff4e0', Number(p.strength ?? 2.2))
    const hgt = Number(p.height ?? 35) * (Math.PI / 180)
    l.position.set(Math.cos(hgt) * 30, Math.sin(hgt) * 30, 12)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    Object.assign(l.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 })
    return l
  },
})
