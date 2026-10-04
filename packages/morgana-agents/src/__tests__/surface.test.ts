import { describe, expect, it } from 'vitest'
import { buildAgentSurface } from '../context'
import { createModel, type ChatTransport } from '../model'
import { ProjectRegistries, type AgentsHost } from '../index'
import { memoryStore } from './memory-store'

/**
 * The whole surface, end to end: declare a tool, declare an agent, run a task,
 * have the model call the tool, get an answer back.
 *
 * Nothing here reaches a network or a KV namespace. The point is that the pieces
 * the runtime wires together actually fit — a registry that stores a
 * declaration, a handle that reads it back, a loop that finds the tool, and a
 * runner that reaches an action.
 */

/** Answers Nanoagent's control question with "no" so it costs one scripted line. */
function isControlQuestion(messages: unknown): boolean {
  return JSON.stringify(messages ?? '').includes('explicitly require the user to respond')
}

function scriptedTransport(replies: Array<Record<string, unknown>>): ChatTransport & {
  calls: Array<Record<string, unknown>>
} {
  let turn = 0
  const calls: Array<Record<string, unknown>> = []
  return {
    label: 'scripted',
    model: 'scripted',
    calls,
    async send(body) {
      calls.push(body)
      if (isControlQuestion(body.messages)) return { text: 'no' }
      return replies[Math.min(turn++, replies.length - 1)] ?? { text: '' }
    },
  }
}

describe('ctx.ai.agents and ctx.ai.tools', () => {
  it('runs a task that calls a registered tool', async () => {
    const store = memoryStore()
    const transport = scriptedTransport([
      { tool_calls: [{ id: 'c1', function: { name: 'listTasks', arguments: '{}' } }] },
      { text: 'There are 3 open tasks.' },
    ])
    const ran: Array<{ name: string; args: Record<string, unknown> }> = []
    const events: Array<{ event: string }> = []

    const built = buildAgentSurface({
      registries: new ProjectRegistries({ store, prefix: 'agents:production:p1' }),
      transport,
      run: async (name, args) => {
        ran.push({ name, args })
        return { count: 3 }
      },
      publish: () => {},
      emit: (event) => events.push({ event }),
    })

    await built.tools.register('listTasks', { describe: 'Every open task, newest first.' })
    const mary = await built.agents.create('mary', {
      instruction: 'You manage tasks. Be terse.',
      description: 'Task completion agent',
    })

    const result = await mary.run('How many are open?', { tools: ['listTasks'] })

    expect(result.output).toBe('There are 3 open tasks.')
    expect(result.finishReason).toBe('stop')
    expect(ran).toEqual([{ name: 'listTasks', args: {} }])
    expect(result.calls).toEqual([{ name: 'listTasks', args: {} }])
    expect(events.map((e) => e.event)).toEqual([
      'agent:task:started',
      'agent:tool:called',
      'agent:task:completed',
    ])
  })

  it('publishes an agent to a second reader of the same storage', async () => {
    const store = memoryStore()
    const make = () =>
      buildAgentSurface({
        registries: new ProjectRegistries({ store, prefix: 'agents:production:p1' }),
        transport: scriptedTransport([{ text: 'ok' }]),
        run: async () => null,
        publish: () => {},
        emit: () => {},
      })

    const writer = make()
    await writer.agents.create('mary', { instruction: 'You manage tasks.' })
    await writer.tools.register('listTasks', { describe: 'Every open task.' })

    // A different Durable Object, a different request, the same project.
    const reader = make()
    const mary = await reader.agents.get('mary')
    expect(mary?.instruction).toBe('You manage tasks.')
    expect((await reader.agents.list()).map((a) => a.name)).toEqual(['mary'])
    expect((await reader.tools.list()).map((t) => t.name)).toEqual(['listTasks'])
    expect((await reader.tools.get('listTasks'))?.describe).toBe('Every open task.')
  })

  it('refuses a tool that was never registered, before spending a model call', async () => {
    const transport = scriptedTransport([{ text: 'unused' }])
    const built = buildAgentSurface({
      registries: new ProjectRegistries({ store: memoryStore(), prefix: 'agents:production:p1' }),
      transport,
      run: async () => null,
      publish: () => {},
      emit: () => {},
    })

    const mary = await built.agents.create('mary', { instruction: 'x' })
    await expect(mary.run('go', { tools: ['ghost'] })).rejects.toThrow(/is not registered/)
    // Refused before the provider was called: a run that believes it has tools
    // and cannot call them is worse than one that plainly has none.
    expect(transport.calls).toHaveLength(0)
  })

  it('refuses to run an agent that was never declared', async () => {
    const built = buildAgentSurface({
      registries: new ProjectRegistries({ store: memoryStore(), prefix: 'agents:production:p1' }),
      transport: scriptedTransport([{ text: 'x' }]),
      run: async () => null,
      publish: () => {},
      emit: () => {},
    })

    expect(await built.agents.get('ghost')).toBeUndefined()
    expect(await built.agents.has('ghost')).toBe(false)
  })

  it('gives a handle a plain-string instruction, not a promise', async () => {
    const built = buildAgentSurface({
      registries: new ProjectRegistries({ store: memoryStore(), prefix: 'agents:production:p1' }),
      transport: scriptedTransport([{ text: 'x' }]),
      run: async () => null,
      publish: () => {},
      emit: () => {},
    })

    const mary = await built.agents.create('mary', {
      instruction: 'You manage tasks.',
      description: 'Task completion agent',
    })
    expect(typeof mary.instruction).toBe('string')
    expect(mary.instruction).toBe('You manage tasks.')
    expect(mary.description).toBe('Task completion agent')
    expect(mary.name).toBe('mary')
  })

  it('updates through a new handle and leaves the old snapshot alone', async () => {
    const built = buildAgentSurface({
      registries: new ProjectRegistries({ store: memoryStore(), prefix: 'agents:production:p1' }),
      transport: scriptedTransport([{ text: 'x' }]),
      run: async () => null,
      publish: () => {},
      emit: () => {},
    })

    const mary = await built.agents.create('mary', { instruction: 'first' })
    const updated = await mary.update({ instruction: 'second' })

    expect(updated.instruction).toBe('second')
    expect(mary.instruction).toBe('first')
    expect((await built.agents.get('mary'))?.instruction).toBe('second')
  })
})