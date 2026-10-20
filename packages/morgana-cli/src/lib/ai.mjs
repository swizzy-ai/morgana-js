import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { providerFromEnv, resolveTransport } from '@studiomorgana/agents'

/**
 * AI — the local `ctx.ai` surface: models, generation, agents, tools.
 *
 * ## Why this is an HTTP client and not a local model
 *
 * The loop lives in `@studiomorgana/agents` and needs a completion. Local dev gets one
 * from the same Morgana route the cloud uses, at the base URL `MORGANA_URL`
 * already names. So there is one inference path in the product rather than two,
 * and local behaviour is the deployed behaviour with a different base URL —
 * which is the only way "works on my machine" and "works in production" stay the
 * same claim.
 *
 * A project that wants a different provider sets `MORGANA_LLM_PROVIDER`, and one
 * that wants a key sets `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Either way the
 * loop above is unchanged.
 *
 * ## Why the registry is a file
 *
 * Agents are durable, so a local registry has to outlive the process or
 * `morgana dev` would silently forget every agent on restart — which is the one
 * failure this feature exists to prevent. A JSON file under the data directory
 * is the honest local equivalent of a KV namespace: it survives, and it is one
 * file to delete when you want a clean slate.
 */

const DEFAULT_TEXT_MODEL = '@cf/openai/gpt-oss-120b'
const DEFAULT_VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'

/**
 * A `KeyValueStore` over one JSON file.
 *
 * Written whole on every put. That is fine at the scale a developer produces —
 * a handful of agents and a handful of tool descriptions — and there is no
 * version where two of those writes can clobber each other, because there are
 * never two writers.
 */
export function fileStore(file) {
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      // A missing or corrupt file is an empty store. Refusing to start because
      // the agent registry is unreadable would make an unrelated typo look like
      // a broken toolchain.
      return {}
    }
  }
  const write = async (data) => {
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await fsp.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  }
  return {
    async get(key) {
      const value = read()[key]
      return value === undefined ? null : value
    },
    async put(key, value) {
      const data = read()
      data[key] = value
      await write(data)
    },
    async delete(key) {
      const data = read()
      if (!(key in data)) return
      delete data[key]
      await write(data)
    },
    async keys(prefix) {
      return Object.keys(read()).filter((k) => k.startsWith(prefix))
    },
  }
}

/**
 * The provider, resolved once per host.
 *
 * `url` is kept beside the transport rather than read off it, because the
 * transport is an interface — it knows how to send, not where it sends. The raw
 * `generateText` path needs the address; the agent loop does not.
 */
/**
 * Where `ctx.ai` gets its model in `morgana dev`.
 *
 * By default, the Morgana cloud: the same server `morgana deploy` talks to
 * (`MORGANA_URL`, else the default backend), with the token `morgana login`
 * saved for it. So a signed-in machine has working models with nothing to set,
 * and local runs use the deployed inference path.
 *
 * `MORGANA_LLM_URL` / `MORGANA_TOKEN` / `MORGANA_LLM_KEY` override the address
 * and token; `MORGANA_LLM_PROVIDER` (openai, anthropic) uses that provider's key.
 */
export async function localProvider(env = process.env) {
  const settings = { ...env }
  const name = String(settings.MORGANA_LLM_PROVIDER ?? 'morgana').trim().toLowerCase()
  let signedIn = true
  if (name === 'morgana') {
    const { resolveTarget } = await import('../commands/deploy.mjs')
    const { readCredentials } = await import('../commands/login.mjs')
    const base = String(settings.MORGANA_LLM_URL ?? '').trim().replace(/\/+$/, '') || resolveTarget({ url: settings.MORGANA_URL }).base
    settings.MORGANA_LLM_URL = base
    if (!settings.MORGANA_LLM_KEY && !settings.MORGANA_TOKEN) {
      const stored = readCredentials()[base]?.token
      if (stored) settings.MORGANA_LLM_KEY = stored
      // On the default cloud, no token means no models: say so before any call.
      // A server named in the environment decides for itself (a 401 says the same).
      else if (!String(env.MORGANA_LLM_URL ?? env.MORGANA_URL ?? '').trim()) signedIn = false
    }
  }
  const config = providerFromEnv(settings)
  try {
    return { transport: resolveTransport(config), config, signedIn }
  } catch {
    return null
  }
}

