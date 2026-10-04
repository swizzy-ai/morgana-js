/**
 * Providers — where a completion actually goes.
 *
 * One transport per shape on the wire, one `Model` over all of them. The default
 * is Morgana's own route, because that is the one a project can use with no
 * credentials at all; the rest are there for a project that brings its own key.
 *
 * Every provider is constructed from a base URL and a model id, never from an
 * ambient global, so a project that needs two models at once gets two
 * providers and never a surprise.
 */

import type { Model } from '@hbbio/nanoagent'
import { createModel, type ChatTransport, type ModelConfig } from '../model'

export interface ProviderOptions {
  /** Where the provider lives. Defaults to each provider's public endpoint. */
  baseUrl?: string
  /** Model id. Each provider has its own default. */
  model?: string
  /** Bearer token or API key, when the provider needs one. */
  token?: string
}

function join(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    // The provider's own message is the useful part of a failure. Truncating to
    // 500 characters keeps a stack trace out of an agent's transcript.
    const detail = (await res.text().catch(() => '')).slice(0, 500)
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`)
  }
  return res.json()
}

// ─── Morgana — our own cloud route ──────────────────────────────────────────

export const DEFAULT_MORGANA_MODEL = '@cf/openai/gpt-oss-120b'

export interface MorganaProviderOptions extends ProviderOptions {
  /**
   * Base URL of the Morgana worker.
   *
   * Required, because the provider is HTTP and cannot guess which deployment it
   * is talking to. Callers inside the worker pass their own origin.
   */
  baseUrl: string
}

/**
 * The Morgana provider — a client of `POST /api/v1/llm/generate`.
 *
 * That route already takes OpenAI-shaped `messages` and `tools` and answers
 * `{ model, text, tool_calls }`, so this is a transport and nothing more. It is
 * the default because it needs no credentials: the route authenticates with the
 * caller's own session.
 *
 * `stream: false` is not optional. The route streams by default, and a streamed
 * body cannot be read as a single completion.
 */
export function createMorganaTransport(options: MorganaProviderOptions): ChatTransport {
  const url = join(options.baseUrl, '/api/v1/llm/generate')
  const model = options.model ?? DEFAULT_MORGANA_MODEL
  const auth: Record<string, string> = options.token
    ? { authorization: `Bearer ${options.token}` }
    : {}

  return {
    label: 'morgana',
    model,
    async send(body, signal) {
      return postJson(url, { ...body, model, stream: false }, auth, signal)
    },
  }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

const OPENAI_BASE = 'https://api.openai.com/v1'

export function createOpenAITransport(options: ProviderOptions = {}): ChatTransport {
  const url = join(options.baseUrl ?? OPENAI_BASE, '/chat/completions')
  const model = options.model ?? 'gpt-4o-mini'
  const auth: Record<string, string> = options.token
    ? { authorization: `Bearer ${options.token}` }
    : {}

  return {
    label: 'openai',
    model,
    async send(body, signal) {
      return postJson(url, { ...body, model }, auth, signal)
    },
  }
}

// ─── Ollama ──────────────────────────────────────────────────────────────────

const OLLAMA_BASE = 'http://localhost:11434'

export function createOllamaTransport(options: ProviderOptions = {}): ChatTransport {
  const url = join(options.baseUrl ?? OLLAMA_BASE, '/api/chat')
  const model = options.model ?? 'llama3.1:8b'

  return {
    label: 'ollama',
    model,
    async send(body, signal) {
      // Ollama takes the same OpenAI-shaped message array, but has no notion of
      // `tool_choice`, and rejects the field rather than ignoring it.
      const { tool_choice: _ignored, ...rest } = body
      return postJson(url, { ...rest, model, stream: false }, {}, signal)
    },
  }
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Anthropic, reached through a translation rather than a pass-through.
 *
 * The shape differs in three places that matter: tools are top-level with an
 * `input_schema`, a tool result is a `tool_result` block inside a *user*
 * message rather than a `tool` message, and the system prompt is its own field.
 * All three are handled here so the rest of the package never has to know which
 * provider it is talking to.
 */
export function createAnthropicTransport(options: ProviderOptions = {}): ChatTransport {
  const url = join(options.baseUrl ?? ANTHROPIC_BASE, '/messages')
  const model = options.model ?? 'claude-sonnet-4-5'
  const headers: Record<string, string> = {
    'anthropic-version': ANTHROPIC_VERSION,
  }
  if (options.token) headers['x-api-key'] = options.token

  return {
    label: 'anthropic',
    model,
    async send(body, signal) {
      const wire = toAnthropic(body, model)
      return postJson(url, wire, headers, signal)
    },
  }
}

function toAnthropic(body: Record<string, unknown>, model: string): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : []

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => String(m.content ?? ''))
    .join('\n\n')

  const wire: Array<Record<string, unknown>> = []
  for (const m of messages) {
    if (m.role === 'system') continue

    if (m.role === 'tool') {
      // A tool result is a user turn carrying a tool_result block, and it has to
      // arrive in the same user turn as its call — so consecutive tool messages
      // merge rather than becoming separate turns the API would reject.
      const block = { type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content ?? '') }
      const last = wire[wire.length - 1]
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        ;(last.content as unknown[]).push(block)
      } else {
        wire.push({ role: 'user', content: [block] })
      }
      continue
    }

    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      const blocks: Array<Record<string, unknown>> = []
      if (m.content) blocks.push({ type: 'text', text: String(m.content) })
      for (const c of m.tool_calls as Array<Record<string, any>>) {
        blocks.push({
          type: 'tool_use',
          id: c.id,
          name: c.function?.name,
          input: safeJson(c.function?.arguments),
        })
      }
      wire.push({ role: 'assistant', content: blocks })
      continue
    }

    wire.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '') })
  }

  const out: Record<string, unknown> = { model, messages: wire, max_tokens: body.max_tokens ?? 4096 }
  if (system) out.system = system
  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = (body.tools as Array<Record<string, any>>).map((t) => ({
      name: t.function?.name,
      description: t.function?.description,
      input_schema: t.function?.parameters ?? { type: 'object', properties: {} },
    }))
  }
  return out
}

function safeJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// ─── Model builders ──────────────────────────────────────────────────────────

/**
 * The model Nanoagent's loop drives, over whichever transport.
 *
 * This is the whole provider surface: a transport plus the tools the run may
 * call. Everything a provider needs beyond that is the model id.
 */
export function providerModel(config: ModelConfig): Model {
  return createModel(config)
}
