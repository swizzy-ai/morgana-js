/**
 * The world in a browser: WebGL2, one full-screen triangle, the scene's
 * uniforms, and the camera computed from the time. Self-contained on
 * purpose (no outside references), so the single-file export can carry its
 * source as it is.
 */
import type { Scene } from './compile'

export interface WorldView {
  /** Draw the frame at time `t` (seconds). The same t always draws the same frame. */
  render(t: number): void
  /** Play in real time from `from` seconds; returns stop. */
  play(from?: number): () => void
  /** Render resolution as a share of the canvas size (0.25–1). */
  scale(s: number): void
}

export function mountWorld(canvas: HTMLCanvasElement, scene: Scene, shaders: { vertex: string; fragment: string }, opts: { scale?: number } = {}): WorldView {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null
  if (!gl) throw new Error('This browser has no WebGL2.')
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`Shader: ${gl.getShaderInfoLog(sh)}`)
    return sh
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, shaders.vertex))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, shaders.fragment))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Link: ${gl.getProgramInfoLog(prog)}`)
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const at = (name: string) => gl.getUniformLocation(prog, name)
  for (const [name, type, value] of scene.uniforms) {
    const l = at(name)
    if (!l) continue
    const a = Array.isArray(value) ? value : [value]
    if (type === '1f') gl.uniform1f(l, a[0]!)
    else if (type === '2f') gl.uniform2f(l, a[0]!, a[1]!)
    else if (type === '3f') gl.uniform3f(l, a[0]!, a[1]!, a[2]!)
    else if (type === '1i') gl.uniform1i(l, a[0]!)
    else if (type === '3fv') gl.uniform3fv(l, new Float32Array(a))
    else if (type === '4fv') gl.uniform4fv(l, new Float32Array(a))
  }
  const uRes = at('uRes'), uTime = at('uTime'), uRo = at('uRo'), uTa = at('uTa'), uFov = at('uFov')
  let share = opts.scale ?? 1

  // The camera at time t: the same t, the same place.
  const cam = scene.camera
  const cameraAt = (t: number) => {
    const h = (cam.heading * Math.PI) / 180
    const fwd = [Math.sin(h), 0, Math.cos(h)]
    const right = [Math.cos(h), 0, -Math.sin(h)]
    let ro = [cam.start[0], cam.start[1], cam.start[2]]
    let dir = [fwd[0]!, Math.tan((cam.tilt * Math.PI) / 180), fwd[2]!]
    const sp = cam.speed
    if (cam.move === 'skims' || cam.move === 'pushes') ro = [ro[0]! + fwd[0]! * sp * t, ro[1]!, ro[2]! + fwd[2]! * sp * t]
    else if (cam.move === 'drifts') ro = [ro[0]! + (fwd[0]! * 0.6 + right[0]! * 0.8) * sp * t, ro[1]!, ro[2]! + (fwd[2]! * 0.6 + right[2]! * 0.8) * sp * t]
    else if (cam.move === 'rises') { ro = [ro[0]! + fwd[0]! * sp * 0.4 * t, ro[1]! + sp * 0.6 * t, ro[2]! + fwd[2]! * sp * 0.4 * t]; dir[1] = dir[1]! - Math.min(0.25, t * sp * 0.0008) }
    else if (cam.move === 'orbits') {
      const c = cam.centre
      const r = Math.max(400, Math.hypot(c[0], c[2]) * 1.15)
      const a0 = Math.atan2(-c[0], -c[2])
      const a = a0 + (sp * t) / r
      ro = [c[0] + Math.sin(a) * r, ro[1]! + 30, c[2] + Math.cos(a) * r]
      dir = [c[0] - ro[0]!, -ro[1]! * 0.4 + 40, c[2] - ro[2]!]
    }
    ro[1] = ro[1]! + Math.sin(t * 1.27) * cam.sway * 0.5 + Math.sin(t * 0.71 + 1.3) * cam.sway * 0.3
    if (cam.handheld) { dir[0] = dir[0]! + Math.sin(t * 7.1) * 0.004; dir[1] = dir[1]! + Math.sin(t * 5.3 + 2) * 0.004 }
    const len = Math.hypot(dir[0]!, dir[1]!, dir[2]!)
    return { ro, ta: [ro[0]! + (dir[0]! / len) * 100, ro[1]! + (dir[1]! / len) * 100, ro[2]! + (dir[2]! / len) * 100] }
  }

  const render = (t: number) => {
    const w = Math.max(1, Math.round(canvas.clientWidth * share * (globalThis.devicePixelRatio || 1))) || scene.width
    const h = Math.max(1, Math.round(canvas.clientHeight * share * (globalThis.devicePixelRatio || 1))) || scene.height
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    gl.viewport(0, 0, w, h)
    const { ro, ta } = cameraAt(t)
    gl.uniform2f(uRes, w, h)
    gl.uniform1f(uTime, t)
    gl.uniform3f(uRo, ro[0]!, ro[1]!, ro[2]!)
    gl.uniform3f(uTa, ta[0]!, ta[1]!, ta[2]!)
    gl.uniform1f(uFov, cam.lens)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  return {
    render,
    scale: (s: number) => { share = Math.min(1, Math.max(0.25, s)) },
    play: (from = 0) => {
      let id = 0
      const t0 = performance.now() - from * 1000
      const loop = () => { render((performance.now() - t0) / 1000); id = requestAnimationFrame(loop) }
      id = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(id)
    },
  }
}
