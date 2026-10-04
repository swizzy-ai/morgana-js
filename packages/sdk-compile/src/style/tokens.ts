/**
 * Design-language tables: scales, surfaces, text, variants, sizes.
 * Data only — resolution lives in props.ts / parts.ts.
 */

export const SPACING_SCALE: Record<number, string> = {
  0: '0px', 1: '4px', 2: '8px', 3: '12px', 4: '16px',
  5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px',
  16: '64px', 20: '80px', 24: '96px',
}

export const RADIUS_SCALE: Record<string, string> = {
  none: '0px', sm: '4px', md: '8px', lg: '16px', xl: '24px', '2xl': '32px', full: '9999px',
}

/** Bare radius words → radius token. */
export const RADIUS_WORDS: Record<string, string> = {
  round: 'lg', rounded: 'lg', circle: 'full', pill: 'full',
  sharp: 'none', square: 'none', soft: 'md', softer: 'lg',
  softest: 'xl', tiny: 'sm', chunky: 'full',
}

export const SHADOW_SCALE: Record<string, string> = {
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  soft: '0 2px 8px 0 rgba(0, 0, 0, 0.06)',
  floating: '0 8px 32px 0 rgba(31, 38, 135, 0.12)',
  bubbly: '0 6px 20px -4px rgba(0, 0, 0, 0.2)',
  glow: '0 0 20px rgba(99, 102, 241, 0.35)',
  'glow-brand': '0 0 25px rgba(168, 85, 247, 0.4)',
  'glow-success': '0 0 20px rgba(16, 185, 129, 0.35)',
  'glow-danger': '0 0 20px rgba(239, 68, 68, 0.35)',
  'glow-accent': '0 0 20px rgba(245, 158, 11, 0.35)',
  glass: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
  shadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  raised: '0 8px 24px rgba(0, 0, 0, 0.12)',
  elevated: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  flat: 'none',
}

export const SURFACE_TOKENS: Record<string, Record<string, string>> = {
  base: { background: 'var(--background)', color: 'var(--foreground)' },
  neutral: { background: 'var(--muted)', color: 'var(--foreground)' },
  card: { background: 'var(--card)', color: 'var(--card-foreground)', 'box-shadow': 'var(--shadow)' },
  panel: { background: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)' },
  muted: { background: 'var(--muted)', color: 'var(--muted-foreground)' },
  danger: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #FEE2E2' },
  success: { background: '#ECFDF5', color: '#065F46', border: '1px solid #D1FAE5' },
  brand: { background: '#F5F3FF', color: '#5B21B6', border: '1px solid #EDE9FE' },
  accent: { background: '#3F1521', color: '#FDF2F4' },
  primary: { background: 'var(--primary)', color: 'var(--primary-foreground)' },
  secondary: { background: '#E4E4E7', color: '#18181B' },
  dark: { background: '#09090B', color: '#FAFAFA' },
  glass: { background: 'rgba(255, 255, 255, 0.7)', color: '#18181B', 'backdrop-filter': 'blur(12px)', border: '1px solid rgba(228, 228, 231, 0.5)' },
  'glass-card': { background: 'rgba(255, 255, 255, 0.85)', color: '#18181B', 'backdrop-filter': 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.6)', 'box-shadow': '0 8px 32px 0 rgba(31, 38, 135, 0.08)' },
  'panel-elevated': { background: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)', 'box-shadow': '0 20px 25px -5px rgba(0, 0, 0, 0.08)' },
  'card-interactive': { background: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)', 'box-shadow': '0 1px 3px 0 rgba(0,0,0,0.05)', transition: 'all 200ms ease', cursor: 'pointer' },
  'hero-gradient': { background: 'linear-gradient(135deg, #18181B 0%, #27272A 100%)', color: '#FFFFFF', 'box-shadow': '0 20px 25px -5px rgba(0, 0, 0, 0.3)' },
  'dark-glass': { background: 'rgba(18, 18, 23, 0.75)', color: '#F4F4F5', 'backdrop-filter': 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.1)' },
}

export const TEXT_SCALE: Record<string, Record<string, string>> = {
  'body-sm': { 'font-size': '12px', 'font-weight': '400', 'line-height': '1.33' },
  'body-me': { 'font-size': '14px', 'font-weight': '400', 'line-height': '1.43' },
  body: { 'font-size': '14px', 'font-weight': '400', 'line-height': '1.43' },
  'body-lg': { 'font-size': '16px', 'font-weight': '400', 'line-height': '1.63' },
  h1: { 'font-size': '36px', 'font-weight': '700', 'line-height': '1.14', 'letter-spacing': '-0.025em' },
  h2: { 'font-size': '28px', 'font-weight': '700', 'line-height': '1.29', 'letter-spacing': '-0.02em' },
  h3: { 'font-size': '20px', 'font-weight': '600', 'line-height': '1.3', 'letter-spacing': '-0.015em' },
  display: { 'font-size': '52px', 'font-weight': '800', 'line-height': '1.08' },
  'display-lg': { 'font-size': '60px', 'font-weight': '800', 'line-height': '1.07' },
  caption: { 'font-size': '11px', 'font-weight': '600', 'line-height': '1.45', 'letter-spacing': '0.09em', 'text-transform': 'uppercase' },
  title: { 'font-size': '20px', 'font-weight': '600', 'line-height': '1.3' },
  subtitle: { 'font-size': '16px', 'font-weight': '400', 'line-height': '1.5' },
  headline: { 'font-size': '28px', 'font-weight': '700', 'line-height': '1.29' },
  mono: { 'font-size': '13px', 'font-weight': '400', 'line-height': '1.54', 'font-family': 'JetBrains Mono, Fira Code, monospace' },
}

