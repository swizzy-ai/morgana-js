// @ts-nocheck — three.js objects and the game loop, in the browser.
/**
 * The game kinds, added to the graphics runtime:
 *   wall    a fixed body
 *   player  moves with WASD or the arrows, is stopped by walls (and emits
 *           `hit` when it touches one), and the camera follows it
 *   grass   blades that sway in the wind and bend around players
 * Each frame the graphics stage runs every kind's `frame`, so the game loop
 * is these functions: the tick stays in the game lane, and only moments like
 * `hit` cross into Morgana as events.
 */
import { defineKind, solid } from '@studiomorgana/graphics'

defineKind('wall', { build: (stage, p) => solid(stage, p, 'box', '#c9b79c') })

defineKind('player', {
  movesItself: true,
  build: (stage, p) => solid(stage, { ...p, colour: p.colour || '#e8553f' }, 'capsule'),
  frame(stage, players, dt) {
    const T = stage.T
    const k = stage.keys
    for (const player of players) {
      const speed = Number(player.props.speed ?? 5)
      const dir = new T.Vector3(
        (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0), 0,
        (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0))
      const pos = player.node.position
      if (!player.started) {
        pos.set(Number(player.props.x ?? 0), 0, Number(player.props.z ?? 0))
        player.started = true
      }
      if (dir.lengthSq()) {
        dir.normalize()
        pos.addScaledVector(dir, speed * dt)
        player.node.rotation.y = Math.atan2(dir.x, dir.z)
      }
      // Walls: push the player (a circle) out of every box it overlaps.
      const r = 0.45
      let touching = null
      for (const wall of stage.all('wall')) {
        const [sx, , sz] = Array.isArray(wall.props.size) ? wall.props.size : [1, 1, 1]
        const cx = wall.node.position.x, cz = wall.node.position.z
        const nx = Math.max(cx - sx / 2, Math.min(pos.x, cx + sx / 2))
        const nz = Math.max(cz - sz / 2, Math.min(pos.z, cz + sz / 2))
        const dx = pos.x - nx, dz = pos.z - nz
        const d2 = dx * dx + dz * dz
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-4
          pos.x = nx + (dx / d) * r
          pos.z = nz + (dz / d) * r
          touching = wall.id
        }
      }
      if (touching && touching !== player.touching) player.emit?.('hit', { wall: touching })
      player.touching = touching
    }
    // The camera follows the first player, from behind and above.
    const pos = players[0].node.position
    stage.camera.position.lerp(new T.Vector3(pos.x, pos.y + 6, pos.z + 9), 1 - Math.pow(0.001, dt))
    stage.camera.lookAt(pos.x, pos.y + 0.8, pos.z)
  },
})

defineKind('grass', {
  rebuildOn: ['area', 'density'],
  build(stage, p) {
    const T = stage.T
    const [w, d] = Array.isArray(p.area) ? p.area : [30, 30]
    const count = Math.floor(w * d * 60 * Number(p.density ?? 0.6))
    const blade = new T.PlaneGeometry(0.06, 0.55, 1, 4).translate(0, 0.275, 0)
    const mat = new T.ShaderMaterial({
      side: T.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uWind: { value: Number(p.wind ?? 0.4) },
        uPush: { value: new T.Vector3(1e4, 0, 1e4) }, uRadius: { value: 1.3 },
        uBase: { value: new T.Color(p.colour || '#3f7d2f') }, uTip: { value: new T.Color(p.tip || '#b6d96a') },
      },
      vertexShader: `
        uniform float uTime, uWind, uRadius; uniform vec3 uPush; varying float vH;
        void main() {
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          float h = position.y / 0.55; vH = h;
          float sway = sin(uTime * 1.7 + world.x * 0.35 + world.z * 0.27) * uWind * 0.35 * h * h;
          world.x += sway; world.z += sway * 0.4;
          vec2 away = world.xz - uPush.xz; float dist = length(away);
          float bend = clamp(1.0 - dist / uRadius, 0.0, 1.0) * h;
          world.xz += normalize(away + 1e-4) * bend * 0.45; world.y -= bend * 0.25;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        uniform vec3 uBase, uTip; varying float vH;
        void main() { gl_FragColor = vec4(mix(uBase, uTip, vH), 1.0); }`,
    })
    const mesh = new T.InstancedMesh(blade, mat, count)
    const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), v = new T.Vector3()
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < count; i++) {
      v.set((rnd() - 0.5) * w, 0, (rnd() - 0.5) * d)
      e.set(0, rnd() * Math.PI, (rnd() - 0.5) * 0.3)
      q.setFromEuler(e)
      s.set(1, 0.6 + rnd() * 0.8, 1)
      mesh.setMatrixAt(i, m.compose(v, q, s))
    }
    mesh.userData.grass = mat
    return mesh
  },
  frame(stage, fields) {
    const player = stage.all('player')[0]
    for (const f of fields) {
      const u = f.node.userData.grass.uniforms
      u.uTime.value = stage.t
      if (player) u.uPush.value.copy(player.node.position)
    }
  },
})
