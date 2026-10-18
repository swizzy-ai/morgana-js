// Pointing at what plugins built, without writing reference strings by hand.
//
//   asset('coin')                              'asset:coin'
//   asset('coin', { clip: 'spin' })            'asset:coin#clip:spin'
//   asset('heart', { variant: 'half' })        'asset:heart@half'
//   asset('chest', { file: 'model' })          'asset:chest#model'
//
// The compiler swaps each reference for the built file's URL, so a page never
// knows a path or a hash.

export interface AssetPick {
  /** A named variation: `'half'`, `'b'`. */
  variant?: string
  /** An animation clip, for 2D assets: points at its self-animating SVG. */
  clip?: string
  /** A specific output by role: `'still'`, `'sheet'`, `'atlas'`, `'model'`. */
  file?: string
}

/** A reference to an asset built by `@studiomorgana/assets`. */
export function asset(name: string, pick: AssetPick = {}): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) throw new Error(`[helpers] asset("${name}") — an asset name is letters, digits and dashes`)
  if (pick.clip && pick.file) throw new Error(`[helpers] asset("${name}") — pick a clip or a file, not both`)
  const variant = pick.variant ? `@${pick.variant}` : ''
  const role = pick.clip ? `#clip:${pick.clip}` : pick.file ? `#${pick.file}` : ''
  return `asset:${name}${variant}${role}`
}

/** Sizes for sprites, in pixels. */
export const SPRITE: Record<'tiny' | 'small' | 'medium' | 'large' | 'huge', number> = { tiny: 32, small: 64, medium: 128, large: 192, huge: 256 }
