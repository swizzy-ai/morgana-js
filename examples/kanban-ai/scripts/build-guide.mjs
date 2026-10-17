#!/usr/bin/env node
/**
 * Writes the agent guide for this example: the markdown `morgana example kanban-ai`
 * prints. The prose is in guide-template.md; each `<!-- SOURCE -->` marker is
 * replaced by the example's own source files, so the code in the guide is the code
 * that builds and typechecks. Run it after changing the example:
 *
 *   node scripts/build-guide.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const example = path.resolve(here, '..')
const out = path.resolve(example, '../../packages/morgana-cli/templates/examples/kanban-ai.md')

/** The files, in the order a reader should meet them, each with what it is for. */
const FILES = [
  ['morgana.config.ts', 'Project settings: the entry page, fonts and the type scale. Fonts are declared here, never in a page.'],
  ['src/server-objects/board.ts', 'The backend. A server object: durable state, its own table, methods that are transactions, and live events.'],
  ['src/objects/kanban-column.ts', 'A custom UI kind. Built from built-in kinds once, then used like any other `ctx.ui` kind.'],
  ['src/actions/compile/apps.ts', 'The app and its login page. Member-only actions and objects need the visitor signed in here.'],
  ['src/actions/compile/board-page.ts', 'The page, built at compile time. Layout is rows and columns of kinds, styled with props only.'],
  ['src/actions/server/open-board.ts', 'A server action called by name from the browser, with a typed Contract.'],
  ['src/actions/server/plan-card.ts', 'The AI feature. `ctx.ai.generateText` runs on the server; the key never reaches the browser.'],
  ['src/actions/server/move-next.ts', 'A member-only server action that changes data. It checks sign-in in code.'],
  ['src/actions/client/board.ts', 'Browser actions. Each answers one event, and every write goes through the server.'],
]

const fence = (rel) => (rel.endsWith('.ts') ? 'ts' : 'json')
const sourceSection = () =>
  FILES.map(([rel, why]) => {
    const code = fs.readFileSync(path.join(example, rel), 'utf8').replace(/\s+$/, '')
    return `### \`${rel}\`\n\n${why}\n\n\`\`\`${fence(rel)}\n${code}\n\`\`\`\n`
  }).join('\n')

const template = fs.readFileSync(path.join(here, 'guide-template.md'), 'utf8')
if (!template.includes('<!-- SOURCE -->')) throw new Error('guide-template.md has no <!-- SOURCE --> marker')
const guide = template.replace('<!-- SOURCE -->', sourceSection())

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, guide)
console.log(`wrote ${path.relative(process.cwd(), out)} (${fs.statSync(out).size} bytes)`)
