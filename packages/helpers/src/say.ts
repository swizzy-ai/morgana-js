// How the words of `make(…)` and `set(…)` are said in English, for languages
// that write helpers code (Godtongue). The method names already read as words
// (`textColor` is "text color"); this adds the other ways people say them.
// scripts/vocabulary.mjs turns these, with the methods' own signatures, into
// vocabulary.json.

/** Other ways to say a word, by method. */
export const SAY: Record<string, string[]> = {
  padding: ['padded', 'pad'],
  spaced: ['spacing', 'gap', 'spaced out'],
  rounded: ['round corners', 'corners', 'radius'],
  circle: ['round'],
  underline: ['underlined'],
  capitalize: ['capitalized', 'capitalised'],
  shadow: ['shadowed'],
  glow: ['glowing'],
  pointer: ['clickable'],
  scrolls: ['scrolling', 'scrollable'],
  wrap: ['wrapping'],
  grow: ['growing'],
  shown: ['visible'],
  centered: ['centred', 'in the middle'],
  textColor: ['text colour', 'font color', 'font colour', 'color', 'colour'],
  background: ['background color', 'background colour', 'bg'],
  borderWidth: ['border thickness'],
  fontWeight: ['weight'],
  faded: ['transparent', 'see through'],
}

/**
 * A word said on its own, with no method name before it, and the method it
 * means: `large` is `size('large')`. A colour said alone is `textColor` on
 * these kinds and `background` on the rest.
 */
export const BARE = {
  size: ['display', 'heading', 'title', 'subtitle', 'body', 'large', 'small', 'caption', 'code'],
  textKinds: ['text', 'link', 'label', 'heading', 'paragraph'],
  /** Other words for a bare size: `big` is `large`. */
  sizeAliases: { big: 'large', huge: 'display', tiny: 'caption' } as Record<string, string>,
}
