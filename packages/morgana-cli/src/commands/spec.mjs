/**
 * `morgana spec [topic]` — the API surface, generated from the installed SDK.
 *
 *   morgana spec                   topics
 *   morgana spec server-object     one topic
 *   morgana spec ui button         one built-in kind's props and handle
 *   morgana spec --all             everything, one document
 *   morgana spec <topic> --json    structured, for tools
 *
 * The docs explain; this lists. It reads the SDK's own types and doc comments,
 * so it is exact for the version this project has installed.
 */
import { buildSpec, renderAllSpecs, renderSpec, specTopics } from '@studiomorgana/sdk-compile'

import { say, row, dim } from '../ui.mjs'

export function spec({ words = [], json = false, all = false } = {}) {
  if (all) {
    process.stdout.write(renderAllSpecs())
    return
  }
  if (!words.length) {
    if (json) return void process.stdout.write(JSON.stringify(specTopics(), null, 2) + '\n')
    say('morgana spec <topic>')
    say()
    for (const t of specTopics()) say(row(t.topic, t.summary, 16))
    say()
    say(dim('--all prints every topic as one document; --json prints structured output.'))
    return
  }
  const doc = buildSpec(words.join(' '))
  process.stdout.write(json ? JSON.stringify(doc, null, 2) + '\n' : renderSpec(doc))
}