/**
 * `@studiomorgana/agents`, loaded on demand.
 *
 * It ships as `dist`, like `@studiomorgana/sdk`, so it can legitimately not be built
 * on a fresh checkout. Importing it statically made `morgana dev` fail at
 * startup with a module-not-found — which says nothing about the developer's
 * project and stops the whole command over a feature they may not use. So it is
 * loaded here, once, and its absence is a named refusal on `ctx.ai` instead.
 */
let agentsModule = null
let agentsError = null
async function loadAgents() {
  if (agentsModule || agentsError) return agentsModule
  try {
    agentsModule = await import('@studiomorgana/agents')
  } catch (err) {
    agentsError = err
  }
  return agentsModule
}

const NOT_BUILT =
  '@studiomorgana/agents is not built. Run: pnpm --filter @studiomorgana/agents run build'

/**
 * `@studiomorgana/wizard`, loaded on demand for the same reason `@studiomorgana/agents` is:
 * it ships as `dist`, so a fresh checkout may not have built it, and that must
 * refuse `ctx.ai.wizard` by name rather than stop `morgana dev` at startup.
 */
let wizardModule = null
let wizardError = null
async function loadWizard() {
  if (wizardModule || wizardError) return wizardModule
  try {
    wizardModule = await import('@studiomorgana/wizard')
  } catch (err) {
    wizardError = err
  }
  return wizardModule
}

const WIZARD_NOT_BUILT =
  '@studiomorgana/wizard is not built. Run: pnpm --filter @studiomorgana/wizard run build'

/**
 * POST a chat request to the Morgana route and read the text back.
 *
 * The plain generation path goes to the route directly rather than through the
 * agent transport, because it has no tools and no loop — it is one request, and
 * wrapping it in a tool loop would add a second model call to answer a question
 * that needs one.
 */
