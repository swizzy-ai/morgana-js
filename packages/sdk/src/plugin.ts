/**
 * Plugins — how a package adds a new kind of definition to Morgana.
 *
 * A plugin reads a folder of definition files (`src/assets/*.ts`, each
 * `export default defineAsset({...})`), turns each one into files at build,
 * and lets the rest of the project point at those files by name
 * (`asset:robot`). The core does the rest: it hashes every output, skips
 * work it has already done, publishes the files with the project and
 * resolves references in pages.
 *
 * The public surface a plugin gives creators should read like sentences.
 * Words come first and numbers are the escape hatch, which is why a plugin
 * declares its vocabulary as data (`words`) rather than burying it in code.
 *
 * @example
 * export default definePlugin({
 *   name: 'assets',
 *   about: 'Things: 2D sprites and 3D models, with animations, built from words.',
 *   reads: 'src/assets',
 *   defines: ['defineAsset'],
 *   refers: 'asset',
 *   variants: (asset) => Object.keys(asset.variants ?? { default: {} }),
 *   makes: (asset, make) => {
 *     const out = compileAsset(asset, make.variant)
 *     for (const f of out.files) make.file(f.role, f.name, f.data)
 *     make.describe({ clips: out.clips })
 *   },
 * })
 */

// ── words ───────────────────────────────────────────────────────────────────

/**
 * One table of words and what they mean: `size: { means: 'metres', small: 0.5, large: 2 }`.
 * `means` names the unit so tools can explain a word ("large = 2 metres").
 */
export interface WordTable {
  means: string
  [word: string]: unknown
}

export type Words = Record<string, WordTable>

/** Identity helper: declare a plugin's vocabulary. */
export function defineWords<W extends Words>(words: W): W {
  return words
}

// ── what a plugin is given while it builds ─────────────────────────────────

/** A finished output of any plugin, as the manifest records it. */
export interface Artifact {
  /** The plugin that made it. */
  plugin: string
  /** The definition's `name`. */
  name: string
  /** `'default'` unless the definition has named variants. */
  variant: string
  /** Content hash of everything that went into it. */
  hash: string
  /** The definition file, relative to the project. */
  source: string
  /** Role → published URL path. The first role is what a bare reference points at. */
  files: Record<string, string>
  /** Whatever the plugin described (clips, sizes, counts). */
  meta: Record<string, unknown>
  /** Total size of its files. */
  bytes: number
}

/**
 * The helper `makes` receives. Everything a plugin needs, nothing that would
 * make a build differ between machines: no file system, no clock, no network.
 */
export interface Make {
  /** Which variant is being built. */
  readonly variant: string
  /** The variant's seed: the same on every machine. */
  readonly seed: number
  /** The definition file, relative to the project (for messages). */
  readonly source: string
  /** Seeded randomness — the only kind allowed in a build. */
  random(): number
  between(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  /** Write one output file. `role` names what it is (`'model'`, `'still'`, `'clip:walk'`). */
  file(role: string, name: string, data: Uint8Array | string): void
  /** Facts about the output, recorded in the manifest. */
  describe(meta: Record<string, unknown>): void
  /** Another plugin's finished output, by reference. Only plugins listed in `after`. */
  use(ref: string): Artifact | undefined
  /** A plain-English note shown with the definition's file. */
  warn(text: string): void
  /** Stop the build with a plain-English reason. */
  fail(text: string): never
}

// ── the plugin ─────────────────────────────────────────────────────────────

export interface PluginDefinition<D = any> {
  /** Short, lower-case: `'assets'`, `'world'`, `'music'`. */
  name: string
  /** One sentence: what creators make with it. */
  about: string
  /** The folder of definition files, relative to the project. */
  reads: string
  /** The define word(s) those files use, for discovery and docs. */
  defines: string[]
  /** Plugins whose outputs this one reads with `make.use`. Built first. */
  after?: string[]
  /** The plugin's vocabulary. */
  words?: Words
  /** The scheme for references: `refers: 'asset'` makes `asset:robot` work in pages. */
  refers?: string
  /** A definition's variant names. Without it, every definition has one variant, `'default'`. */
  variants?: (definition: D) => string[]
  /** A variant's seed. Without it, the seed is derived from the name and variant. */
  seed?: (definition: D, variant: string) => number | undefined
  /** Build one variant of one definition. Pure: definition in, files out. */
  makes: (definition: D, make: Make) => void | Promise<void>
  /** Events the plugin adds to the page bus, for `morgana spec`. */
  tells?: string[]
  /** How to use it, in prose: shown by `morgana spec <name>`. */
  explains?: string
  /** Bumped when the same definition would now build different files. */
  version?: string
}

/** Identity helper: the compiler loads the plugin and calls it. */
export function definePlugin<D>(plugin: PluginDefinition<D>): PluginDefinition<D> {
  return plugin
}
