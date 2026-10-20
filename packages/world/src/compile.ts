/**
 * A resolved world piece → a scene: the shader's uniforms and the camera's
 * path. Plain data, so it serialises into a page or a single HTML file.
 */
import { rgb, type ResolvedPiece, type Values } from '@studiomorgana/media'
import { MAX_ISLANDS } from './shader'

export type UniformType = '1f' | '2f' | '3f' | '1i' | '3fv' | '4fv'
export type Uniform = [name: string, type: UniformType, value: number | number[]]

export interface CameraPath {
  start: [number, number, number]
  heading: number
  tilt: number
  lens: number
  move: string
  speed: number
  sway: number
  handheld: boolean
  /** What `orbits` circles. */
  centre: [number, number, number]
}

export interface Scene {
  name: string
  seed: string
  width: number
  height: number
  length: number
  uniforms: Uniform[]
  camera: CameraPath
}

const v = (values: Values, path: string): number | string | boolean => {
  let at: unknown = values
  for (const k of path.split('.')) at = (at as Values)[k]
  return at as never
}
const n = (values: Values, path: string) => Number(v(values, path))
const s = (values: Values, path: string) => String(v(values, path))
const lin = (hex: string) => rgb(hex).map((c) => Math.pow(c, 2.2)) as [number, number, number]
const rad = (deg: number) => (deg * Math.PI) / 180
const OUTLINES = ['round', 'long', 'crescent', 'jagged', 'twin']
const PROFILES = ['rolling', 'volcanic', 'mesa', 'spire', 'flat']

