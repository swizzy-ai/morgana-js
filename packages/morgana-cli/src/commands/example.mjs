/**
 * `morgana example [name]` — print an annotated example project as markdown.
 *
 * Built for agents: one document with the whole project, commented, so a writer
 * can copy the shape instead of reading the docs. The markdown is generated from
 * the example's own source (examples/<name>/scripts/build-guide.mjs), so the code
 * it prints builds. It is written to stdout, plain, so it can be piped or saved.
 */
import { template } from '../templates.mjs'

export const EXAMPLES = {
  'kanban-ai': {
    file: 'examples/kanban-ai.md',
    summary: 'a kanban board: live backend, sign-in, AI planning, Swizzy look',
  },
}

export function example({ name = '', list = false } = {}) {
  if (list || !name) {
    const lines = Object.entries(EXAMPLES).map(([key, e]) => `  ${key.padEnd(12)} ${e.summary}`)
    process.stdout.write(['Examples (print one with: morgana example <name>)', ...lines, ''].join('\n'))
    return
  }
  const entry = EXAMPLES[name]
  if (!entry) throw new Error(`no example "${name}" — run \`morgana example --list\` to see them`)
  process.stdout.write(template(entry.file))
}
