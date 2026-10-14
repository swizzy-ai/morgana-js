/**
 * Durable wizard runs — what makes a wizard outlive the invocation that ran it.
 *
 * ## What persists, and what cannot
 *
 * A wizard's steps are functions, so a *definition* is code and cannot be
 * stored. A *run* is data: where it parked, the state it carried, and whether
 * it is still going. That is what this writes down, keyed by a caller-supplied
 * run id. The definition is re-supplied on resume — the same wizard, defined
 * again — and the engine re-enters at the recorded step.
 *
 * ## Why the engine runs where the action runs
 *
 * Handlers close over the caller's world (and, on the cloud, only exist inside
 * the action sandbox), so the engine cannot run on the host. Only two things
 * cross: the checkpoint (through a `WizardRunStore`) and `generateText`. This
 * service wires those into a `WizardEngine` and hands back a parked or finished
 * run instead of waiting through an approval gate.
 */

import { WizardEngine } from './WizardEngine'
import type { Wizard } from './Wizard'
import type { ClassifierAnswers, ClassifierQuestions, MemoryValue, WizardConfig, WizardPersistence } from './types'

/** The storage surface a run registry needs. KV in the worker, a file locally. */
export interface WizardRunStore {
  get<T = unknown>(key: string): Promise<T | null>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  /** Every key under a prefix. Bounded: ask for a prefix, never for all. */
  keys(prefix: string): Promise<string[]>
}

export type WizardRunStatus = 'running' | 'paused' | 'done' | 'stopped' | 'failed'

/** What a run is, without its (possibly large) state. */
export interface WizardRunMeta {
  id: string
  status: WizardRunStatus
  /** The step a resume re-enters at, or null when the run is finished. */
  stepId: string | null
  updatedAt: number
}

/** A whole run, state included. */
export interface WizardRunRecord extends WizardRunMeta {
  state: any
}

/** The result of a run/resume call. */
export interface WizardRunResult {
  id: string
  status: WizardRunStatus
  /** Parked/finished state, so a caller can render a gate or read the output. */
  state: any
}

/** A decision to record while resuming a parked approval gate. */
export interface WizardDecision {
  /** The gate's step id. Defaults to the parked step when one is known. */
  stepId?: string
  approved: boolean
  comment?: string
}

export interface WizardRunOptions {
  /** Seed keys a checkpoint never recorded. Merged under the stored state. */
  state?: any
  /** Record an approval/denial for the parked gate and continue past it. */
  decision?: WizardDecision
}

export interface WizardRunsOptions {
  store: WizardRunStore
  /** Key prefix for this project's runs, e.g. `wizards:production:p1`. */
  prefix: string
  /** Clock, so tests can assert timestamps without waiting. */
  now?: () => number
}

function runKey(prefix: string, id: string): string {
  return `${prefix}:run:${id}`
}

function requireId(id: unknown): string {
  if (typeof id !== 'string' || !id.trim()) throw new Error('ctx.ai.wizard requires a run id')
  return id.trim()
}

/**
 * The project's wizard runs.
 *
 * Deliberately without the per-instance cache `ProjectRegistries` uses: a run
 * is written far more often than a declaration and read once per invocation, so
 * a cache would mostly serve stale parked states back to a resume.
 */
export class WizardRuns {
  private readonly store: WizardRunStore
  private readonly prefix: string
  private readonly now: () => number

  constructor(options: WizardRunsOptions) {
    this.store = options.store
    this.prefix = options.prefix
    this.now = options.now ?? (() => Date.now())
  }

  async get(id: string): Promise<WizardRunRecord | null> {
    return this.store.get<WizardRunRecord>(runKey(this.prefix, requireId(id)))
  }

  async has(id: string): Promise<boolean> {
    return (await this.get(id)) !== null
  }

  async put(id: string, record: WizardRunRecord): Promise<void> {
    await this.store.put(runKey(this.prefix, requireId(id)), record)
  }

  async remove(id: string): Promise<boolean> {
    const key = runKey(this.prefix, requireId(id))
    const existing = await this.store.get(key)
    if (existing === null || existing === undefined) return false
    await this.store.delete(key)
    return true
  }

