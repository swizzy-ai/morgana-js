import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import http from 'node:http'

import { buildAi, extractJson, fileStore } from '../ai.mjs'

/**
 * The local `ctx.ai`, against a stand-in for the cloud LLM route.
 *
 * This is the test that matters for local dev: the loop must reach a completion
 * through HTTP, call an action as a tool, and answer — with no second
 * implementation of the loop anywhere in sight.
 */

const ENV_KEYS = [
  'MORGANA_URL',
  'MORGANA_LLM_URL',
  'MORGANA_LLM_PROVIDER',
  'MORGANA_LLM_MODEL',
  'MORGANA_LLM_KEY',
  'MORGANA_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
]

/**
 * Run `fn` with a known environment.
 *
 * Async, and deliberately so. A synchronous version restores the environment in
 * its `finally` as soon as `fn()` *returns*, which for an async `fn` is before
 * its body has run — so every provider lookup inside it happened against the
 * real environment instead of the one under test. That reads as "the config is
 * ignored" rather than as a helper bug.
 */
async function withEnv(values, fn) {
  const saved = {}
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
  try {
    return await fn()
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-ai-'))
}

/** A stand-in for `POST /api/v1/llm/generate`. */
async function cloudLlm(handler) {
  const received = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}')
      received.push(parsed)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(handler(parsed)))
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}`, received, close: () => server.close() }
}

const noChannels = { publish: async () => {} }

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('reads through markdown fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('reads through surrounding prose', () => {
    expect(extractJson('Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 })
  })

  it('returns null for prose', () => {
    expect(extractJson('There is no JSON here.')).toBeNull()
  })

  it('returns null rather than throwing on malformed JSON', () => {
    expect(extractJson('{oops')).toBeNull()
  })
})

describe('fileStore', () => {
  it('round-trips a value and survives a new reader', async () => {
    const file = path.join(tempDir(), 'nested', 'agents.json')
    const store = fileStore(file)
    await store.put('a:1', { name: 'mary', instruction: 'x' })

    // A second reader is a second process as far as this file is concerned, which
    // is the property that stops `morgana dev` forgetting every agent on restart.
    const reopened = fileStore(file)
    expect(await reopened.get('a:1')).toEqual({ name: 'mary', instruction: 'x' })
  })

  it('lists by prefix', async () => {
    const store = fileStore(path.join(tempDir(), 'agents.json'))
    await store.put('agents:local:default:mary', { n: 1 })
    await store.put('agents:local:default:john', { n: 2 })
    await store.put('other:thing', { n: 3 })
    expect((await store.keys('agents:local:default:')).sort()).toEqual([
      'agents:local:default:john',
      'agents:local:default:mary',
    ])
  })

  it('treats an unreadable file as empty', async () => {
    const file = path.join(tempDir(), 'agents.json')
    fs.writeFileSync(file, '{ not json', 'utf8')
    expect(await fileStore(file).get('a:1')).toBeNull()
  })
})

describe('local ctx.ai', () => {
  it('refuses every agent method by name when no provider is configured', async () => {
    // Every method is async, so a refusal is a rejected promise rather than a
    // throw. Asserted as one, because `expect(fn).toThrow()` would pass here for
    // the wrong reason: the function returns a promise, it never throws.
    await withEnv({}, async () => {
      const ai = await buildAi({ enabledActions: [], runAction: async () => null, dataDir: tempDir(), channels: noChannels, log: () => {} })
      expect(ai.models.text).toBeTruthy()
      await expect(ai.agents.create('mary', { instruction: 'x' })).rejects.toThrow(/MORGANA_URL/)
      await expect(ai.agents.list()).rejects.toThrow(/MORGANA_URL/)
      await expect(ai.tools.register('listTasks')).rejects.toThrow(/MORGANA_URL/)
      await expect(ai.generateText({ instructions: 'hi' })).rejects.toThrow(/MORGANA_URL/)
      await expect(ai.generateObject({ instructions: 'hi' })).rejects.toThrow(/MORGANA_URL/)
    })
  })

  it('generates text through the cloud route', async () => {
    const cloud = await cloudLlm(() => ({ model: 'm', text: 'hello there', tool_calls: [] }))
    try {
      await withEnv({ MORGANA_URL: cloud.url }, async () => {
        const ai = await buildAi({ enabledActions: [], runAction: async () => null, dataDir: tempDir(), channels: noChannels, log: () => {} })
        expect(await ai.generateText({ instructions: 'say hello' })).toBe('hello there')
        expect(cloud.received[0].instructions).toBe('say hello')
        expect(cloud.received[0].stream).toBe(false)
      })
    } finally {
      cloud.close()
    }
  })

  it('reads a JSON answer out of prose for generateObject', async () => {
    const cloud = await cloudLlm(() => ({ text: 'Sure:\n```json\n{"count":2}\n```' }))
    try {
      await withEnv({ MORGANA_URL: cloud.url }, async () => {
        const ai = await buildAi({ enabledActions: [], runAction: async () => null, dataDir: tempDir(), channels: noChannels, log: () => {} })
        expect(await ai.generateObject({ instructions: 'count' })).toEqual({ count: 2 })
      })
    } finally {
      cloud.close()
    }
  })

  it('runs an agent that calls a deployed action as a tool', async () => {
    let turn = 0
    const cloud = await cloudLlm((body) => {
      // Nanoagent asks the model whether it wants user input before it checks
      // `isFinal`. That is the framework's question, not the agent's, and it gets
      // answered from here so the script stays two lines.
      if (JSON.stringify(body.messages ?? '').includes('explicitly require the user to respond')) {
        return { text: 'no' }
      }
      return turn++ === 0
        ? { tool_calls: [{ id: 'c1', function: { name: 'listTasks', arguments: '{}' } }], text: '' }
        : { text: 'There are 2 open tasks.', tool_calls: [] }
    })

    try {
      await withEnv({ MORGANA_URL: cloud.url }, async () => {
        const ran = []
        const events = []
        const ai = await buildAi({
          enabledActions: ['listTasks'],
          runAction: async (name, args) => {
            ran.push({ name, args })
            return [{ id: 't1' }, { id: 't2' }]
          },
          dataDir: tempDir(),
          channels: noChannels,
          log: (line) => events.push(line),
        })

        await ai.tools.register('listTasks', { describe: 'Every open task.' })
        const mary = await ai.agents.create('mary', { instruction: 'You manage tasks.' })

        const result = await mary.run('How many are open?', { tools: ['listTasks'] })

        expect(result.output).toBe('There are 2 open tasks.')
        expect(result.finishReason).toBe('stop')
        expect(ran).toEqual([{ name: 'listTasks', args: {} }])
        expect(events.some((e) => e.startsWith('agent:task:started'))).toBe(true)
        expect(events.some((e) => e.startsWith('agent:task:completed'))).toBe(true)
      })
    } finally {
      cloud.close()
    }
  })

  it('keeps agents across a fresh host, which is the whole point', async () => {
    const cloud = await cloudLlm(() => ({ text: 'ok', tool_calls: [] }))
    const dataDir = tempDir()
    try {
      await withEnv({ MORGANA_URL: cloud.url }, async () => {
        const make = () =>
          buildAi({ enabledActions: [], runAction: async () => null, dataDir, channels: noChannels, log: () => {} })


        const first = await make()
        await first.tools.register('closeTask', { describe: 'Close a task.' })
        await first.agents.create('mary', { instruction: 'You manage tasks.' })

        // A restart is a new host reading the same file. An agent that did not
        // survive it would make every local test of a durable agent meaningless.
        const second = await make()
        expect((await second.agents.get('mary'))?.instruction).toBe('You manage tasks.')
        expect((await second.tools.get('closeTask'))?.describe).toBe('Close a task.')
      })
    } finally {
      cloud.close()
    }
  })

  it('refuses a tool whose action this host does not run', async () => {
    const cloud = await cloudLlm((body) => {
      if (JSON.stringify(body.messages ?? '').includes('explicitly require the user to respond')) {
        return { text: 'no' }
      }
      return { tool_calls: [{ id: 'c1', function: { name: 'ghost', arguments: '{}' } }], text: '' }
    })
    try {
      await withEnv({ MORGANA_URL: cloud.url }, async () => {
        const ai = await buildAi({ enabledActions: [], runAction: async () => null, dataDir: tempDir(), channels: noChannels, log: () => {} })
        await ai.tools.register('ghost', { describe: 'Not deployed.' })
        const mary = await ai.agents.create('mary', { instruction: 'x' })
        const result = await mary.run('go', { tools: ['ghost'] })
        // The model is told, rather than the run dying on a call into nothing.
        expect(JSON.stringify(cloud.received)).toContain('is not deployed on this host')
        expect(result.finishReason).toBe('turn_cap')
      })
    } finally {
      cloud.close()
    }
  })
})