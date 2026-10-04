/**
 * Choosing a provider.
 *
 * ## One place, so nothing has to guess
 *
 * The loop does not know or care which provider answered. What it needs is a
 * `ChatTransport`, and this is the only function that turns configuration into
 * one. That matters because there are now three call sites — the action Durable
 * Object, the objects Durable Object, and the local dev host — and three places
 * that independently decide "which provider" is a decision that will drift.
 *
 * ## Missing configuration is an error, not a fallback
 *
 * Every provider that needs a credential refuses to be constructed without one,
 * and says which field is missing. There is no default key, and no ambient
 * environment read from inside the loop.
 */

import {
  createAnthropicTransport,
  createMorganaTransport,
  createOllamaTransport,
  createOpenAITransport,
} from './providers'
import type { ChatTransport } from './model'

/** Every provider the loop can be pointed at. */
export type ProviderName = 'morgana' | 'openai' | 'anthropic' | 'ollama'

/**
 * How a run reaches a model.
 *
 * `provider` defaults to `morgana`, because that is the one a project can use
 * with no credentials of its own. Everything else is opt-in.
 */
export interface ProviderConfig {
  /** Which provider. Defaults to `morgana`. */
  provider?: ProviderName
  /**
   * Where the provider lives.
   *
   * Required for `morgana` — the loop cannot guess which deployment it is
   * talking to — and defaulted for `openai`, `anthropic` and `ollama`, whose
   * endpoints are fixed and public.
   */
  baseUrl?: string
  /** Model id. Each provider has its own default. */
  model?: string
  /** Bearer token or API key. Required by every provider except `ollama`. */
  token?: string
}

/** The providers, keyed by name, for a config lookup. */
export const PROVIDERS: Record<ProviderName, true> = {
  morgana: true,
  openai: true,
  anthropic: true,
  ollama: true,
}

function requireField(value: string | undefined, field: string, provider: ProviderName): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error(
    `the "${provider}" provider needs ${field}. ` +
      `Set it in morgana.config.ts under vars.private.ai, or in the environment as ` +
      `${envNameFor(provider)}.`,
  )
}

/** The environment variable a credential arrives in, for the error message. */
function envNameFor(provider: ProviderName): string {
  switch (provider) {
    case 'openai':
      return 'OPENAI_API_KEY'
    case 'anthropic':
      return 'ANTHROPIC_API_KEY'
    case 'morgana':
      return 'MORGANA_URL (and MORGANA_TOKEN, unless the caller has a session)'
    case 'ollama':
      return 'nothing — ollama needs no key'
  }
}

/**
 * Build the transport a run's completions go through.
 *
 * Throws by name when a required field is absent. That is the point: a run that
 * cannot reach a model should say so on the way in, where the caller can fix it,
 * rather than three turns into the loop with a 401 and a half-read transcript.
 */
export function resolveTransport(config: ProviderConfig = {}): ChatTransport {
  const name = (config.provider ?? 'morgana') as ProviderName

  if (!PROVIDERS[name]) {
    throw new Error(
      `unknown model provider "${name}". One of: ${Object.keys(PROVIDERS).join(', ')}.`,
    )
  }

  switch (name) {
    case 'morgana':
      return createMorganaTransport({
        baseUrl: requireField(config.baseUrl, 'a base URL', 'morgana'),
        token: config.token,
        model: config.model,
      })
    case 'openai':
      return createOpenAITransport({
        baseUrl: config.baseUrl,
        token: requireField(config.token, 'an API key', 'openai'),
        model: config.model,
      })
    case 'anthropic':
      return createAnthropicTransport({
        baseUrl: config.baseUrl,
        token: requireField(config.token, 'an API key', 'anthropic'),
        model: config.model,
      })
    case 'ollama':
      return createOllamaTransport({ baseUrl: config.baseUrl, model: config.model })
  }
}

/**
 * Read a provider config out of an environment.
 *
 * Used by the local dev host, where there is no `morgana.config.ts` to read and
 * the only configuration available is what the developer exported. `MORGANA_URL`
 * doubles as the default base URL because it is already the variable the CLI
 * uses for everything else — one variable for "where Morgana lives" is easier to
 * get right than two.
 */
export function providerFromEnv(env: Record<string, string | undefined>): ProviderConfig {
  const name = (env.MORGANA_LLM_PROVIDER ?? 'morgana').trim().toLowerCase() as ProviderName
  const base = (env.MORGANA_LLM_URL ?? env.MORGANA_URL ?? '').trim()

  const token =
    name === 'openai'
      ? env.OPENAI_API_KEY ?? env.MORGANA_LLM_KEY
      : name === 'anthropic'
        ? env.ANTHROPIC_API_KEY ?? env.MORGANA_LLM_KEY
        : env.MORGANA_LLM_KEY ?? env.MORGANA_TOKEN

  return {
    provider: name,
    baseUrl: base || undefined,
    model: env.MORGANA_LLM_MODEL || undefined,
    token: token || undefined,
  }
}