export function compileWorld(piece: ResolvedPiece): Scene {
  const of = (kind: string) => piece.nodes.filter((x) => x.kind === kind)
  const ocean = of('ocean')[0]?.values
  const sky = of('sky')[0]?.values
  const mist = of('mist')[0]?.values
  const cam = of('camera')[0]?.values
  const islands = of('island').slice(0, MAX_ISLANDS).map((x) => x.values)
  if (!ocean || !sky || !cam) throw new Error('A world needs an ocean, a sky and a camera (readWorld adds them).')
  const st = piece.style

  // Where the islands are: bearing from north, distance from the start.
  // Composition: an island sits in the view, not over it. Its peak may rise at
  // most four fifths of the way from the horizon to the top of the frame, so its
  // near shore is pushed back until it does, for this lens.
  const rise = Math.tan(rad(n(cam, 'lens') * 0.5 * 0.8))
  const centres = islands.map((i) => {
    const reach = n(i, 'shape.size') * (s(i, 'shape.outline') === 'long' ? n(i, 'shape.stretch') : 1)
    const b = rad(n(i, 'place.bearing')), d = Math.max(n(i, 'place.distance'), reach * 1.05 + n(i, 'height.peak') / rise)
    return [Math.sin(b) * d, Math.cos(b) * d] as [number, number]
  })

  // Which way the camera looks.
  const face = s(cam, 'face')
  let heading = 0
  if (face === 'islands' && centres.length) {
    const sx = centres.reduce((a, c) => a + c[0] / Math.hypot(c[0], c[1]), 0)
    const sz = centres.reduce((a, c) => a + c[1] / Math.hypot(c[0], c[1]), 0)
    heading = Math.atan2(sx, sz) * 180 / Math.PI
  }
  let sunBearing = n(sky, 'sun.bearing')
  if (face === 'sun') sunBearing = Math.max(-8, Math.min(8, sunBearing * 0.2))
  const az = rad(heading + sunBearing), el = rad(n(sky, 'sun.elevation'))
  const sunDir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]

  const waveDir = rad(n(ocean, 'waves.direction')), swellDir = rad(n(ocean, 'swell.direction'))
  const u: Uniform[] = [
    ['uWaveH', '1f', n(ocean, 'waves.height')],
    ['uWaveL', '1f', n(ocean, 'waves.length')],
    ['uChoppy', '1f', n(ocean, 'waves.choppiness')],
    ['uOctaves', '1f', n(ocean, 'waves.octaves')],
    ['uWaveDir', '2f', [Math.sin(waveDir), Math.cos(waveDir)]],
    ['uWaveSpeed', '1f', n(ocean, 'wind.speed')],
    ['uSwellH', '1f', n(ocean, 'swell.height')],
    ['uSwellL', '1f', n(ocean, 'swell.length')],
    ['uSwellDir', '2f', [Math.sin(swellDir), Math.cos(swellDir)]],
    ['uTide', '1f', n(ocean, 'tide')],
    ['uDeep', '3f', lin(s(ocean, 'colour.deep'))],
    ['uShallow', '3f', lin(s(ocean, 'colour.shallow'))],
    ['uScatter', '3f', lin(s(ocean, 'colour.scatter'))],
    ['uFoamC', '3f', lin(s(ocean, 'colour.foam'))],
    ['uRough', '1f', n(ocean, 'surface.roughness')],
    ['uReflect', '1f', n(ocean, 'surface.reflection')],
    ['uClarity', '1f', n(ocean, 'surface.clarity')],
    ['uFoam', '1f', n(ocean, 'foam.amount')],
    ['uCrest', '1f', n(ocean, 'foam.crest')],
    ['uShoreFoam', '1f', n(ocean, 'foam.shore')],

    ['uSunDir', '3f', sunDir],
    ['uSunC', '3f', lin(s(sky, 'sun.colour'))],
    ['uSunSize', '1f', n(sky, 'sun.size')],
    ['uSunStr', '1f', n(sky, 'sun.strength')],
    ['uZenith', '3f', lin(s(sky, 'colour.zenith'))],
    ['uHorizon', '3f', lin(s(sky, 'colour.horizon'))],
    ['uGlow', '3f', lin(s(sky, 'colour.glow'))],
    ['uClouds', '1f', n(sky, 'clouds.amount')],
    ['uCloudScale', '1f', n(sky, 'clouds.scale')],
    ['uCloudSoft', '1f', n(sky, 'clouds.softness')],
    ['uCloudStretch', '1f', n(sky, 'clouds.stretch')],
    ['uCloudC', '3f', lin(s(sky, 'clouds.colour'))],
    ['uCloudSpeed', '1f', n(sky, 'clouds.speed')],
    ['uCloudShade', '1f', n(sky, 'clouds.shadowed')],
    ['uCloudSeed', '1f', (parseInt(piece.seed.slice(0, 6), 36) % 1000) / 1000],
    ['uStars', '1f', n(sky, 'stars')],
    ['uExposure', '1f', n(sky, 'exposure')],

    ['uMist', '1f', mist ? n(mist, 'amount') : 0],
    ['uMistH', '1f', mist ? n(mist, 'height') : 30],
    ['uHaze', '1f', mist ? n(mist, 'haze') : 0.25],
    ['uMistC', '3f', lin(mist ? s(mist, 'colour') : '#cfd9e2')],

    ['uWarmth', '1f', Number(st.warmth)],
    ['uSat', '1f', Number(st.saturation)],
    ['uContrast', '1f', Number(st.contrast)],
    ['uGrain', '1f', Number(st.grain)],
    ['uDetail', '1f', Number(st.detail)],
    ['uQuality', '1f', 1],
    ['uIslands', '1i', islands.length],
  ]
  const pad4 = (rows: number[][]) => [...rows, ...Array(MAX_ISLANDS - rows.length).fill([0, 0, 0, 0])].flat()
  const pad3 = (rows: number[][]) => [...rows, ...Array(MAX_ISLANDS - rows.length).fill([0, 0, 0])].flat()
  const seedOf = (k: number) => (parseInt(piece.nodes.filter((x) => x.kind === 'island')[k]!.seed.slice(0, 6), 36) % 997) / 9.97
  u.push(
    ['uIA', '4fv', pad4(islands.map((i, k) => [centres[k]![0], centres[k]![1], n(i, 'shape.size'), n(i, 'height.peak')]))],
    ['uIB', '4fv', pad4(islands.map((i, k) => [rad(n(i, 'shape.turn')), n(i, 'shape.stretch'), n(i, 'shape.bays'), seedOf(k)]))],
    ['uIC', '4fv', pad4(islands.map((i) => [OUTLINES.indexOf(s(i, 'shape.outline')), PROFILES.indexOf(s(i, 'height.profile')), n(i, 'height.peaks'), n(i, 'terrain.ridges')]))],
    ['uID', '4fv', pad4(islands.map((i) => [n(i, 'cliffs.height'), rad(n(i, 'cliffs.side')), n(i, 'cliffs.spread'), n(i, 'terrain.erosion')]))],
    ['uIE', '4fv', pad4(islands.map((i) => [n(i, 'shore.beach'), n(i, 'life.vegetation'), n(i, 'life.treeline'), n(i, 'materials.snowline')]))],
    ['uIF', '4fv', pad4(islands.map((i) => [n(i, 'terrain.roughness'), n(i, 'shore.reef'), n(i, 'shape.lean'), 0]))],
    ['uSand', '3fv', pad3(islands.map((i) => lin(s(i, 'materials.sand'))))],
    ['uGrass', '3fv', pad3(islands.map((i) => lin(s(i, 'materials.grass'))))],
    ['uRock', '3fv', pad3(islands.map((i) => lin(s(i, 'materials.rock'))))],
    ['uSnow', '3fv', pad3(islands.map((i) => lin(s(i, 'materials.snow'))))],
  )

  const centre: [number, number, number] = centres.length
    ? [centres.reduce((a, c) => a + c[0], 0) / centres.length, 0, centres.reduce((a, c) => a + c[1], 0) / centres.length]
    : [Math.sin(rad(heading)) * 1500, 0, Math.cos(rad(heading)) * 1500]
  return {
    name: piece.name,
    seed: piece.seed,
    width: piece.size.width,
    height: piece.size.height,
    length: piece.clock.length,
    uniforms: u,
    camera: {
      start: [0, Math.max(n(cam, 'height'), n(ocean, 'waves.height') * 1.2 + n(ocean, 'swell.height') + 1.2), 0],
      heading,
      tilt: n(cam, 'tilt'),
      lens: n(cam, 'lens'),
      move: s(cam, 'move'),
      speed: n(cam, 'speed'),
      sway: n(cam, 'sway'),
      handheld: Boolean(v(cam, 'handheld')),
      centre,
    },
  }
}
