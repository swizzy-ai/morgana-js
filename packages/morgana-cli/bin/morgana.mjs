#!/usr/bin/env node
/**
 * `morgana` — the CLI entry point.
 *
 * Wires the command table to the parser and owns the exit path. Commands live in
 * `src/commands.mjs` and `src/worker-commands.mjs`; this file only dispatches,
 * prints help, and turns an exception into an exit code.
 *
 * Exit codes: 0 success, 1 failure. Failures set `process.exitCode` rather than
 * calling `process.exit`. A hard exit with a keep-alive socket still open makes
 * Node abort inside libuv, which replaces the real diagnosis with a crash — and a
 * CLI that talks to a worker over HTTP cannot afford to lose its error message.
 */
import process from 'node:process'

import { parseArgs, str, bool, positional, UsageError } from '../src/args.mjs'
import { say, warn, dim, bold, cyan, red } from '../src/ui.mjs'
import { COMMANDS } from '../src/commands.mjs'
import { WORKER_COMMANDS } from '../src/worker-commands.mjs'

const VERSION = '0.1.0'

/** One table, assembled from both halves, in a deliberate order for `--help`. */
const ALL = { ...COMMANDS, ...WORKER_COMMANDS }

function help() {
  say(`${bold('morgana')} ${dim(`v${VERSION}`)} — build and deploy a Morgana project`)
  say()
  say(bold('usage'))
  say('  morgana <command> [options]')
  say()
  say(bold('commands'))
  const width = Math.max(...Object.keys(ALL).map((c) => c.length))
  for (const [name, cmd] of Object.entries(ALL)) {
    say(`  ${cyan(name.padEnd(width))}  ${cmd.describe}`)
  }
  say()
  say(bold('options'))
  say('  -h, --help     show this')
  say('  -v, --version  print the version')
  say()
  say(bold('getting started'))
  say('  morgana init my-app && cd my-app')
  say('  npm install && npx morgana deploy --url https://your-worker.workers.dev')
  say()
  say(dim('run `morgana <command> --help` for the options a command takes'))
}

function commandHelp(name, cmd) {
  say(`${bold('morgana')} ${bold(name)} — ${cmd.describe}`)
  say()
  say(bold('usage'))
  say(`  ${cmd.usage}`)
  const entries = Object.entries(cmd.flags ?? {})
  if (!entries.length) return
  const width = Math.max(...entries.map(([f]) => f.length))
  say()
  say(bold('options'))
  for (const [flag, spec] of entries) {
    const short = spec.short ? `-${spec.short}, ` : '    '
    say(`  ${short}--${flag.padEnd(width)}  ${spec.describe ?? ''}`)
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const name = argv[0]

  if (!name || name === '-h' || name === '--help' || name === 'help') {
    help()
    return
  }
  if (name === '-v' || name === '--version' || name === 'version') {
    say(VERSION)
    return
  }

  const cmd = ALL[name]
  if (!cmd) {
    // A near miss is worth a suggestion: "veriy" should not cost a trip to docs.
    const near = Object.keys(ALL).filter((c) => c.startsWith(name[0]) && Math.abs(c.length - name.length) <= 2)
    warn(`${red('unknown command')} ${bold(name)}`)
    if (near.length) warn(`  did you mean: ${near.join(', ')}?`)
    warn(`  run ${bold('morgana --help')} for the list`)
    process.exitCode = 1
    return
  }

  const rest = argv.slice(1)
  if (rest.includes('--help') || rest.includes('-h')) {
    commandHelp(name, cmd)
    return
  }

  const args = parseArgs(rest, { flags: cmd.flags ?? {} })
  await cmd.run(args, { str, bool, positional })
}

main().catch((err) => {
  // A usage error is a typo, so it gets one line and a hint. Anything else is a
  // real failure and gets its message verbatim — the deploy path puts
  // the actionable detail in the message on purpose.
  if (err instanceof UsageError) {
    warn(`${red('error')} ${err.message}`)
  } else {
    warn(`\n${red('FAILED')} — ${err?.message ?? err}`)
  }
  process.exitCode = 1
})
