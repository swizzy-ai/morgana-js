# 12 · Plugins and artifacts

A plugin adds a new kind of definition to a project. It reads a folder of
definition files, builds each one into files at build time, and lets pages
point at those files by name. `@studiomorgana/assets` is the first: 2D sprites
and 3D models, written in words.

```ts
// morgana.config.ts
export default defineConfig({ name: 'my-game', plugins: ['@studiomorgana/assets'] })
```

```ts
// src/assets/chest.ts
import { box, defineAsset, motion } from '@studiomorgana/assets'

const base = box('base', { size: [1.2, 0.7, 0.8], looks: 'wood' }).at(0, 0.35, 0)
const lid = box('lid', { size: [1.24, 0.3, 0.84], looks: 'dark wood' }).on(base).hinged('back')

export default defineAsset({
  name: 'chest', kind: '3d', parts: [base, lid],
  animations: { open: [motion(lid).turns('a third', 'backward').over('slow').eases('bounce')] },
})
```

```ts
// a compile action
page.place(ctx.ui.image({ id: 'coin', src: 'asset:coin#clip:spin', alt: 'coin' }))

// or with helpers
const { create } = helpers(ctx)
create.sprite('coin', 'coin', { clip: 'spin', size: 'small' })
```

## References

| Write | Points at |
|---|---|
| `asset:coin` | the asset's main file (a 2D still, a 3D model) |
| `asset:heart@half` | a named variant |
| `asset:coin#clip:spin` | one file by role: `clip:<name>`, `still`, `sheet`, `atlas`, `model` |

A reference in any object prop is replaced with the built file's URL at build.
One that names nothing is a build warning, not a broken image.

## Artifacts: built once, by content

Every output is keyed by a hash of everything that went into it: the
definition and all it imports, the plugin's code and the variant. A key built
before is taken from `.morgana/artifacts/` and never rebuilt, so an unchanged
project rebuilds no artifacts at all. Builds are deterministic: plugins get
seeded randomness and no clock, so the same definition produces the same
bytes on every machine.

```bash
morgana artifacts list               # what the plugins build: name, variant, hash, size, files
morgana artifacts dump robot heart   # plain files in ./exported, for Blender, Godot, any engine
morgana artifacts push               # upload what the cloud lacks, without deploying
morgana artifacts list --remote      # what the live deploy serves
```

## Deploying

`morgana deploy` runs in steps:

1. **Build.** Compile the project. Artifacts come from the cache unless they changed.
2. **Plan.** Ask the worker, in one request, which artifact files it lacks.
3. **Upload.** Send only those, several at a time. Files are stored by the SHA-256 of their bytes, so identical files, even across projects, are stored once.
4. **Code.** Upload server actions.
5. **Release.** Send pages and a small map of artifact paths → hashes. The worker refuses to go live while any file in the map is missing.
6. **Verify.** Load the page and every file it references.

`morgana deploy --dry-run` builds and shows the plan without uploading.
Artifacts are served with `cache-control: immutable`: a new build is a new URL.
Against a worker without an artifact store, deploy warns and sends the files
inline, as before.

## Writing a plugin

```ts
import { definePlugin } from '@studiomorgana/sdk'

export default definePlugin({
  name: 'badges',
  about: 'Round badges with a word on them.',
  reads: 'src/badges',
  defines: ['defineBadge'],
  refers: 'badge',
  variants: (b) => Object.keys(b.colours),
  makes: (b, make) => {
    if (!b.word) make.fail('a badge needs a word')
    make.file('image', `${b.name}.svg`, svgFor(b, b.colours[make.variant]))
    make.describe({ colour: b.colours[make.variant] })
  },
})
```

- `makes` is pure: definition in, files out. It gets no file system, no clock and no network, so it runs the same in the CLI, a browser worker or the cloud.
- `make.random()`, `between`, `pick` are seeded and are the only randomness allowed.
- `make.use('asset:chest')` reads another plugin's output. List that plugin in `after` and it builds first.
- `make.warn` and `make.fail` take plain sentences and show the definition's file.
- `make.points` reads amounts with the project's point basis: `make.points.read('2 points', 'distance')` → 16, `make.points.read('a little', 'turns')` → 2. For pixels on an output frame, `make.points.with({ frame: { width: 3840, height: 2160 } })` scales px by the frame's shorter side ÷ 1080. The basis is part of every output's hash, so changing `points` in the config rebuilds what it affects. See [Points](13-points.md).
- `words` declares the plugin's vocabulary as data (`size: { means: 'metres', small: 0.5, … }`) for tools and, later, the language layer.

A package plugin exports it as `<package>/plugin`. A local one is a path in the config: `plugins: ['./plugins/badges.ts']`.

Next: [back to the guide](README.md)
