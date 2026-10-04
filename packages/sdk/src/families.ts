/**
 * Object families — what an object renders as.
 *
 * Aliases are accepted anywhere a family token is required (FRAMEWORK.md §2):
 *   interactive ↔ web · graphic ↔ 2d · spatial ↔ 3d
 */

export type Family = 'interactive' | 'graphic' | 'spatial'

export const FAMILY_ALIASES: Readonly<Record<string, Family>> = {
  interactive: 'interactive',
  web: 'interactive',
  graphic: 'graphic',
  '2d': 'graphic',
  spatial: 'spatial',
  '3d': 'spatial',
}

/** Resolves a family token or alias; returns null for unknown tokens. */
export function resolveFamily(token: string): Family | null {
  return FAMILY_ALIASES[token] ?? null
}

/** Canonical alias list for a family (the token itself first). */
export function familyAliases(family: Family): string[] {
  return Object.entries(FAMILY_ALIASES)
    .filter(([, f]) => f === family)
    .map(([alias]) => alias)
}
