/**
 * The model behind every provider.
 *
 * Nanoagent's `ChatModel` owns the tool loop, and its tool loop validates
 * arguments against the JSON Schema before calling a handler — building a *new*
 * object from the declared properties. A tool with no declared shape would
 * therefore hand the action an empty object, having silently discarded every
 * argument the model sent.
 *
 * So the tool loop is ours, and `Model` is a two-method interface we implement
 * once: `complete` for everyone. What Nanoagent still provides is the part worth
 * borrowing — `stepAgent`'s stuck detection, its halt reasons, and `loopAgent`'s
 * bounded while-loop.
 *
 * Messages are kept in the OpenAI chat-completions shape internally, because
 * every provider we speak accepts that shape or can be translated to it at the
 * edge. The translation belongs in the transport, not here.
 */

import type { Message, Model } from '@hbbio/nanoagent'
import { AssistantMessage, SystemMessage, ToolMessage, UserMessage } from '@hbbio/nanoagent'
import type { AgentStep, ToolCall, ToolResult } from './types'
import type { ToolSchema } from './schema'

/** One tool as the model is told about it. */
export interface ToolSpec {
  name: string
  description: string
  schema: ToolSchema
}

/** How a provider is reached. One POST, one JSON body, one JSON response. */
export interface ChatTransport {
  /** Name used in error messages. */
  label: string
  /** Default model id. A run may override it. */
  model: string
  /** POST the body and return the parsed response. */
  send(body: Record<string, unknown>, signal: AbortSignal): Promise<unknown>
}

export interface ModelConfig {
  transport: ChatTransport
  /** Every tool this run may call. Resolved once per model call. */
  tools: () => Promise<ToolSpec[]>
  /** Run one tool. A throw is reported back to the model, not to the caller. */
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>
  /** Called once per completed turn, as it happens. */
  onStep?: (step: AgentStep) => void
  /** Token cap per model call. */
  maxTokens?: number
  /** Abort the in-flight call when set. */
  signal?: AbortSignal
}

/**
 * Text out of a provider response, across every shape these return.
 *
 * Each of these is a real response body, not a guess: the Morgana route answers
 * `{ model, text, tool_calls }`, OpenAI and Ollama answer `message` (in a
 * `choices` envelope or not), and a direct Workers AI binding answers
 * `{ response }`.
 */
export function readText(raw: any): string {
  if (typeof raw === 'string') return raw
  if (typeof raw?.text === 'string') return raw.text
  if (typeof raw?.response === 'string') return raw.response
  if (typeof raw?.output_text === 'string') return raw.output_text
  if (typeof raw?.message?.content === 'string') return raw.message.content
  const choice = raw?.choices?.[0]?.message
  if (typeof choice?.content === 'string') return choice.content
  if (Array.isArray(raw?.content)) {
    // Anthropic: a content-block array, of which only the text ones are prose.
    return raw.content
      .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('')
  }
  if (Array.isArray(raw?.output)) {
    return raw.output
      .map((o: any) =>
        Array.isArray(o?.content)
          ? o.content.map((cc: any) => cc?.text ?? '').join('')
          : (o?.text ?? ''),
      )
      .join('')
  }
  return ''
}

/**
 * Tool calls out of a provider response, in OpenAI's shape.
 *
 * Both spellings are read because models disagree about which they produce, and
 * a model whose tool calls are silently dropped looks exactly like a model that
 * decided not to use any.
 */
export function readCalls(raw: any): ToolCall[] {
  const native = raw?.tool_calls ?? raw?.message?.tool_calls ?? raw?.choices?.[0]?.message?.tool_calls
  const out: ToolCall[] = []

  if (Array.isArray(native)) {
    for (const c of native) {
      const name = c?.function?.name ?? c?.name
      if (!name) continue
      out.push({ name: String(name), args: parseArgs(c?.function?.arguments ?? c?.arguments) })
    }
    if (out.length) return out
  }

  // Anthropic: tool_use content blocks.
  if (Array.isArray(raw?.content)) {
    for (const block of raw.content) {
      if (block?.type !== 'tool_use') continue
      const name = block?.name
      if (!name) continue
      out.push({
        name: String(name),
        args: (block?.input ?? {}) as Record<string, unknown>,
      })
    }
    if (out.length) return out
  }

  // JSON envelope: {"tool": "readTicket", "args": {"id": 41}}
  const match = /\{[\s\S]*\}/.exec(readText(raw))
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      const name = parsed?.tool ?? parsed?.name
      if (typeof name === 'string' && name) {
        return [{ name, args: (parsed?.args ?? parsed?.arguments ?? {}) as Record<string, unknown> }]
      }
    } catch {
      // Not JSON — it was prose, which is the normal case for a final answer.
    }
  }

  return out
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    // A malformed argument blob is not a reason to abandon the run: the tool
    // gets `{}` and its own check reports what was missing.
    return {}
  }
}

