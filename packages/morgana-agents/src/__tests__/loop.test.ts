import { describe, expect, it } from 'vitest'
import { runAgent, AGENT_EVENTS, buildMessages } from '../loop'
import { readCalls, readText, type ChatTransport } from '../model'
import type { AgentHost } from '../loop'
import type { ToolDeclaration } from '../types'

/**
 * A transport that replays scripted responses.
 *
 * Nanoagent's `stepAgent` asks the model whether it wants user input before it
 * checks `isFinal`, so every prose turn costs a second call. Those are answered
 * here from the guideline text in the request rather than from the script, so a
 * test says what it means: "here is what the model said", not "here is what the
 * model said twice".
 */
function scripted(replies: Array<Record<string, unknown>>, label = 'test'): ChatTransport {
  let turn = 0
  const sent: Array<Record<string, unknown>> = []

  return {
    label,
    model: 'scripted',
    async send(body) {
      sent.push(body)
      const system = JSON.stringify((body.messages as Array<{ content?: string }>)?.[0]?.content ?? '')
      if (system.includes('explicitly require the user to respond')) {
        return { text: 'no' }
      }
      const next = replies[Math.min(turn, replies.length - 1)]
      turn++
      return next ?? { text: '' }
    },
    sent: () => sent,
  } as ChatTransport & { sent: () => Array<Record<string, unknown>> }
}

function host(overrides: Partial<AgentHost> = {}) {
  const events: Array<{ event: string; payload: any }> = []
  const published: Array<{ channel: string; payload: any }> = []
  return {
    events,
    published,
    host: {
      async specs(names: string[]) {
        return names.map((name) => ({
          name,
          description: `Runs ${name}.`,
          schema: { type: 'object', properties: {} },
        }))
      },
      async run() {
        return { ok: true }
      },
      publish(channel: string, payload: any) {
        published.push({ channel, payload })
      },
      emit(event: string, payload: any) {
        events.push({ event, payload })
      },
      ...overrides,
    } as AgentHost,
  }
}

const DECLARATIONS: Record<string, ToolDeclaration> = {
  listTasks: { describe: 'Every open task, newest first.' },
  closeTask: { describe: 'Close a task with a reason.', params: { id: 'string' } },
}

const agent = { name: 'mary', instruction: 'You manage tasks. Be terse.' }

describe('buildMessages', () => {
  it('puts the instruction first, then tools, then context, then the task', () => {
    const messages = buildMessages(agent, 'Close the done ones', {
      tools: ['listTasks'],
      declarations: DECLARATIONS,
      context: { user: 'ada@example.com' },
    })

    // System, context, task. No history was given, so there is nothing between.
    expect(messages).toHaveLength(3)
    const [system, ctx, task] = messages

    const systemText = (system.content as { text: string }).text
    expect(systemText.startsWith('You manage tasks. Be terse.')).toBe(true)
    expect(systemText).toContain('- listTasks: Every open task, newest first.')

    expect((ctx.content as { text: string }).text).toContain('ada@example.com')
    expect((task.content as { text: string }).text).toBe('Close the done ones')
  })

  it('says so plainly when a tool has no description', () => {
    const messages = buildMessages(agent, 'go', { tools: ['mystery'], declarations: {} })
    expect((messages[0].content as { text: string }).text).toContain(
      '- mystery: Runs the "mystery" action. No description was registered.',
    )
  })

  it('appends run instructions after the standing one', () => {
    const messages = buildMessages(agent, 'go', {
      tools: [],
      declarations: {},
      instructions: 'Answer in one sentence.',
    })
    expect((messages[0].content as { text: string }).text).toContain('Answer in one sentence.')
  })
})

