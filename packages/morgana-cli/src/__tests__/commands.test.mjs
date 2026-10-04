import { describe, it, expect } from 'vitest'
import { COMMANDS, TARGET_FLAGS, MINIFY_FLAGS, minifyRequested } from '../commands.mjs'
import { WORKER_COMMANDS } from '../worker-commands.mjs'
import { parseArgs, UsageError } from '../args.mjs'

const ALL = { ...COMMANDS, ...WORKER_COMMANDS }

/** Every command the CLI advertises. */
const PLANNED = ['init', 'dev', 'build', 'deploy', 'login', 'logout', 'status']

describe('the command table', () => {
  it('implements every command it advertises', () => {
    for (const name of PLANNED) {
      expect(ALL[name], `morgana ${name} is missing`).toBeTruthy()
    }
  })

  it('gives every command a description and a usage line', () => {
    for (const [name, cmd] of Object.entries(ALL)) {
      expect(cmd.describe, `${name} has no describe`).toBeTruthy()
      expect(cmd.usage, `${name} has no usage`).toContain('morgana')
      expect(typeof cmd.run, `${name} has no run`).toBe('function')
    }
  })

  // A help screen that disagrees with the parser is a help screen that lies.
  // These assertions are the whole reason the flags live in the table: every
  // flag's shape is checked once, against the parser that will consume it.
  it('declares flags the parser accepts', () => {
    for (const [name, cmd] of Object.entries(ALL)) {
      for (const [flag, spec] of Object.entries(cmd.flags ?? {})) {
        expect(['string', 'boolean'], `${name} --${flag} has an odd type`).toContain(spec.type ?? 'string')
        if (spec.short) expect(spec.short.length, `${name} --${flag} short is too long`).toBe(1)
      }
    }
  })

  it('parses each command\'s own help invocation without error', () => {
    for (const [name, cmd] of Object.entries(ALL)) {
      const sample = cmd.flags?.url ? ['--url', 'https://example.test'] : []
      const args = parseArgs(sample, { flags: cmd.flags ?? {} })
      expect(args.positionals, name).toEqual([])
    }
  })

  it('has no duplicate shorthand letters within a command', () => {
    for (const [name, cmd] of Object.entries(ALL)) {
      const shorts = Object.values(cmd.flags ?? {}).map((s) => s.short).filter(Boolean)
      expect(new Set(shorts).size, `${name} reuses a shorthand`).toBe(shorts.length)
    }
  })

  it('gives every command a unique name', () => {
    const names = Object.keys(ALL)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('minify', () => {
  // Three states, not two: unset means "fall back to morgana.config.ts", which is
  // what makes `morgana deploy` respect a project that ships minified.
  it('distinguishes unset from explicitly off', () => {
    expect(minifyRequested(parseArgs([], { flags: MINIFY_FLAGS }))).toBeUndefined()
    expect(minifyRequested(parseArgs(['--no-minify'], { flags: MINIFY_FLAGS }))).toBe(false)
    expect(minifyRequested(parseArgs(['--minify'], { flags: MINIFY_FLAGS }))).toBe(true)
  })
})

describe('target flags', () => {
  it('are shared by every command that talks to a worker', () => {
    for (const name of ['deploy', 'status', 'login', 'logout']) {
      expect(ALL[name].flags.url, `${name} has no --url`).toBeTruthy()
    }
  })

  it('reject a token flag with nothing after it', () => {
    expect(() => parseArgs(['--token', '--url', 'x'], { flags: TARGET_FLAGS })).toThrow(UsageError)
  })
})
