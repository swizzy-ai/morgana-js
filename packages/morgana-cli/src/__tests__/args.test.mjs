import { describe, it, expect } from 'vitest'
import { parseArgs, str, bool, positional, UsageError } from '../args.mjs'

const FLAGS = {
  url: { type: 'string', short: 'u' },
  project: { type: 'string', short: 'p' },
  minify: { type: 'boolean' },
  browser: { type: 'boolean' },
}

const parse = (argv) => parseArgs(argv, { flags: FLAGS })

describe('parseArgs', () => {
  it('reads a long flag and its value', () => {
    const args = parse(['--url', 'https://w.dev'])
    expect(str(args, 'url')).toBe('https://w.dev')
  })

  it('reads --flag=value the same way', () => {
    expect(str(parse(['--url=https://w.dev']), 'url')).toBe('https://w.dev')
  })

  it('reads a single-dash shorthand', () => {
    expect(str(parse(['-u', 'https://w.dev']), 'url')).toBe('https://w.dev')
  })

  it('collects positionals in order', () => {
    const args = parse(['one', '--url', 'x', 'two'])
    expect(args.positionals).toEqual(['one', 'two'])
    expect(positional(args, 1)).toBe('two')
  })

  it('normalises --no-x to x: false', () => {
    expect(bool(parse(['--no-browser']), 'browser')).toBe(false)
    expect(bool(parse(['--browser']), 'browser')).toBe(true)
  })

  // The bug this parser exists to not have: the old `arg()` helper took
  // `process.argv[i + 1]` blindly, so `--token --url x` set the token to the
  // string "--url". A silent wrong value is worse than an error.
  it('refuses to read the next flag as a value', () => {
    expect(() => parse(['--url', '--project', 'demo'])).toThrow(UsageError)
    expect(() => parse(['--url', '--project', 'demo'])).toThrow(/needs a value/)
  })

  it('refuses an unknown flag rather than ignoring it', () => {
    expect(() => parse(['--nope', 'x'])).toThrow(/unknown option/)
  })

  it('refuses a value on a boolean flag', () => {
    expect(() => parse(['--minify=yes'])).toThrow(/does not take a value/)
  })

  it('refuses an unknown shorthand', () => {
    expect(() => parse(['-z'])).toThrow(/unknown option/)
  })

  it('stops parsing after -- and keeps the rest verbatim', () => {
    const args = parse(['--url', 'x', '--', '--not-a-flag', 'raw'])
    expect(str(args, 'url')).toBe('x')
    expect(args.passthrough).toEqual(['--not-a-flag', 'raw'])
  })

  it('reports a missing required flag', () => {
    // An empty argv, not an unknown one: an unrecognised flag is a different
    // error and is reported first, which is the more useful message.
    expect(() => parseArgs([], { flags: FLAGS, required: ['url'] })).toThrow(
      /missing required option/,
    )
  })

  it('returns undefined for an unset flag so "absent" is distinguishable', () => {
    const args = parse([])
    expect(args.values.minify).toBeUndefined()
    // This three-state distinction is why minify is a boolean flag and not a
    // bare --no-minify: the compiler needs "unset" to mean "use the config".
    expect(bool(args, 'minify', true)).toBe(true)
    expect(bool(parse(['--no-minify']), 'minify', true)).toBe(false)
  })
})
