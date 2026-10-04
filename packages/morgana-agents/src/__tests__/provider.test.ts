import { describe, expect, it } from 'vitest'
import { PROVIDERS, providerFromEnv, resolveTransport } from '../provider'

describe('resolveTransport', () => {
  it('defaults to the Morgana route', () => {
    expect(resolveTransport({ baseUrl: 'https://x.test' }).label).toBe('morgana')
  })

  it('names each provider it knows', () => {
    expect(resolveTransport({ provider: 'openai', token: 'k' }).label).toBe('openai')
    expect(resolveTransport({ provider: 'anthropic', token: 'k' }).label).toBe('anthropic')
    expect(resolveTransport({ provider: 'ollama' }).label).toBe('ollama')
  })

  it('refuses a morgana provider with no base URL', () => {
    // Guessing which deployment it is talking to is how a run ends up sending a
    // project's prompt somewhere it did not choose.
    expect(() => resolveTransport({ provider: 'morgana' })).toThrow(/needs a base URL/)
    expect(() => resolveTransport({ provider: 'morgana', baseUrl: '  ' })).toThrow(/needs a base URL/)
  })

  it('refuses a keyed provider with no key', () => {
    expect(() => resolveTransport({ provider: 'openai' })).toThrow(/needs an API key/)
    expect(() => resolveTransport({ provider: 'anthropic' })).toThrow(/needs an API key/)
  })

  it('says which variable would fix it', () => {
    expect(() => resolveTransport({ provider: 'openai' })).toThrow(/OPENAI_API_KEY/)
    expect(() => resolveTransport({ provider: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/)
    expect(() => resolveTransport({ provider: 'morgana' })).toThrow(/MORGANA_URL/)
  })

  it('refuses a provider it has never heard of', () => {
    expect(() => resolveTransport({ provider: 'gpt5' as any })).toThrow(/unknown model provider "gpt5"/)
  })

  it('lists the providers it knows in the refusal', () => {
    expect(() => resolveTransport({ provider: 'gpt5' as any })).toThrow(/morgana, openai, anthropic, ollama/)
  })

  it('carries the model id through', () => {
    expect(resolveTransport({ baseUrl: 'https://x.test', model: '@cf/meta/llama-3' }).model).toBe(
      '@cf/meta/llama-3',
    )
    expect(resolveTransport({ provider: 'ollama', model: 'qwen3:8b' }).model).toBe('qwen3:8b')
  })

  it('exports exactly the providers it resolves', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(['anthropic', 'morgana', 'ollama', 'openai'])
  })
})

describe('providerFromEnv', () => {
  it('defaults to morgana at MORGANA_URL', () => {
    const cfg = providerFromEnv({ MORGANA_URL: 'https://x.test' })
    expect(cfg).toMatchObject({ provider: 'morgana', baseUrl: 'https://x.test' })
  })

  it('prefers MORGANA_LLM_URL over MORGANA_URL', () => {
    // One variable means "where Morgana lives"; the other means "where the model
    // lives". A project pointing the loop somewhere else has to be able to say so.
    expect(
      providerFromEnv({ MORGANA_URL: 'https://a.test', MORGANA_LLM_URL: 'https://b.test' }).baseUrl,
    ).toBe('https://b.test')
  })

  it('picks the key that matches the chosen provider', () => {
    expect(providerFromEnv({ MORGANA_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-a' }).token).toBe('sk-a')
    expect(providerFromEnv({ MORGANA_LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-b' }).token).toBe(
      'sk-b',
    )
    // The other's key must not leak across, or a project with both set uses the
    // wrong credential and gets a 401 it cannot explain.
    expect(
      providerFromEnv({ MORGANA_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-a', ANTHROPIC_API_KEY: 'sk-b' })
        .token,
    ).toBe('sk-a')
  })

  it('falls back to MORGANA_TOKEN for the Morgana route', () => {
    expect(providerFromEnv({ MORGANA_URL: 'https://x.test', MORGANA_TOKEN: 't' }).token).toBe('t')
  })

  it('ignores a DEPLOY_TOKEN, which is no longer a credential', () => {
    // The shared secret is gone from the worker. Reading it here would keep a
    // name alive that looks supported and silently authenticate nothing.
    expect(providerFromEnv({ MORGANA_URL: 'https://x.test', DEPLOY_TOKEN: 'old' }).token).toBeUndefined()
  })

  it('lets MORGANA_LLM_KEY stand in for any provider key', () => {
    expect(providerFromEnv({ MORGANA_LLM_PROVIDER: 'openai', MORGANA_LLM_KEY: 'k' }).token).toBe('k')
  })

  it('reads the model when one is named', () => {
    expect(providerFromEnv({ MORGANA_LLM_MODEL: 'qwen3:8b' }).model).toBe('qwen3:8b')
    expect(providerFromEnv({}).model).toBeUndefined()
  })

  it('resolves into a transport for a Morgana URL', () => {
    expect(resolveTransport(providerFromEnv({ MORGANA_URL: 'https://x.test' })).label).toBe('morgana')
  })

  it('leaves an unconfigured environment unresolvable rather than guessing', () => {
    expect(() => resolveTransport(providerFromEnv({}))).toThrow(/needs a base URL/)
  })
})