/**
 * Build the `Model` Nanoagent's loop drives.
 *
 * `complete` is one model call plus, when the model asked for tools, one action
 * invocation per call. The tool results go back as tool messages, which is what
 * makes the next call see a coherent history rather than an orphan result.
 */
export function createModel(config: ModelConfig): Model {
  let controller: AbortController | null = null

  return {
    name: config.transport.model,

    async complete<Memory extends Record<string, unknown>>(
      input: readonly Message[],
      options?: { memory?: Memory },
    ): Promise<{ messages: readonly Message[]; memory: Memory }> {
      const memory = (options?.memory ?? {}) as Memory
      const specs = await config.tools()

      const body: Record<string, unknown> = {
        model: config.transport.model,
        messages: toWire(input),
      }
      if (typeof config.maxTokens === 'number' && config.maxTokens > 0) {
        body.max_tokens = config.maxTokens
      }
      if (specs.length) {
        body.tools = specs.map((spec) => ({
          type: 'function',
          function: {
            name: spec.name,
            description: spec.description,
            parameters: spec.schema,
          },
        }))
        body.tool_choice = 'auto'
      }

      if (controller) controller.abort()
      controller = new AbortController()
      const onAbort = () => controller?.abort()
      config.signal?.addEventListener('abort', onAbort)

      let raw: unknown
      try {
        raw = await config.transport.send(body, controller.signal)
      } finally {
        config.signal?.removeEventListener('abort', onAbort)
        controller = null
      }

      const text = readText(raw)
      const calls = readCalls(raw)
      const assistant = AssistantMessage(text, undefined)

      if (!calls.length) {
        config.onStep?.({ text })
        return { messages: [...input, assistant], memory }
      }

      // The assistant turn carries the calls verbatim. Some providers require
      // `tool_calls` echoed back before accepting the matching `tool` messages,
      // so the canonical ids are kept even though only the name and args are
      // used to invoke anything.
      const wireCalls = calls.map((call, index) => ({
        id: `call_${index}_${call.name}`,
        type: 'function' as const,
        function: { name: call.name, arguments: JSON.stringify(call.args) },
      }))
      const assistantWithCalls: Message = {
        role: 'assistant',
        content: { type: 'text', text },
        tool_calls: wireCalls,
      } as Message

      const messages: Message[] = [...input, assistantWithCalls]
      const results: ToolResult[] = []

      for (const [index, call] of calls.entries()) {
        const spec = specs.find((s) => s.name === call.name)
        let result: ToolResult

        if (!spec) {
          // The model asked for something this run was not given. Saying so is
          // the only honest answer — inventing a result would be worse.
          result = {
            name: call.name,
            ok: false,
            error: `There is no tool called "${call.name}" in this run.`,
          }
        } else {
          try {
            const value = await config.call(call.name, call.args)
            result = { name: call.name, ok: true, value }
          } catch (err) {
            // A failing tool is fed back rather than fatal. The model can often
            // recover from "that ticket does not exist"; killing the run throws
            // that away and reports nothing useful.
            result = {
              name: call.name,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }

        results.push(result)
        messages.push({
          role: 'tool',
          tool_call_id: wireCalls[index]!.id,
          content: {
            type: 'text',
            text: JSON.stringify(result.ok ? (result.value ?? null) : { error: result.error }),
          },
        } as Message)
      }

      config.onStep?.({ text: text || undefined, calls, results })
      return { messages, memory }
    },

    async stop(): Promise<void> {
      controller?.abort()
      controller = null
    },
  }
}

/**
 * Nanoagent messages → the wire shape.
 *
 * Content is flattened to a string because every provider in `ChatTransport`
 * takes a string, and a tool result is text by the time it leaves here.
 */
function toWire(messages: readonly Message[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    const base = { role: m.role };
    if (m.role === 'assistant' && Array.isArray((m as any).tool_calls)) {
      return { ...base, content: flatten(m.content), tool_calls: (m as any).tool_calls }
    }
    return { ...base, content: flatten(m.content) }
  })
}

function flatten(content: Message['content']): string {
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  if ('text' in content && typeof content.text === 'string') return content.text
  if ('data' in content) {
    try {
      return JSON.stringify(content.data)
    } catch {
      return String(content.data)
    }
  }
  return ''
}

export { SystemMessage, UserMessage }
