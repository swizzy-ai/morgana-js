/**
 * make() token vocabulary — the bare words.
 *
 * Every word declared in the SDK's `MakeToken` union (sdk/src/handles.ts) must
 * resolve here to a real prop map. A word that falls through to
 * `{ token: v }` sets a property nothing reads, which is the silent no-op this
 * module exists to eliminate.
 *
 * Grouped by what the word controls, so the vocabulary stays navigable.
 */

/** ── Sizing words ─────────────────────────────────────────────────────── */
const WIDTH_TOKENS: Record<string, string> = {
  full: '100%',
  fullwidth: '100%',
  fullWidth: '100%',
  'full-width': '100%',
  fullParentWidth: '100%',
  half: '50%',
  halfwidth: '50%',
  halfWidth: '50%',
  third: '33.333%',
  threequarters: '75%',
  threeQuarters: '75%',
}

const SIZE_TOKENS: Record<string, { width?: string; height?: string }> = {
  hug: { width: 'auto' },
  hugcontent: { width: 'auto' },
  'hug-content': { width: 'auto' },
  hugContent: { width: 'auto' },
  auto: { width: 'auto' },
  fullheight: { height: '100%' },
  fullHeight: { height: '100%' },
}

/** ── Alignment words — canonical AlignToken / JustifyToken values ────── */
const ALIGNMENT_TOKENS: Record<string, { align?: string; justify?: string }> = {
  centered: { align: 'center', justify: 'center' },
  centre: { align: 'center', justify: 'center' },
  middle: { align: 'center' },
  left: { justify: 'start' },
  right: { justify: 'end' },
  center: { justify: 'center' },
  top: { align: 'start' },
  bottom: { align: 'end' },
}

/** ── Spacing words ────────────────────────────────────────────────────── */
const SPACING_TOKENS: Record<string, { pad?: number; gap?: number }> = {
  padded: { pad: 4 },
  roomy: { pad: 5 },
  spacious: { pad: 6 },
  airy: { pad: 7 },
  compact: { pad: 2 },
  tight: { pad: 1 },
  gap: { gap: 4 },
}

/** ── Radius words ─────────────────────────────────────────────────────── */
const RADIUS_WORDS: Record<string, string> = {
  round: 'lg', rounded: 'lg', circle: 'full', pill: 'full',
  sharp: 'none', square: 'none', soft: 'md', softer: 'lg',
  softest: 'xl', tiny: 'sm', chunky: 'full',
}

/** ── Typography words — all read by resolvePropsToCss ─────────────────── */
const TYPOGRAPHY_WORDS: Record<string, Record<string, unknown>> = {
  bold: { fontWeight: 700 },
  semibold: { fontWeight: 600 },
  light: { fontWeight: 300 },
  italic: { fontStyle: 'italic' },
  underlined: { textDecoration: 'underline' },
  underline: { textDecoration: 'underline' },
  uppercased: { textTransform: 'uppercase' },
  lowercase: { textTransform: 'lowercase' },
}

/** ── Visibility words ─────────────────────────────────────────────────── */
const VISIBILITY_WORDS: Record<string, Record<string, unknown>> = {
  hidden: { visibility: 'hidden' },
  invisible: { visibility: 'hidden' },
  visible: { visibility: 'visible' },
}

/** ── Surface words ────────────────────────────────────────────────────── */
const SURFACE_WORDS: Record<string, string> = {
  elevated: 'panel-elevated',
  glasscard: 'glass-card',
  glassCard: 'glass-card',
  'glass-card': 'glass-card',
  darkglass: 'dark-glass',
  darkGlass: 'dark-glass',
  'dark-glass': 'dark-glass',
}

/** ── Effect / decoration words ────────────────────────────────────────── */
const EFFECT_WORDS: Record<string, string> = {
  backgroundless: 'flat',
}

/** ── Behavior words — a class the client runtime acts on ──────────────── */
const BEHAVIOR_WORDS = new Set(['draggable', 'expandable', 'tappable', 'clickable'])

/** ── Animation words — keyframes emitted into the sheet ───────────────── */
const ANIMATION_WORDS = new Set([
  'fade-in', 'fade-out', 'slide-up', 'slide-down',
  'scale-in', 'scale-out', 'pulse', 'bounce', 'spin', 'smooth', 'bouncy',
])

/**
 * `spa` is a page-only token: it marks the page as a client-routed shell. The
 * compiler records it and `render/page.ts` emits the shell attributes.
 */
const PAGE_TOKENS = new Set(['spa'])

export const MULTI_PROP_TOKENS: Record<string, Record<string, unknown>> = {
  ...widthInto('width', WIDTH_TOKENS),
  ...SIZE_TOKENS,
  ...ALIGNMENT_TOKENS,
  ...SPACING_TOKENS,
  ...TYPOGRAPHY_WORDS,
  ...VISIBILITY_WORDS,
  ...widthInto('radius', RADIUS_WORDS),
  column: { layout: 'col' },
  col: { layout: 'col' },
}

function widthInto(prop: string, words: Record<string, string>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [word, value] of Object.entries(words)) {
    out[word] = { [prop]: value }
  }
  return out
}

export { RADIUS_WORDS, TYPOGRAPHY_WORDS, VISIBILITY_WORDS, WIDTH_TOKENS, SIZE_TOKENS, ALIGNMENT_TOKENS, SPACING_TOKENS, SURFACE_WORDS, EFFECT_WORDS, BEHAVIOR_WORDS, ANIMATION_WORDS, PAGE_TOKENS }
