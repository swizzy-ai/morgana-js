/**
 * Part rule contract + assembly.
 *
 * Split by domain so no single file grows without bound. `resolvePartStyles`
 * is the entry point called by the stylesheet builder.
 */
import type { StyleCtx } from '../props';
import type { PartRule } from './shared';
import { inputPartStyles } from './inputs';
import { overlayPartStyles } from './overlay';
import { navPartStyles } from './nav';
import { dataPartStyles } from './data';
import { contentPartStyles } from './content';
import { mediaPartStyles } from './media';

export type { PartRule };

const DOMAINS = [
  inputPartStyles,
  overlayPartStyles,
  navPartStyles,
  dataPartStyles,
  contentPartStyles,
  mediaPartStyles,
];

/**
 * Deep-part rules for composite objects — full selectors scoped to one entity
 * id (e.g. `[data-entity="x"] [data-part="track"]`). Covers the geometry +
 * state styling that per-object props can't express.
 */
export function resolvePartStyles(
  kind: string,
  id: string,
  rawProps: Record<string, unknown>,
  ctx: StyleCtx,
): PartRule[] {
  const out: PartRule[] = [];
  for (const domain of DOMAINS) {
    const rules = domain(kind, id, rawProps, ctx);
    for (const rule of rules) out.push(rule);
  }
  return out;
}