export const SPACING_WORDS: Record<string, Array<[string, number]>> = {
  padded: [['pad', 4]],
  roomy: [['pad', 6]],
  spacious: [['pad', 8]],
  airy: [['pad', 8]],
  compact: [['pad', 2]],
  tight: [['pad', 1], ['gap', 1]],
  gap: [['gap', 3]],
}

export const DIMENSION_WORDS: Record<string, { prop: string; value: string }> = {
  full: { prop: 'width', value: '100%' },
  fullparentwidth: { prop: 'width', value: '100%' },
  'full-width': { prop: 'width', value: '100%' },
  fullwidth: { prop: 'width', value: '100%' },
  half: { prop: 'width', value: '50%' },
  halfwidth: { prop: 'width', value: '50%' },
  third: { prop: 'width', value: '33.333%' },
  threequarters: { prop: 'width', value: '75%' },
  hug: { prop: 'width', value: 'fit-content' },
  hugcontent: { prop: 'width', value: 'fit-content' },
  'hug-content': { prop: 'width', value: 'fit-content' },
  auto: { prop: 'width', value: 'auto' },
  fullheight: { prop: 'height', value: '100%' },
}

export const LAYOUT_WORDS: Record<string, string> = {
  row: 'row', horizontal: 'row',
  column: 'col', col: 'col', vertical: 'col', stacked: 'col',
}

export const BUTTON_VARIANTS: Record<string, Record<string, string>> = {
  primary: { background: 'var(--primary)', color: 'var(--primary-foreground)', border: '1px solid transparent' },
  secondary: { background: '#E4E4E7', color: '#18181B', border: '1px solid transparent' },
  outline: { background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' },
  ghost: { background: 'transparent', color: 'var(--foreground)', border: '1px solid transparent' },
  danger: { background: '#DC2626', color: '#FFFFFF', border: '1px solid transparent' },
  success: { background: '#059669', color: '#FFFFFF', border: '1px solid transparent' },
}

export const BADGE_VARIANTS: Record<string, Record<string, string>> = {
  default: { background: 'var(--primary)', color: 'var(--primary-foreground)' },
  success: { background: '#ECFDF5', color: '#065F46', border: '1px solid #D1FAE5' },
  warning: { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' },
  danger: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #FEE2E2' },
  info: { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' },
  purple: { background: '#F5F3FF', color: '#5B21B6', border: '1px solid #EDE9FE' },
  outline: { background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' },
  pill: { background: 'var(--muted)', color: 'var(--foreground)', 'border-radius': '9999px' },
}

export const ALERT_VARIANTS: Record<string, Record<string, string>> = {
  info: { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' },
  success: { background: '#ECFDF5', color: '#065F46', border: '1px solid #D1FAE5' },
  warning: { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' },
  danger: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #FEE2E2' },
}

export const TABLE_VARIANTS: Record<string, Record<string, string>> = {
  default: {},
  striped: {},
  bordered: { border: '1px solid var(--border)' },
  cards: { background: 'var(--card)', 'border-radius': '8px', 'box-shadow': 'var(--shadow)' },
  elevated: { 'box-shadow': '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
  glass: { background: 'rgba(255, 255, 255, 0.7)', 'backdrop-filter': 'blur(12px)' },
  compact: {},
}

export const TABLE_DENSITY: Record<string, { cellY: string; cellX: string; headerSize: string; cellSize: string }> = {
  compact: { cellY: '4px', cellX: '8px', headerSize: '12px', cellSize: '13px' },
  normal: { cellY: '8px', cellX: '12px', headerSize: '13px', cellSize: '14px' },
  relaxed: { cellY: '12px', cellX: '16px', headerSize: '14px', cellSize: '15px' },
}

export const DIALOG_SIZES: Record<string, string> = {
  sm: '380px',
  md: '500px',
  lg: '720px',
  xl: '960px',
  full: '94vw',
}

/** Switch geometry per size token (track × thumb + on-offset). */
export const SWITCH_SIZES: Record<string, { trackW: number; trackH: number; thumb: number; pad: number }> = {
  sm: { trackW: 36, trackH: 20, thumb: 14, pad: 3 },
  md: { trackW: 44, trackH: 24, thumb: 20, pad: 2 },
  lg: { trackW: 56, trackH: 32, thumb: 26, pad: 3 },
}

export const PROGRESS_VARIANTS: Record<string, string> = {
  emerald: '#059669',
  sky: '#0284C7',
  amber: '#D97706',
  rose: '#E11D48',
  purple: '#7C3AED',
}
export const ALIGN_MAP: Record<string, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end',
  stretch: 'stretch', baseline: 'baseline', left: 'flex-start', right: 'flex-end',
}
export const JUSTIFY_MAP: Record<string, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end',
  between: 'space-between', around: 'space-around', evenly: 'space-evenly',
}
