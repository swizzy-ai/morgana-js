/**
 * @studiomorgana/media — the core of Morgana Media (budding-gilgamesh/godverse/MEDIA.md).
 *
 * Generators with full handle trees; words that narrow handles to ranges;
 * seeds that draw the rest; a style every generator reads; and the difference
 * check that keeps two pieces from coming out alike. No dependencies, no DOM:
 * the media packages (world, drawing, motion…) build on it.
 */
export { hash, random, childSeed, newSeed, type Random } from './random'
export { rgb, hex, toHsl, fromHsl, mix, shift, type Rgb, type Hsl } from './colour'
export {
  num, int, choice, colour, flag, group, merge, resolve, find, get,
  type Handle, type Handles, type NumberHandle, type ChoiceHandle, type ColourHandle, type FlagHandle, type GroupHandle,
  type Ask, type AskLeaf, type Values, type Resolved,
} from './handles'
export {
  defineGenerator, definePiece, resolvePiece, askOf, STYLE, styleHandles,
  type Generator, type NodeSpec, type PieceSpec, type ResolvedNode, type ResolvedPiece,
} from './piece'
export { fingerprint, distance, resolveDistinct, type Fingerprint, type Distinct } from './difference'
export { readWords, type Read } from './words'
export { vocabularyOf } from './vocabulary'

/** One clock for picture and sound: seconds to beats and bars. */
export function clock(bpm = 80, beatsPerBar = 4) {
  const beat = 60 / bpm
  return {
    bpm,
    beat,
    bar: beat * beatsPerBar,
    beatAt: (t: number) => t / beat,
    barAt: (t: number) => t / (beat * beatsPerBar),
    /** The time of a beat: `at(8)` is the start of bar 3 in 4/4. */
    at: (beats: number) => beats * beat,
  }
}