  /** Every run's meta, newest first. */
  async list(): Promise<WizardRunMeta[]> {
    const prefix = `${this.prefix}:run:`
    const out: WizardRunMeta[] = []
    for (const key of await this.store.keys(prefix)) {
      const record = await this.store.get<WizardRunRecord>(key)
      if (!record) continue
      out.push({ id: record.id, status: record.status, stepId: record.stepId, updatedAt: record.updatedAt })
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  toMeta(record: WizardRunRecord): WizardRunMeta {
    return { id: record.id, status: record.status, stepId: record.stepId, updatedAt: record.updatedAt }
  }

  stamp(): number {
    return this.now()
  }
}

export interface WizardServiceOptions {
  /** Where model calls go. Required — a wizard has no built-in origin. */
  generateText: (opts: { instructions: string; model?: string; maxTokens?: number }) => Promise<string>
  /** Used to answer classify/router steps when the wizard names no classifier. */
  generateObject?: (opts: { instructions: string; structure?: unknown; model?: string; maxTokens?: number }) => Promise<any>
  /** Durable run storage. */
  store: WizardRunStore
  /** Key prefix for this project's runs. */
  prefix: string
  now?: () => number
}

/** The surface `ctx.ai.wizard` promises. */
export interface WizardsHandle {
  /**
   * Start a run, or continue the one already under `id`.
   *
   * The same call on a retry resumes: with a stored checkpoint it re-enters at
   * the recorded step; without one it starts from the top.
   */
  run(id: string, wizard: Wizard | WizardConfig, options?: WizardRunOptions): Promise<WizardRunResult>
  /** Continue an existing run. Throws when `id` has no checkpoint. */
  resume(id: string, wizard: Wizard | WizardConfig, options?: WizardRunOptions): Promise<WizardRunResult>
  /** Approve a parked gate and continue. */
  approve(id: string, wizard: Wizard | WizardConfig, options?: { comment?: string; state?: any }): Promise<WizardRunResult>
  /** Deny a parked gate and continue (the wizard's `catch`/handler decides what follows). */
  deny(id: string, wizard: Wizard | WizardConfig, options?: { comment?: string; state?: any }): Promise<WizardRunResult>
  /** One run's meta, or undefined when unknown. */
  get(id: string): Promise<WizardRunMeta | undefined>
  /** Every run, newest first. */
  list(): Promise<WizardRunMeta[]>
  /** True when `id` has a checkpoint. */
  has(id: string): Promise<boolean>
  /** Forget a run. Resolves true when one was removed. */
  remove(id: string): Promise<boolean>
}

function normalizeStatus(status: string): WizardRunStatus {
  switch (status) {
    case 'paused': return 'paused'
    case 'done': return 'done'
    case 'stopped': return 'stopped'
    case 'failed': return 'failed'
    default: return 'running'
  }
}

function toConfig(wizard: Wizard | WizardConfig): WizardConfig {
  const maybe = wizard as any
  const cfg = maybe && typeof maybe.toConfig === 'function' ? maybe.toConfig() : maybe
  if (!cfg || !Array.isArray(cfg.steps)) {
    throw new Error('ctx.ai.wizard requires a Wizard or WizardConfig')
  }
  return cfg as WizardConfig
}

/**
 * A `classify` built on `generateObject`, for wizards that name none.
 *
 * Returns the `ClassifierAnswers` shape the engine reads: one entry per
 * question, typed to match. Fewer capabilities than a purpose-built classifier
 * (no sampling, one call), but it makes a classify/router wizard work the first
 * time without the author wiring anything.
 */
function classifyFromGenerateObject(
  generateObject: NonNullable<WizardServiceOptions['generateObject']>,
): WizardConfig['classify'] {
  return async ({ state, questions, model }) => {
    const instructions = [
      'Answer each question about the state. Respond with a JSON object keyed by question id.',
      'Each value is an object: a boolean answer is { "type": "boolean", "boolean": 0 or 1, "confidence": 0..1 },',
      'a choice answer is { "type": "choice", "choice": "<one of the criteria keys>", "confidence": 0..1 },',
      'a score answer is { "type": "score", "score": 0..100 }.',
      '',
      `Questions:\n${JSON.stringify(questions, null, 2)}`,
      '',
      `State:\n${typeof state === 'string' ? state : JSON.stringify(state, null, 2)}`,
    ].join('\n')
    const parsed = await generateObject({ instructions, model })
    return (parsed ?? {}) as ClassifierAnswers
  }
}

/**
 * Build `ctx.ai.wizard` for one runtime.
 *
 * Every method returns a promise (storage is not memory). `run`/`resume` return
 * as soon as the engine parks at a gate or finishes, so an approval that
 * arrives in a later invocation is answered then, not held open here.
 */
export function buildWizardService(options: WizardServiceOptions): WizardsHandle {
  const runs = new WizardRuns({ store: options.store, prefix: options.prefix, now: options.now })

  const defaultLlm: WizardConfig['llm'] = async ({ instructions, memory, model, max_tokens }) => {
    let text = instructions
    for (const [key, value] of Object.entries(memory ?? {})) {
      const mv = value as MemoryValue
      if (mv.mimeType?.startsWith('text/')) {
        text += `\n\n[${key} (${mv.mimeType})\n${mv.data}]`
      } else {
        text += `\n\n[${key}: ${mv.mimeType} attachment — not supported]`
      }
    }
    return options.generateText({ instructions: text, model, maxTokens: max_tokens })
  }

  const defaultClassify = options.generateObject ? classifyFromGenerateObject(options.generateObject) : undefined

  function engineFor(id: string, wizard: Wizard | WizardConfig): WizardEngine {
    const cfg = toConfig(wizard)
    // Captured so the checkpoint can record the live status without threading it
    // through the persistence interface.
    const holder: { engine: WizardEngine | null } = { engine: null }
    const persistence: WizardPersistence = {
      checkpoint: async (stepId, state) => {
        const status = holder.engine ? normalizeStatus(holder.engine.getStatus()) : 'running'
        await runs.put(id, { id, stepId, state, status, updatedAt: runs.stamp() })
      },
      load: async () => {
        const record = await runs.get(id)
        return record ? { stepId: record.stepId, state: record.state } : null
      },
    }
    const engine = new WizardEngine(
      {
        ...cfg,
        llm: cfg.llm ?? defaultLlm,
        ...(cfg.classify ?? defaultClassify ? { classify: cfg.classify ?? defaultClassify } : {}),
        persistence,
      },
      'wizard',
    )
    holder.engine = engine
    return engine
  }

  /** Write the authoritative record (accurate status) and return the result. */
  async function settle(id: string, engine: WizardEngine): Promise<WizardRunResult> {
    const status = normalizeStatus(engine.getStatus())
    const state = engine.getState()
    await runs.put(id, { id, stepId: engine.getCursor(), state, status, updatedAt: runs.stamp() })
    return { id, status, state }
  }

  async function start(id: string, wizard: Wizard | WizardConfig, options: WizardRunOptions, mustExist: boolean): Promise<WizardRunResult> {
    const runId = requireId(id)
    const existing = await runs.get(runId)
    if (mustExist && !existing) {
      throw new Error(`ctx.ai.wizard.resume: no run "${runId}"`)
    }
    const engine = engineFor(runId, wizard)
    if (existing) {
      const seed = options.state !== undefined ? { ...existing.state, ...options.state } : existing.state
      const decision = options.decision
        ? { stepId: options.decision.stepId ?? existing.stepId ?? '', approved: options.decision.approved, comment: options.decision.comment }
        : undefined
      await engine.resumeUntilParked({ state: seed, stepId: existing.stepId, decision })
    } else {
      await engine.runUntilParked(options.state)
    }
    return settle(runId, engine)
  }

  return {
    run: (id, wizard, options = {}) => start(id, wizard, options, false),
    resume: (id, wizard, options = {}) => start(id, wizard, options, true),
    approve: (id, wizard, options = {}) =>
      start(id, wizard, { state: options.state, decision: { approved: true, comment: options.comment } }, true),
    deny: (id, wizard, options = {}) =>
      start(id, wizard, { state: options.state, decision: { approved: false, comment: options.comment } }, true),
    get: async (id) => {
      const record = await runs.get(id)
      return record ? runs.toMeta(record) : undefined
    },
    list: () => runs.list(),
    has: (id) => runs.has(id),
    remove: (id) => runs.remove(id),
  }
}
