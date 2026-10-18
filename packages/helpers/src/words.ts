// The plain words helpers accept, and the Morgana values they mean.
// A raw value (a number, '#fe9920', a type-scale token) always passes through.
// Points ('2 points', 'a little', '3 hairs') become px with the theme's basis.
import { points, type Points } from '@studiomorgana/points'

/** The standard point reader, for sentences without a theme basis. */
export const STANDARD_POINTS: Points = points()

export type Size = 'none' | 'tiny' | 'small' | 'medium' | 'large' | 'huge'

/** Spacing — padding and the space between children (base-grid units). */
export const SPACE: Record<Size, number> = { none: 0, tiny: 1, small: 2, medium: 4, large: 6, huge: 8 }

/** Widths and heights (base-grid units), plus `full` and `fit`. */
export const LENGTH: Record<Exclude<Size, 'none'>, number> = { tiny: 40, small: 80, medium: 120, large: 180, huge: 280 }

export const RADIUS: Record<Size, string> = { none: 'none', tiny: 'sm', small: 'sm', medium: 'md', large: 'lg', huge: 'xl' }

export type TextSize =
  | 'display' | 'heading' | 'title' | 'subtitle' | 'body' | 'large' | 'small' | 'caption' | 'code'

/** Text sizes → steps of the type scale. */
export const TEXT: Record<TextSize, string> = {
  display: 'display', heading: 'h2', title: 'title', subtitle: 'subtitle',
  body: 'body', large: 'body-lg', small: 'body-sm', caption: 'caption', code: 'mono',
}

export type Weight = 'light' | 'normal' | 'medium' | 'semibold' | 'bold'
export const WEIGHT: Record<Weight, number> = { light: 300, normal: 400, medium: 500, semibold: 600, bold: 700 }

export function space(v: Size | number | (string & {}), pts: Points = STANDARD_POINTS): number | string {
  if (typeof v === 'number') return v
  if (Object.hasOwn(SPACE, v)) return SPACE[v as Size]
  if (pts.isPoints(v)) return pts.css(v, 'distance')
  return v   // an exact CSS value passes through
}

export function length(v: Exclude<Size, 'none'> | 'full' | 'fit' | number | (string & {}), pts: Points = STANDARD_POINTS): string | number {
  if (typeof v === 'number') return v
  if (!Object.hasOwn(LENGTH, v) && pts.isPoints(v)) return pts.css(v, 'distance')
  // 'stretch' is 100% wide without flex-grow; 'fill' also grows along a column (GAPS.md #20).
  if (v === 'full') return 'stretch'
  if (v === 'fit') return 'hug'
  return (LENGTH as Record<string, number>)[v] ?? v
}

export function radius(v: Size | number | (string & {}), pts: Points = STANDARD_POINTS): string | number {
  if (typeof v === 'number') return v
  if (Object.hasOwn(RADIUS, v)) return RADIUS[v as Size]
  if (pts.isPoints(v)) return pts.css(v, 'distance')
  return v
}

export function textSize(v: TextSize | (string & {})): string {
  return (TEXT as Record<string, string>)[v] ?? v
}