describe('runAgent', () => {
  it('answers in prose when no tool is called', async () => {
    const t = scripted([{ text: 'Nothing to close.' }])
    const { host: h, events } = host()

    const result = await runAgent({ host: h, transport: t, agent, declarations: {}, task: 'What is open?' })

    expect(result.output).toBe('Nothing to close.')
    expect(result.finishReason).toBe('stop')
    expect(result.truncated).toBe(false)
    expect(result.calls).toEqual([])
    expect(events.map((e) => e.event)).toEqual([
      AGENT_EVENTS.started,
      AGENT_EVENTS.completed,
    ])
  })

  it('calls a tool, feeds the result back, then answers', async () => {
    const t = scripted([
      { tool_calls: [{ id: 'c1', function: { name: 'listTasks', arguments: '{}' } }] },
      { text: 'Two are done. Closed both.' },
    ])
    const { host: h, events } = host({ run: async (name, args) => ({ tool: name, args }) as any })

    const result = await runAgent({
      host: h,
      transport: t,
      agent,
      declarations: DECLARATIONS,
      task: 'Close what is done',
      options: { tools: ['listTasks', 'closeTask'] },
    })

    expect(result.output).toBe('Two are done. Closed both.')
    expect(result.calls).toEqual([{ name: 'listTasks', args: {} }])
    expect(result.finishReason).toBe('stop')

    const toolEvent = events.find((e) => e.event === AGENT_EVENTS.tool)
    expect(toolEvent?.payload).toMatchObject({ agent: 'mary', tool: 'listTasks' })
  })

  it('hands the tool arguments through unparsed and unchanged', async () => {
    const t = scripted([
      { tool_calls: [{ id: 'c1', function: { name: 'closeTask', arguments: '{"id":"t1"}' } }] },
      { text: 'Done.' },
    ])
    const seen: Array<Record<string, unknown>> = []
    const { host: h } = host({
      run: async (name, args) => {
        seen.push(args)
        return null
      },
    })

    await runAgent({
      host: h,
      transport: t,
      agent,
      declarations: DECLARATIONS,
      task: 'close it',
      options: { tools: ['closeTask'] },
    })

    expect(seen).toEqual([{ id: 't1' }])
  })

  it('keeps arguments the schema never declared', async () => {
    // closeTask declares only `id`. The action may still want `reason`, and a
    // tool loop that rebuilds its arguments object would drop it silently.
    const t = scripted([
      { tool_calls: [{ id: 'c1', function: { name: 'closeTask', arguments: '{"id":"t1","reason":"done"}' } }] },
      { text: 'Done.' },
    ])
    const seen: Array<Record<string, unknown>> = []
    const { host: h } = host({
      run: async (_name, args) => {
        seen.push(args)
        return null
      },
    })

    await runAgent({
      host: h,
      transport: t,
      agent,
      declarations: DECLARATIONS,
      task: 'close it',
      options: { tools: ['closeTask'] },
    })

    expect(seen).toEqual([{ id: 't1', reason: 'done' }])
  })

  it('feeds a failing tool back instead of killing the run', async () => {
    const t = scripted([
      { tool_calls: [{ id: 'c1', function: { name: 'listTasks', arguments: '{}' } }] },
      { text: 'That store is empty, so nothing is open.' },
    ])
    const { host: h, events } = host({
      run: async () => {
        throw new Error('store "tasks" not found')
      },
    })

    const result = await runAgent({
      host: h,
      transport: t,
      agent,
      declarations: DECLARATIONS,
      task: 'What is open?',
      options: { tools: ['listTasks'] },
    })

    expect(result.output).toContain('nothing is open')
    expect(result.finishReason).toBe('stop')
    expect(events.some((e) => e.event === AGENT_EVENTS.failed)).toBe(false)
    // The model saw the error, which is the whole point of feeding it back.
    const sent = (t as any).sent() as Array<Record<string, unknown>>
    // The bodies are JSON, so the quotes in the message are escaped.
    expect(JSON.stringify(sent)).toContain('tasks')
  })

  it('reports a declared-shape violation back to the model', async () => {
    const t = scripted([
      { tool_calls: [{ id: 'c1', function: { name: 'closeTask', arguments: '{}' } }] },
      { text: 'Called again with an id.' },
    ])
    let ran = 0
    const { host: h } = host({
      run: async () => {
        ran++
        return null
      },
    })

    await runAgent({
      host: h,
      transport: t,
      agent,
      declarations: DECLARATIONS,
      task: 'close it',
      options: { tools: ['closeTask'] },
    })

    expect(ran).toBe(0)
    const sent = (t as any).sent() as Array<Record<string, unknown>>
    expect(JSON.stringify(sent)).toContain('is required')
  })

  it('caps the run and says so, rather than pretending it finished', async () => {
    const t = scripted([
      { tool_calls: [{ id: 'c1', function: { name: 'listTasks', arguments: '{}' } }] },
    ])
    const { host: h, events } = host()

    const result = await runAgent({
      host: h,
      transport: t,
      agent,
      declarations: DECLARATIONS,
      task: 'loop forever',
      options: { tools: ['listTasks'] },
    })

    expect(result.truncated).toBe(true)
    expect(result.finishReason).toBe('turn_cap')
    expect(events.find((e) => e.event === AGENT_EVENTS.completed)?.payload).toMatchObject({
      truncated: true,
    })
  })

  it('fails loudly when the provider is unreachable', async () => {
    // Not nudged and retried. A dead provider and an agent that thinks too long
    // both end in `turn_cap`, and only one of those is a real answer — so this
    // has to throw rather than spend the budget on a service already broken.
    const transport: ChatTransport = {
      label: 'broken',
      model: 'm',
      async send() {
        throw new Error('Workers AI 500')
      },
    }
    const { host: h, events } = host()

    await expect(
      runAgent({ host: h, transport, agent, declarations: {}, task: 'go' }),
    ).rejects.toThrow(/Workers AI 500/)

    expect(events.filter((e) => e.event === AGENT_EVENTS.failed)).toHaveLength(1)
    expect(events.filter((e) => e.event === AGENT_EVENTS.completed)).toHaveLength(0)
  })

  it('retries once when a single model call fails, then succeeds', async () => {
    let calls = 0
    const transport: ChatTransport = {
      label: 'flaky',
      model: 'm',
      async send() {
        calls++
        if (calls === 1) throw new Error('connection reset')
        return { text: 'Recovered.' }
      },
    }
    const { host: h } = host()

    // One failure throws out of the loop, so this asserts the honest behaviour:
    // the caller is told, and the run is not reported as finished.
    await expect(
      runAgent({ host: h, transport, agent, declarations: {}, task: 'go' }),
    ).rejects.toThrow(/connection reset/)
  })

  it('emits failed once, and rethrows, when a tool throws past the loop', async () => {
    const transport: ChatTransport = {
      label: 'broken',
      model: 'm',
      async send() {
        throw new Error('Workers AI 500')
      },
    }
    const { host: h, events } = host()

    await expect(
      runAgent({ host: h, transport, agent, declarations: {}, task: 'go' }),
    ).rejects.toThrow(/Workers AI 500/)

    expect(events.filter((e) => e.event === AGENT_EVENTS.failed)).toHaveLength(1)
    expect(events.filter((e) => e.event === AGENT_EVENTS.completed)).toHaveLength(0)
  })

  it('publishes the final answer to a channel when asked', async () => {
    const t = scripted([{ text: 'Nothing open.' }])
    const { host: h, published } = host()

    await runAgent({
      host: h,
      transport: t,
      agent,
      declarations: {},
      task: 'What is open?',
      options: { channel: 'tasks' },
    })

    expect(published).toEqual([{ channel: 'tasks', payload: { agent: 'mary', text: 'Nothing open.', partial: false } }])
  })

  it('publishes each turn when streaming', async () => {
    const t = scripted([
      { tool_calls: [{ id: 'c1', function: { name: 'listTasks', arguments: '{}' } }] },
      { text: 'All closed.' },
    ])
    const { host: h, published } = host()

    await runAgent({
      host: h,
      transport: t,
      agent,
      declarations: DECLARATIONS,
      task: 'close them',
      options: { tools: ['listTasks'], channel: 'tasks', stream: true },
    })

    // The tool turn said nothing, and a channel is a conversation — posting an
    // empty message to say nothing happened is noise.
    const texts = published.map((p) => p.payload.text).filter(Boolean)
    expect(texts).toEqual(['All closed.'])
    expect(published.every((p) => p.payload.partial === true)).toBe(true)
    // And no summary at the end, because the conversation already has the answer.
    expect(published.filter((p) => p.payload.partial === false)).toEqual([])
  })

  it('reports a tool the model invented as an error, not a result', async () => {
    const t = scripted([
      { tool_calls: [{ id: 'c1', function: { name: 'notRegistered', arguments: '{}' } }] },
      { text: 'I could not do that.' },
    ])
    const { host: h } = host()

    const result = await runAgent({
      host: h,
      transport: t,
      agent,
      declarations: DECLARATIONS,
      task: 'go',
      options: { tools: ['listTasks'] },
    })

    const sent = (t as any).sent() as Array<Record<string, unknown>>
    expect(JSON.stringify(sent)).toContain('no tool called')
    expect(result.finishReason).toBe('stop')
  })
})

