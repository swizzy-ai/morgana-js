/**
 * Port resolution for `morgana dev` — every spelling lands on the same number.
 *
 * The gap this locks in: a bare `morgana dev 3000` used to parse cleanly and
 * then serve on 4317 anyway, because the positional was never read. And a
 * non-numeric port sailed through `Number()` as NaN into `server.listen`.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { parseArgs, str, positional, UsageError } from '../args.mjs'
import { COMMANDS, resolveDevPort } from '../commands.mjs'

const flags = COMMANDS.dev.flags

function resolve(argv, envPort) {
  const prev = process.env.PORT
  try {
    if (envPort === undefined) delete process.env.PORT
    else process.env.PORT = envPort
    const args = parseArgs(argv, { flags })
    return resolveDevPort(args, { str, positional })
  } finally {
    if (prev === undefined) delete process.env.PORT
    else process.env.PORT = prev
  }
}

afterEach(() => {
  delete process.env.PORT
})

describe('resolveDevPort', () => {
  it('takes --port, --port=, -P, and a bare positional alike', () => {
    expect(resolve(['--port', '3000'])).toBe(3000)
    expect(resolve(['--port=3000'])).toBe(3000)
    expect(resolve(['-P', '3000'])).toBe(3000)
    expect(resolve(['3000'])).toBe(3000)
  })

  it('defaults to 4317, honoring $PORT when no spelling is given', () => {
    expect(resolve([])).toBe(4317)
    expect(resolve([], '5000')).toBe(5000)
  })

  it('prefers --port over the positional and $PORT', () => {
    expect(resolve(['--port', '3000', '4000'], '5000')).toBe(3000)
    expect(resolve(['4000'], '5000')).toBe(4000)
  })

  it('rejects garbage instead of serving NaN', () => {
    for (const argv of [['--port', 'abc'], ['nope'], ['--port', '0'], ['--port', '99999']]) {
      expect(() => resolve(argv)).toThrow(UsageError)
    }
  })
})
