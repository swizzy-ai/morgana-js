/**
 * @studiomorgana/media — what every graphics object's props stand on
 * (budding-gilgamesh/godverse/README.md): props with ranges, seeds that draw
 * the values nobody set, colour, and the check that keeps two draws from
 * coming out alike. No dependencies, no DOM.
 */
export { hash, random, childSeed, newSeed, type Random } from './random'
export { rgb, hex, toHsl, fromHsl, mix, shift, type Rgb, type Hsl } from './colour'
export {
  num, int, choice, colour, flag, group, merge, resolve, find, get,
  type Handle, type Handles, type NumberHandle, type ChoiceHandle, type ColourHandle, type FlagHandle, type GroupHandle,
  type Ask, type AskLeaf, type Values, type Resolved,
} from './handles'
export { fingerprint, distance, resolveDistinct, type Fingerprint, type Distinct } from './difference'
