/**
 * make() vocabulary: token resolution.
 *
 * Public surface: `resolveMakeToken` (compile lane) and `animationKeyframes`
 * (stylesheet emission for the animation words).
 */
import { ALIGN_TOKENS, JUSTIFY_TOKENS, LAYOUT_TOKENS, RADIUS_TOKENS, SURFACE_TOKENS } from '@morgana/sdk';
import {
  ANIMATION_WORDS,
  BEHAVIOR_WORDS,
  EFFECT_WORDS,
  MULTI_PROP_TOKENS,
  PAGE_TOKENS,
  SIZE_TOKENS,
  SURFACE_WORDS,
} from './vocabulary';

const TEXT_LIKE = new Set(['text', 'markdown', 'code', 'label', 'link'])
const FONT_TOKENS = new Set([
  'h1', 'h2', 'h3', 'body-lg', 'bodyLarge', 'body-sm', 'bodySmall',
  'body-me', 'body', 'mono', 'display', 'display-lg', 'caption',
  'headline', 'title', 'subtitle',
])
const EFFECT_TOKENS = new Set([
  'glow', 'glow-brand', 'glow-success', 'glow-danger', 'glow-accent',
  'raised', 'shadow', 'inner', 'flat', 'floating', 'bubbly', 'inset',
])
const NAMED_COLORS = new Set([
  'red', 'blue', 'green', 'black', 'white', 'brand', 'accent', 'neutral',
  'primary', 'secondary', 'danger', 'success', 'muted', 'transparent',
])

function isColorToken(v: string): boolean {
  return (
    /^#([0-9a-f]{3,8})$/i.test(v) ||
    v.startsWith('rgb') ||
    v.startsWith('hsl') ||
    NAMED_COLORS.has(v)
  )
}

/**
 * Resolve a bare make() token into prop writes.
 *
 * Every branch returns props that the renderer or stylesheet actually reads.
 * `unresolved` reports a word with no mapping so a test can fail on it —
 * previously such a word became `{ token: v }`, a property nothing consumed.
 */
export function resolveMakeTokenDetailed(
  kind: string,
  token: string,
): { props: Record<string, unknown>; resolved: boolean } {
  const v = token.trim()

  if ((SURFACE_TOKENS as readonly string[]).includes(v)) {
    return { props: { surface: v }, resolved: true }
  }
  if ((LAYOUT_TOKENS as readonly string[]).includes(v)) {
    return { props: { layout: v }, resolved: true }
  }
  if ((RADIUS_TOKENS as readonly string[]).includes(v)) {
    return { props: { radius: v }, resolved: true }
  }
  if ((ALIGN_TOKENS as readonly string[]).includes(v)) {
    return { props: { align: v }, resolved: true }
  }
  if ((JUSTIFY_TOKENS as readonly string[]).includes(v)) {
    return { props: { justify: v }, resolved: true }
  }
  if (FONT_TOKENS.has(v)) {
    return { props: { font: v }, resolved: true }
  }
  if (EFFECT_TOKENS.has(v)) {
    return { props: { effect: v }, resolved: true }
  }
  if (SURFACE_WORDS[v]) {
    return { props: { surface: SURFACE_WORDS[v] }, resolved: true }
  }
  if (EFFECT_WORDS[v]) {
    return { props: { effect: EFFECT_WORDS[v] }, resolved: true }
  }
  if (MULTI_PROP_TOKENS[v]) {
    return { props: { ...MULTI_PROP_TOKENS[v] }, resolved: true }
  }
  if (SIZE_TOKENS[v]) {
    return { props: { ...SIZE_TOKENS[v] }, resolved: true }
  }
  if (isColorToken(v)) {
    return { props: { [TEXT_LIKE.has(kind) ? 'color' : 'bg']: v }, resolved: true }
  }
  // Behavior words ride a class; the client runtime reads it.
  if (BEHAVIOR_WORDS.has(v)) {
    return { props: { behavior: v }, resolved: true }
  }
  // Animation words become a class whose keyframes the sheet emits.
  if (ANIMATION_WORDS.has(v)) {
    return { props: { animate: v }, resolved: true }
  }
  // spa is a page-shell marker, read by render/page.ts.
  if (PAGE_TOKENS.has(v)) {
    return { props: { spa: true }, resolved: true }
  }
  return { props: {}, resolved: false }
}

/** Resolve a bare make() token into prop writes. Unresolved words set nothing. */
export function resolveMakeToken(kind: string, token: string): Record<string, unknown> {
  return resolveMakeTokenDetailed(kind, token).props
}

/**
 * Keyframes for every animation word, emitted once into the stylesheet.
 * Referenced by the `animate-*` classes in `animationClasses()`.
 */
export function animationKeyframes(): string {
  const keyframes: Record<string, string> = {
    'fade-in': 'from{opacity:0}to{opacity:1}',
    'fade-out': 'from{opacity:1}to{opacity:0}',
    'slide-up': 'from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}',
    'slide-down': 'from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}',
    'scale-in': 'from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:none}',
    'scale-out': 'from{opacity:1;transform:none}to{opacity:0;transform:scale(0.96)}',
    pulse: '0%,100%{opacity:1}50%{opacity:0.5}',
    bounce: '0%,20%,53%,100%{transform:translateY(0)}40%,43%{transform:translateY(-6px)}70%{transform:translateY(-3px)}',
    spin: 'from{transform:rotate(0)}to{transform:rotate(360deg)}',
    smooth: 'from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}',
    bouncy: '0%{transform:scale(1)}50%{transform:scale(1.04)}100%{transform:scale(1)}',
  }
  const out: string[] = []
  for (const [name, body] of Object.entries(keyframes)) {
    const name2 = name.replace(/-/g, '_')
    out.push(`@keyframes morgana-${name2}{${body}}`)
  }
  out.push(`@keyframes morgana-skeleton{0%{opacity:1}50%{opacity:0.45}100%{opacity:1}}`)
  return out.join('\n')
}

/** Class rules for the animation and behavior words, keyed by token. */
export function animationClasses(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of ANIMATION_WORDS) {
    const cls = `morgana-anim-${name.replace(/-/g, '_')}`
    const dur = name === 'pulse' || name === 'bounce' || name === 'bouncy' ? '0.8s' : name === 'spin' ? '1s' : '0.35s'
    const timing = name === 'bounce' || name === 'bouncy' ? 'cubic-bezier(.28,.84,.42,1)' : name === 'spin' ? 'linear' : 'ease'
    const iter = name === 'pulse' || name === 'bounce' || name === 'bouncy' ? 'infinite' : '1'
    out[cls] = `animation:morgana-${name.replace(/-/g, '_')} ${dur} ${timing} ${iter}`;
  }
  for (const name of BEHAVIOR_WORDS) {
    out[`morgana-bh-${name}`] = name === 'tappable' || name === 'clickable' ? 'cursor:pointer' : ''
  }
  return out
}