async function generate({ baseUrl, token }, { instructions, system, model, maxTokens }) {
  if (!baseUrl) throw new Error(NO_PROVIDER)
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/v1/llm/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      instructions,
      ...(system
        ? {
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: instructions },
            ],
          }
        : {}),
      stream: false,
      ...(model ? { model } : {}),
      ...(typeof maxTokens === 'number' && maxTokens > 0 ? { max_tokens : maxTokens } : {}),
    }),
  })
  if (res.status === 401) throw new Error(token ? `${baseUrl} didn't accept this machine's token: run \`morgana login\` again.` : NOT_SIGNED_IN)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`the Morgana LLM route answered ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }
  const data = await res.json()
  return typeof data.text === 'string' ? data.text : ''
}

const NO_PROVIDER =
  'no model provider is configured. Set MORGANA_URL (plus MORGANA_TOKEN unless this ' +
  'machine has a session), or MORGANA_LLM_PROVIDER with the matching key — the same ' +
  'variables the deploy command already reads.'

const NOT_SIGNED_IN =
  'models in `morgana dev` come from the Morgana cloud, and this machine isn\'t signed in: ' +
  'run `morgana login` once (or set MORGANA_TOKEN).'

/**
 * Strip markdown fences and slice to the outermost JSON value.
 *
 * The same shape the worker's own `ctx.ai.generateObject` uses, because the answer
 * has to be equally easy to get from a local model and a cloud one.
 */
export function extractJson(text) {
  let cleaned = String(text ?? '').trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim()
  const start = cleaned.search(/[{[]/)
  if (start === -1) return null
  cleaned = cleaned.slice(start)
  const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'))
  if (end === -1) return null
  try {
    return JSON.parse(cleaned.slice(0, end + 1))
  } catch {
    return null
  }
}

const jsonRetry = (previous) =>
  `Your previous response was not valid JSON:\n\n${String(previous).slice(0, 500)}\n\n` +
  `Fix it. Respond with valid JSON only — no markdown, no code fences, no explanation.`

/**
 * A surface that refuses every method by name, rather than being undefined.
 *
 * The methods are `async` even though they only throw, because the real ones
 * are. A synchronous throw from something declared to return a promise breaks
 * `ctx.ai.agents.create(...).catch(...)` — the catch never runs, and the
 * failure lands at the call site as an unrelated error.
 */
function refusing(what, reason) {
  return Object.fromEntries(
    what.map((method) => [
      method,
      async () => {
        throw new Error(reason)
      },
    ]),
  )
}

const AGENT_METHODS = ['create', 'get', 'list', 'has', 'remove']
const TOOL_METHODS = ['register', 'get', 'list', 'has', 'remove']
const WIZARD_METHODS = ['run', 'resume', 'approve', 'deny', 'get', 'list', 'has', 'remove']

/**
 * Build the local `ctx.ai`.
 *
 * `runAction` is the dispatcher the context already received, so a tool call
 * reaches any enabled action in the project — including ones this host is itself
 * serving. The agent inherits the invocation's reach for free, which is the same
 * property it has on the cloud.
 */
export async function buildAi({ enabledActions, runAction, dataDir, channels, log }) {
  const provider = await localProvider()
  const agents = await loadAgents()
  // Why models can't be used here, if they can't: no provider at all, or the
  // Morgana cloud with no login on this machine (refused here, not by a 401).
  const unusable = !provider ? NO_PROVIDER : provider.signedIn === false ? NOT_SIGNED_IN : null

  const generateText = async (opts) => {
    if (typeof opts?.instructions !== 'string' || !opts.instructions.trim()) {
      throw new Error('ctx.ai.generateText requires { instructions }')
    }
    if (unusable) throw new Error(unusable)
    return generate(provider.config, opts)
  }

  const generateObject = async (opts) => {
    if (typeof opts?.instructions !== 'string' || !opts.instructions.trim()) {
      throw new Error('ctx.ai.generateObject requires { instructions }')
    }
    if (unusable) throw new Error(unusable)

    const attempts = Math.max(1, Math.min(opts.maxAttempts ?? 3, 5))
    const shape =
      opts.structure === undefined ? '' : `\n\nExpected JSON shape:\n${JSON.stringify(opts.structure, null, 2)}`
    let instruction = `${opts.instructions}${shape}\n\nRespond with valid JSON only. No markdown, no explanation.`
    let last = ''

    for (let attempt = 0; attempt < attempts; attempt++) {
      last = await generate(provider.config, { ...opts, instructions: instruction })
      const parsed = extractJson(last)
      if (parsed !== null) return parsed
      instruction = `${opts.instructions}${shape}\n\n${jsonRetry(last)}`
    }
    throw new Error('ctx.ai.generateObject could not produce valid JSON')
  }

  let surface
  if (unusable || !agents) {
    const reason = unusable ?? NOT_BUILT
    surface = {
      agents: refusing(AGENT_METHODS, `ctx.ai.agents is unavailable — ${reason}`),
      tools: refusing(TOOL_METHODS, `ctx.ai.tools is unavailable — ${reason}`),
    }
  } else {
    const registries = new agents.ProjectRegistries({
      store: fileStore(path.join(dataDir, 'agents.json')),
      prefix: 'agents:local:default',
    })

    surface = agents.buildAgentSurface({
      registries,
      transport: provider.transport,
      // The same guard `ctx.actions.run` uses, so a tool names an action that
      // does not exist here rather than reaching into nothing.
      run: async (name, args) => {
        if (!enabledActions.includes(name)) {
          throw new Error(`action "${name}" is not deployed on this host`)
        }
        return runAction(name, args)
      },
      publish: async (channel, payload) => {
        await channels.publish(channel, payload)
      },
      // There is no trigger bus locally, so an event is a log line. That is less
      // than a binding and more than silence: a run that emitted nothing left
      // nothing to read.
      emit: (event, payload) => {
        log(`${event} ${JSON.stringify(payload ?? {})}`)
      },
    })
  }

  // `ctx.ai.wizard` and `ctx.ai.createWorkflow` — durable runs. The engine runs
  // here, in-process, because a local action is not sandboxed; only the model
  // call and the run registry are shared with the cloud, and both go through
  // the same `generateText` and a file store shaped like the worker's KV.
  //
  // Built whether or not a provider is configured: a wizard whose steps are all
  // compute/approval needs no model, and the cloud builds the service
  // unconditionally too. A step that does call the model reaches `generateText`,
  // which refuses by name when there is no provider — the failure lands on the
  // step that needs it, not on the whole surface.
  const wizardLib = await loadWizard()
  const wizard = wizardLib
    ? wizardLib.buildWizardService({
        generateText,
        generateObject,
        store: fileStore(path.join(dataDir, 'wizards.json')),
        prefix: 'wizards:local:default',
      })
    : refusing(WIZARD_METHODS, `ctx.ai.wizard is unavailable — ${WIZARD_NOT_BUILT}`)
  const createWorkflow = wizardLib
    ? (options) => wizardLib.createWorkflow({ generateText }, options)
    : () => {
        throw new Error(WIZARD_NOT_BUILT)
      }

  return {
    models: { text: DEFAULT_TEXT_MODEL, vision: DEFAULT_VISION_MODEL },
    generateText,
    generateObject,
    text: async (opts) => generateText({ ...opts, maxTokens: undefined }),
    agents: surface.agents,
    tools: surface.tools,
    wizard,
    createWorkflow,
  }
}