describe('response reading', () => {
  it('reads the Morgana route shape', () => {
    expect(readText({ model: 'x', text: 'hello', tool_calls: [] })).toBe('hello')
    expect(readCalls({ tool_calls: [{ id: 'a', function: { name: 'n', arguments: '{"k":1}' } }] })).toEqual([
      { name: 'n', args: { k: 1 } },
    ])
  })

  it('reads an OpenAI choices envelope', () => {
    const raw = { choices: [{ message: { content: 'hi', tool_calls: [] } }] }
    expect(readText(raw)).toBe('hi')
  })

  it('reads a raw Workers AI binding response', () => {
    expect(readText({ response: 'bound' })).toBe('bound')
    expect(readText({ output: [{ content: [{ text: 'a' }] }, { text: 'b' }] })).toBe('ab')
  })

  it('reads an Ollama message envelope', () => {
    const raw = { message: { content: 'hey', tool_calls: [{ function: { name: 'go', arguments: {} } }] } }
    expect(readText(raw)).toBe('hey')
    expect(readCalls(raw)).toEqual([{ name: 'go', args: {} }])
  })

  it('reads Anthropic content blocks', () => {
    const raw = {
      content: [
        { type: 'text', text: 'sure' },
        { type: 'tool_use', name: 'closeTask', input: { id: 't1' } },
      ],
    }
    expect(readText(raw)).toBe('sure')
    expect(readCalls(raw)).toEqual([{ name: 'closeTask', args: { id: 't1' } }])
  })

  it('reads a JSON envelope from a model that does not do tool calls', () => {
    expect(readCalls({ text: 'sure {"tool":"closeTask","args":{"id":"t1"}}' })).toEqual([
      { name: 'closeTask', args: { id: 't1' } },
    ])
  })

  it('treats prose as no tool call', () => {
    expect(readCalls({ text: 'The answer is 41.' })).toEqual([])
  })

  it('survives a malformed argument blob', () => {
    expect(readCalls({ tool_calls: [{ id: 'a', function: { name: 'n', arguments: '{oops' } }] })).toEqual([
      { name: 'n', args: {} },
    ])
  })
})
