/**
 * `morgana init [name]` — scaffold a project.
 *
 * This is the command that makes the framework approachable, and it is
 * deliberately small: a config, one compile action, the directory layout, and a
 * `package.json`. It does not scaffold a design system, a store, an auth flow, or
 * a component library — a scaffold that guesses all of that is a scaffold nobody
 * deletes. The generated project builds, and every line in it is meant to be read
 * and edited.
 *
 * Written only where the target is empty. Overwriting a directory with content is
 * never the right answer to "init", because the thing being destroyed is somebody
 * else's work and the person who ran it has no way to know.
 */
import fs from 'node:fs'
import path from 'node:path'

import { say, row, bold, green, dim, warn } from '../ui.mjs'

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, contents)
}

const config = (name) => `import { defineConfig } from '@morgana/sdk'

export default defineConfig({
  name: ${JSON.stringify(name)},
  entry: 'home',
  // Off by default so a fresh project stays readable. Turn it on when you ship.
  minify: false,
  vars: {
    // Public vars are build-time constants and ship to the client. Private vars
    // stay on the server and never enter the build.
    public: { siteName: ${JSON.stringify(name)} },
  },
  hooks: [
    // Run these actions, in order, during compilation.
    { on: 'compile', run: ['hello'] },
  ],
})
`

const helloAction = (name) => `import { defineClientAction } from '@morgana/sdk'

/**
 * The compile lane runs in Node, before anything is served. This is where a
 * project is shaped: pages are created, objects placed on them, state seeded.
 *
 * It runs on every build and must be idempotent — the same input has to produce
 * the same output, or the artefact hash changes for no reason.
 */
export const hello = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    // The page needs an app. \`apps\` is what actually gets deployed — a page that
    // belongs to no app compiles fine but has nothing to be served as, so
    // \`morgana deploy\` would have nothing to publish.
    ctx.apps.create('main', { displayName: ${JSON.stringify(name)} })

    const page = ctx.ui.pages.create({
      name: 'home',
      address: '/',
      // A browser asks for /favicon.ico whether or not the page declares one, and
      // \`morgana deploy\` treats that 404 as a console error — so a scaffold that
      // ships no icon fails its own verification on a clean run.
      favicon: '/assets/favicon.svg',
    })
    page.app('main')

    const hero = ctx.ui.box({ id: 'hero' })
    hero.make('card')
    hero.setProps({ layout: 'column', pad: 6, gap: 3 })

    const title = ctx.ui.text({ id: 'title', content: 'Hello from Morgana', font: 'h2' })
    const body = ctx.ui.text({
      id: 'body',
      content: 'Edit src/actions/compile/hello.ts, then run: morgana dev',
      font: 'body',
    })

    hero.place(title)
    hero.place(body)
    page.place(hero)

    return { ok: true }
  },
})
`

const favicon = (name) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${name}">
  <rect width="64" height="64" rx="14" fill="#18181B"/>
  <path d="M20 44 L32 18 L44 44" fill="none" stroke="#A855F7" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`

const gitignore = `node_modules/
dist/
.morgana/
.wrangler/
*.log
.env*
!.env.example
`

const packageJson = (name) => `${JSON.stringify(
  {
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'morgana build',
      dev: 'morgana dev',
      deploy: 'morgana deploy',
    },
    dependencies: {
      '@morgana/sdk': '^0.3.0',
    },
    devDependencies: {
      '@morgana/sdk-compile': '^0.1.0',
    },
  },
  null,
  2,
)}\n`

const readme = (name) => `# ${name}

\`\`\`bash
morgana dev      # compile and serve on http://localhost:4317
morgana build    # compile to dist/
morgana deploy   # build, publish, and verify in a real browser
\`\`\`

Start with \`src/actions/compile/hello.ts\`. Actions with \`config: { on: 'compile' }\`
run at build time and shape the page; actions with a runtime \`on\` selector fire
in the browser or on the server.
`

export function init({ name = 'my-morgana-app', force = false } = {}) {
  const dir = path.resolve(process.cwd(), name)
  const pkg = path.basename(dir)

  if (fs.existsSync(dir) && fs.readdirSync(dir).length && !force) {
    throw new Error(
      `${dir} already exists and is not empty — init does not overwrite.\n` +
        '  Choose another name, or remove the directory yourself if it is scratch.',
    )
  }

  writeFile(path.join(dir, 'morgana.config.ts'), config(pkg))
  writeFile(path.join(dir, 'src', 'actions', 'compile', 'hello.ts'), helloAction(pkg))
  writeFile(path.join(dir, 'src', 'actions', 'server', '.gitkeep'), '')
  writeFile(path.join(dir, 'src', 'objects', '.gitkeep'), '')
  writeFile(path.join(dir, 'assets', 'favicon.svg'), favicon(pkg))
  writeFile(path.join(dir, 'package.json'), packageJson(pkg))
  writeFile(path.join(dir, '.gitignore'), gitignore)
  writeFile(path.join(dir, 'README.md'), readme(pkg))

  say(`${green('created')} ${bold(pkg)}`)
  say()
  for (const f of [
    'morgana.config.ts',
    'src/actions/compile/hello.ts',
    'assets/favicon.svg',
    'package.json',
    '.gitignore',
    'README.md',
  ]) {
    say(row(f, ''))
  }
  say()
  say(dim('next:'))
  say(`  cd ${pkg}`)
  say('  npm install')
  say('  npx morgana dev')
  say()
  warn('The generated action is a starting point, not a template to keep — edit it.')

  return dir;
}
