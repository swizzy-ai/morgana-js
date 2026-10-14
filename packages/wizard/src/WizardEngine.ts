import { Signal, signalLabel } from './Signal'
import type { Signal as SignalType } from './Signal'
import { render } from './Template'
import { LlmService } from './LlmService'
import { extractJson } from './extractJson'
import { DefaultVectorAdapter } from './vector'
import type { VectorAdapter, VectorResult } from './vector'
import { matchMemoryValues } from './patterns'
import type { MemoryValue, StepConfig, StepContext, WizardConfig, WizardEvent, QueryVectorStepContext, ClassifierStepContext, RouterStepContext } from './types'
import { isMemoryValue } from './types'

export type WizardListener = (event: WizardEvent) => void
export type EngineStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'done' | 'failed'

interface Waiter {
  stepId: string
  condition: (state: any) => boolean | Promise<boolean>
  resolve: () => void
  reject: (err: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

function findMatchingOption(response: string, options: { id: string; label: string; description?: string }[]): string | null {
  const trimmed = response.trim().toLowerCase()
  const exact = options.find(o => o.id.toLowerCase() === trimmed)
  if (exact) return exact.id
  const byLabel = options.find(o => o.label.toLowerCase() === trimmed)
  if (byLabel) return byLabel.id
  const firstWord = trimmed.split(/\s+/)[0]
  if (firstWord) {
    const byFirstWord = options.find(o => o.id.toLowerCase() === firstWord)
    if (byFirstWord) return byFirstWord.id
  }
  const byPartial = options.find(o => o.label.toLowerCase().includes(trimmed) || trimmed.includes(o.label.toLowerCase()))
  if (byPartial) return byPartial.id
  return null
}

function defaultMerge(parent: any, sub: any): any {
  const { _waits, _runId, _cursor, ...subRest } = sub ?? {}
  void _waits; void _runId; void _cursor
  const merged = { ...(parent ?? {}), ...subRest }
  if (Array.isArray(parent?.units) || Array.isArray((subRest as any)?.units)) {
    merged.units = mergeUnitLists(readUnitList(parent), readUnitList(subRest))
  }
  return merged
}

/** Departments tracked in state, streamed via state:changed.
 *  One record per step id owned by the engine that runs it; nested
 *  engines keep their own lists and the host merges by id. The wall
 *  reads these records and nothing else — no step-name inference
 *  anywhere downstream. */
export type UnitState = 'pending' | 'running' | 'done' | 'failed' | 'stopped'
export interface UnitRecord { id: string; state: UnitState }

function readUnitList(state: any): UnitRecord[] {
  const u = state?.units
  if (!Array.isArray(u)) return []
  return u.filter((r: any) => r && typeof r.id === 'string' && typeof r.state === 'string')
}

function mergeUnitLists(a: UnitRecord[], b: UnitRecord[]): UnitRecord[] {
  const out = [...a]
  for (const r of b) {
    const at = out.findIndex(u => u.id === r.id)
    if (at < 0) out.push(r)
    else out[at] = r
  }
  return out
}

function snapshotOf(state: any, snapshot?: string[] | ((s: any) => Record<string, unknown>)): Record<string, unknown> {
  if (!snapshot) return {}
  if (typeof snapshot === 'function') {
    try { return snapshot(state) ?? {} } catch { return {} }
  }
  const out: Record<string, unknown> = {}
  for (const k of snapshot) out[k] = state?.[k]
  return out
}

export class WizardEngine {
  private state: any
  private steps: StepConfig[]
  private stepMap: Map<string, StepConfig>
  private order: string[]
  private config: WizardConfig
  private llmService: LlmService | null
  private llmOverride?: WizardConfig['llm']
  private classifyOverride?: WizardConfig['classify']
  private vectorAdapter: VectorAdapter | null
  private listeners: WizardListener[] = []
  private logLabel: string
  private activeChildren: Set<WizardEngine> = new Set()

  private status: EngineStatus = 'idle'
  private cursor: string | null = null
  private waiter: Waiter | null = null
  private abort = false
  private runPromise: Promise<void> | null = null
  /** Resolvers waiting to hear that the engine parked or ended. */
  private parkWaiters: Array<() => void> = []

  constructor(config: WizardConfig, logLabel = 'main') {
    this.config = config
    this.steps = config.steps
    this.stepMap = new Map()
    this.order = []
    for (const step of config.steps) {
      if (this.stepMap.has(step.id)) {
        throw new Error(`Duplicate step id: ${step.id}`)
      }
      this.stepMap.set(step.id, step)
      this.order.push(step.id)
    }
    this.state = {}
    this.llmOverride = config.llm
    this.classifyOverride = config.classify
    // No default origin. A wizard reaches a model through an injected `llm`
    // (what ctx.ai.wizard supplies) or an explicit `baseUrl`; silently pointing
    // at someone else's worker made a misconfigured run look like a network
    // problem instead of a wiring one.
    this.llmService = config.baseUrl
      ? new LlmService({ baseUrl: config.baseUrl, token: config.token })
      : null
    this.vectorAdapter = config.vectorAdapter
      ?? (config.baseUrl ? new DefaultVectorAdapter({ baseUrl: config.baseUrl }) : null)
    this.logLabel = logLabel
  }

  on(listener: WizardListener): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx !== -1) this.listeners.splice(idx, 1)
    }
  }

  private emit(event: WizardEvent): void {
    for (const listener of this.listeners) {
      try { listener(event) } catch { }
    }
    // Checkpoint at step boundaries only. state:changed fires on every
    // setState — persisting those is what made one run write tens of MB.
    // `wait` is checkpointed with `await` at the park site, not here, so the
    // parked state is durable before the caller sees the pause.
    if (event.type === 'step:start') this.persist(event.step.id)
    else if (event.type === 'step:complete') this.persist(event.step.id)
    else if (event.type === 'error') this.persist(null)
  }

  /**
   * Record where a resume should re-enter plus the state to resume into.
   * Snapshots are whole-state (a recon run holds a file graph), so this
   * runs ~12 times per job, not once per mutation.
   */
  private persist(stepId: string | null): void {
    void this.checkpoint(stepId)
  }

  /**
   * The awaited form of `persist`. Called at the points where a *durable*
   * boundary matters — a park or the end of a run — so the checkpoint is
   * written before the invocation returns, rather than racing process death.
   */
  private checkpoint(stepId: string | null): Promise<void> {
    const p = this.config.persistence
    if (!p) return Promise.resolve()
    try {
      return Promise.resolve(p.checkpoint(stepId, this.state)).catch(() => {
        // best effort: a failed checkpoint costs resume, never the run
      })
    } catch {
      return Promise.resolve()
    }
  }

  // -- detached run plumbing ----------------------------------------------

  /** Resolve when the engine parks (paused) or ends (done/stopped/failed). */
  private waitForParkOrEnd(): Promise<void> {
    if (this.status === 'done' || this.status === 'stopped' || this.status === 'failed') {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => { this.parkWaiters.push(resolve) })
  }

  private notifyPark(): void {
    const waiters = this.parkWaiters
    this.parkWaiters = []
    for (const resolve of waiters) resolve()
  }

  /**
   * Start `starter` and return once the engine parks or finishes — never
   * waiting through a pause. A durable caller wants the parked state back, so
   * the run survives the invocation that started it.
   */
  private async runDetached(starter: () => Promise<void>): Promise<void> {
    const settled = starter().catch(() => { /* status carries the failure */ })
    await Promise.race([settled, this.waitForParkOrEnd()])
  }

  /**
   * Run and return at the first pause (an approval gate or `pauseWhile`) or at
   * the end. The difference from `run` is only that it does not hang while a
   * gate waits for a decision that arrives in a later invocation.
   */
  async runUntilParked(initialState?: any): Promise<void> {
    return this.runDetached(() => this.run(initialState))
  }

  /**
   * Resume from a checkpoint and return at the next pause or the end.
   * `decision` records an approval/denial for a parked gate so the resume
   * does not re-open a gate a reviewer already answered.
   */
  async resumeUntilParked(
    opts?: { stepId?: string | null; state?: any; decision?: { stepId: string; approved: boolean; comment?: string } },
  ): Promise<void> {
    return this.runDetached(() => this.resumeWith(opts))
  }

  /**
   * The durable resume. Loads the checkpoint (when no state is supplied),
   * records a decision if one is given, and re-enters at the parked step —
   * re-opening an approval gate rather than skipping it — or after the last
   * finished step. Returns at the next pause or the end.
   */
  async resumeWith(
    opts?: { stepId?: string | null; state?: any; decision?: { stepId: string; approved: boolean; comment?: string } },
  ): Promise<void> {
    let stepId = opts?.stepId ?? null
    let state = opts?.state
    if (state === undefined) {
      const p = this.config.persistence
      if (!p) throw new Error('resumeWith: no state and no persistence configured')
      const saved = await p.load()
      if (!saved) throw new Error('resumeWith: no checkpoint recorded')
      stepId = saved.stepId
      state = saved.state ?? {}
    }
    if (opts?.decision) {
      const d = opts.decision
      state = {
        ...state,
        _waits: {
          ...(state?._waits ?? {}),
          [d.stepId]: { status: d.approved ? 'approved' : 'denied', comment: d.comment, at: Date.now() },
        },
      }
    }
    const step = stepId ? this.stepMap.get(stepId) : undefined
    if (step?.type === 'approval') return this.resumeAt(stepId!, state)
    return this.resumeFrom(stepId, state)
  }

  getStatus(): EngineStatus {
    if (this.activeChildren.size > 0) {
      for (const c of this.activeChildren) {
        const s = c.getStatus()
        if (s === 'running' || s === 'paused') return s
      }
    }
    return this.status
  }

  isRunning(): boolean {
    return this.getStatus() === 'running' || this.getStatus() === 'paused'
  }

  getState(): any {
    // While a subwizard/parallel branch runs, the parent snapshot is frozen —
    // the live truth is the active child's state. Drill down so one .on() +
    // getState() sees the whole tree (e.g. approval snapshots with dockets).
    if (this.activeChildren.size > 0) {
      const first = this.activeChildren.values().next().value as WizardEngine | undefined
      if (first) return first.getState()
    }
    return this.state
  }

  getCursor(): string | null {
    return this.cursor
  }

  // -- event entry points -------------------------------------------------

  async run(initialState?: any): Promise<void> {
    if (this.runPromise) return this.runPromise
    this.state = initialState ?? {}
    this.seedUnits()
    this.abort = false
    this.cursor = this.order[0] ?? null
    this.status = this.cursor ? 'running' : 'done'
    this.runPromise = this.pump().finally(() => {
      this.runPromise = null
    })
    return this.runPromise
  }

  /** Departments owned by this engine, seeded pending (existing records
   *  keep their state — old checkpoints stay resumable). */
  private seedUnits(): void {
    const have = new Set(readUnitList(this.state).map(u => u.id))
    const missing = this.order.filter(id => !have.has(id) && !id.includes(':'))
    if (missing.length === 0) return
    this.state = {
      ...this.state,
      units: [...readUnitList(this.state), ...missing.map(id => ({ id, state: 'pending' as UnitState }))],
    }
  }

  private readUnits(): UnitRecord[] {
    return readUnitList(this.state)
  }

  private markUnit(id: string, state: UnitState): void {
    if (!id || id.includes(':')) return
    const units = this.readUnits()
    const at = units.findIndex(u => u.id === id)
    const next = at < 0 ? [...units, { id, state }] : units.map((u, i) => (i === at ? { id, state } : u))
    this.applyState({ ...this.state, units: next })
  }

  private completeUnit(id: string, signal: SignalType): void {
    if (signal.type === 'fail') this.markUnit(id, 'failed')
    else if (signal.type === 'stop') this.markUnit(id, 'stopped')
    else if (signal.type === 'retry') this.markUnit(id, 'running')
    else this.markUnit(id, 'done')
  }

  /** Start (or restart) a single step by id. Parallel fan-out uses this per branch. */
  async startStep(id: string, state?: any): Promise<SignalType> {
    const step = this.stepMap.get(id)
    if (!step) throw new Error(`Step "${id}" not found`)
    if (state !== undefined) this.applyState(state)
    this.markUnit(id, 'running')
    this.emit({ type: 'step:start', step })
    // `performance` is not guaranteed in every host (the QuickJS sandbox).
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    let signal: SignalType
    try {
      signal = await this.execWithCatch(step, () => this.dispatchStep(step))
    } catch (err) {
      this.markUnit(id, 'failed')
      throw err
    }
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const elapsed = (t1 - t0).toFixed(0)
    console.log(`  ◇ ${this.logLabel}/${step.id} [${elapsed}ms] ${signalLabel(signal)}`)
    this.completeUnit(id, signal)
    this.emit({ type: 'step:complete', step, signal })
    return signal
  }

  async resumeFrom(stepId?: string | null, state?: any): Promise<void> {
    if (state !== undefined) this.applyState(state)
    this.seedUnits()
    if (stepId) {
      const at = this.order.indexOf(stepId)
      this.cursor = at < 0 ? (this.order[0] ?? null) : (this.order[at + 1] ?? null)
    } else if (!this.cursor) {
      this.cursor = this.order[0] ?? null
    }
    this.abort = false
    if (!this.cursor) {
      this.status = 'done'
      this.emit({ type: 'done', state: this.getState() })
      return
    }
    this.status = 'running'
    if (this.runPromise) return this.runPromise
    this.runPromise = this.pump().finally(() => { this.runPromise = null })
    return this.runPromise
  }

  async resume(): Promise<void> {
    return this.resumeFrom(this.cursor)
  }

  /** Re-enter a step by id (hydrate uses this for parked gates). */
  async resumeAt(stepId: string, state?: any): Promise<void> {
    if (!this.stepMap.has(stepId)) throw new Error(`Step "${stepId}" not found`)
    if (state !== undefined) this.applyState(state)
    this.seedUnits()
    this.cursor = stepId
    this.abort = false
    this.status = 'running'
    if (this.runPromise) return this.runPromise
    this.runPromise = this.pump().finally(() => { this.runPromise = null })
    return this.runPromise
  }

  /**
   * Resume from the last checkpoint: re-enter at the parked approval gate if
   * one is waiting (so a human decides again rather than being skipped past),
   * otherwise continue after the last step that finished.
   * `base` fills keys a checkpoint never recorded (dir, workDir on early stops).
   */
  async hydrate(base?: any): Promise<void> {
    const p = this.config.persistence
    if (!p) throw new Error('hydrate: no persistence configured')
    const saved = await p.load()
    if (!saved) throw new Error('hydrate: no checkpoint recorded')
    const state = { ...(base ?? {}), ...(saved.state ?? {}) }
    // A gate parked mid-run must re-park on replay, not be stepped over.
    const stepId = saved.stepId
    const step = stepId ? this.stepMap.get(stepId) : undefined
    if (step?.type === 'approval') return this.resumeAt(stepId!, state)
    return this.resumeFrom(stepId, state)
  }

  stop(): void {
    const liveCursor = (this.status === 'running' || this.status === 'paused') ? this.cursor : null
    this.abort = true
    for (const c of [...this.activeChildren]) {
      try { c.stop() } catch { }
    }
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      if (w.timer) clearTimeout(w.timer)
      this.status = 'stopped'
      this.notifyPark()
      w.reject(new Error('stopped'))
      return
    }
    if (this.status === 'running' || this.status === 'paused') {
      this.status = 'stopped'
      this.emit({ type: 'stopped', state: this.getState() })
      this.notifyPark()
    }
    if (liveCursor && this.readUnits().some(u => u.id === liveCursor && u.state === 'running')) {
      this.markUnit(liveCursor, 'stopped')
    }
  }

  setState(updater: (prev: any) => any): void {
    if (this.activeChildren.size > 0) {
      for (const c of this.activeChildren) c.setState(updater)
      return
    }
    this.applyState(updater(this.state))
    this.checkWaiter()
  }

  // A decision flips the parked gate in the waiting engine's state and
  // re-checkpoints there, so a restart re-opens the gate rather than
  // stepping over it.
  approve(id: string, comment?: string): void {
    this.setState((s: any) => ({
      ...s,
      _waits: { ...(s._waits ?? {}), [id]: { status: 'approved', comment, at: Date.now() } },
    }))
    this.persist(id)
  }

  deny(id: string, comment?: string): void {
    this.setState((s: any) => ({
      ...s,
      _waits: { ...(s._waits ?? {}), [id]: { status: 'denied', comment, at: Date.now() } },
    }))
    this.persist(id)
  }

  private applyState(next: any): void {
    this.state = next
    this.emit({ type: 'state:changed', state: this.state })
  }

  private emitSetState(updater: (prev: any) => any): void {
    this.applyState(updater(this.state))
    this.checkWaiter()
  }

  private checkWaiter(): void {
    const w = this.waiter
    if (!w) return
    let done = false
    try {
      const r = w.condition(this.state)
      if (r instanceof Promise) {
        void r.then(v => { if (!v && this.waiter === w) this.releaseWaiter() }).catch(() => {})
        return
      }
      done = !!r
    } catch { return }
    // condition returns true while we should KEEP waiting; release when false
    if (!done) this.releaseWaiter()
  }

  private releaseWaiter(): void {
    const w = this.waiter
    if (!w) return
    this.waiter = null
    if (w.timer) clearTimeout(w.timer)
    w.resolve()
  }

  private nextId(id: string): string | null {
    const at = this.order.indexOf(id)
    return at < 0 ? null : (this.order[at + 1] ?? null)
  }

  private transition(signal: SignalType, step: StepConfig): string | null {
    switch (signal.type) {
      case 'skip': return this.nextId(step.id)
      case 'stop': return null
      case 'retry': return step.id
      case 'goto': {
        if (!signal.stepId || !this.stepMap.has(signal.stepId)) {
          throw new Error(`Step "${step.id}" goto unknown step "${signal.stepId}"`)
        }
        return signal.stepId
      }
      case 'fail': {
        this.state = { ...this.state, _error: signal.message }
        this.emit({ type: 'error', error: new Error(signal.message ?? 'failed') })
        if (step.catch && this.stepMap.has(step.catch)) return step.catch
        return null
      }
      case 'pauseWhile':
        return this.nextId(step.id)
      default:
        return this.nextId(step.id)
    }
  }

  /** Event pump: one step per tick, chained by signals. No polling loops. */
  private async pump(): Promise<void> {
    await this.tick()
  }

  private async tick(): Promise<void> {
    while (!this.abort && this.cursor && this.status !== 'stopped') {
      const step = this.stepMap.get(this.cursor)
      if (!step) throw new Error(`Step "${this.cursor}" not found`)
      const id = step.id
      console.log(`  ▶ ${this.logLabel}/${id}`)
      this.markUnit(id, 'running')
      this.emit({ type: 'step:start', step })
      let signal: SignalType
      try {
        signal = await this.dispatchStep(step)
      } catch (err: any) {
        this.markUnit(id, 'failed')
        signal = await this.execWithCatch(step, () => { throw err })
      }
      if (this.abort) return
      // A pause suspends the step: step:complete fires on resume, not here.
      // Otherwise consumers see "done" for a step that is still waiting.
      if (signal.type === 'pauseWhile' && signal.condition) {
        const next = this.transition(signal, step)
        this.cursor = next
        this.emit({ type: 'wait', step, snapshot: {} } as any)
        await this.checkpoint(step.id)
        await this.suspend(signal.condition, signal.options)
        if (this.abort) return
        console.log(`  ◇ ${this.logLabel}/${id} → next (resumed)`)
        this.completeUnit(id, Signal.skip)
        this.emit({ type: 'step:complete', step, signal: Signal.skip })
        continue
      }
      console.log(`  ◇ ${this.logLabel}/${id} ${signalLabel(signal)}`)
      this.completeUnit(id, signal)
      this.emit({ type: 'step:complete', step, signal })
      if (signal.type === 'fail' && !(step.catch && this.stepMap.has(step.catch))) {
        this.status = 'failed'
        await this.checkpoint(null)
        this.notifyPark()
        return
      }
      if (signal.type === 'stop') {
        this.status = 'stopped'
        this.emit({ type: 'stopped', state: this.getState() })
        await this.checkpoint(null)
        this.notifyPark()
        return
      }
      const next = this.transition(signal, step)
      this.cursor = next
      if (!next) break
      // yield to the event queue between steps so stop()/setState() land promptly
      await new Promise(r => setTimeout(r, 0))
    }
    if (this.abort) {
      this.status = 'stopped'
      this.emit({ type: 'stopped', state: this.getState() })
      await this.checkpoint(null)
      this.notifyPark()
      return
    }
    this.status = 'done'
    this.emit({ type: 'done', state: this.getState() })
    await this.checkpoint(null)
    this.notifyPark()
  }

  private suspend(condition: (state: any) => boolean | Promise<boolean>, options?: { timeoutMs?: number; interval?: number; maxAttempts?: number }): Promise<void> {
    if (this.waiter) throw new Error('Already suspended')
    this.status = 'paused'
    return new Promise<void>((resolve, reject) => {
      const w: Waiter = { stepId: this.cursor ?? '', condition, resolve, reject }
      // condition true = keep waiting; resolve immediately if already false
      let initial: any
      try { initial = condition(this.state) } catch (e) { reject(e as Error); return }
      if (initial instanceof Promise) {
        this.waiter = w
        void initial.then(v => {
          if (!v) { if (this.waiter === w) { this.waiter = null; resolve() } }
          else { this.waiter = w; this.notifyPark() }
        }).catch(() => {})
      } else if (!initial) {
        resolve()
        return
      } else {
        this.waiter = w
        this.notifyPark()
      }
      const timeoutMs = (options as any)?.timeoutMs
      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        w.timer = setTimeout(() => {
          if (this.waiter === w) {
            this.waiter = null
            reject(new Error('pauseWhile timed out'))
          }
        }, timeoutMs)
      }
    }).then(
      () => { if (this.status === 'paused') this.status = 'running' },
      (err) => {
        if (err?.message === 'stopped') return
        throw err
      },
    )
  }

  private async execWithCatch(step: StepConfig, fn: () => Promise<SignalType>): Promise<SignalType> {
    try {
      return await fn()
    } catch (err: any) {
      this.state = { ...this.state, _error: err?.message ?? String(err) }
      this.emit({ type: 'error', error: err })
      if (step.catch && this.stepMap.has(step.catch)) {
        this.emit({ type: 'step:complete', step, signal: Signal.fail(err?.message ?? 'error') })
        return Signal.goto(step.catch)
      }
      throw err
    }
  }

  private async dispatchStep(step: StepConfig): Promise<SignalType> {
    switch (step.type) {
      case 'compute':
        return this.execCompute(step)
      case 'subwizard':
        return this.execSubWizard(step)
      case 'parallel':
        return this.execParallel(step)
      case 'approval':
        return this.execApproval(step)
      case 'queryVector':
        return this.execQueryVector(step)
      case 'classify':
        return this.execClassify(step)
      case 'router':
        return this.execRouter(step)
      default:
        return this.execLlmStep(step as any)
    }
  }

  private childConfigOf(raw: any): WizardConfig {
    // Accept WizardConfig data OR a fluent Wizard instance (has toConfig()/steps).
    if (raw && typeof raw.toConfig === 'function') return raw.toConfig()
    if (raw && Array.isArray(raw.steps)) return raw as WizardConfig
    if (raw && raw.engine && Array.isArray(raw.engine.steps)) return { steps: raw.engine.steps }
    return raw as WizardConfig
  }

  private async execSubWizard(step: StepConfig): Promise<SignalType> {
    const subStep = step as import('./types').SubWizardStepConfig
    const cfg = this.childConfigOf((subStep as any).wizard ?? (subStep as any).child)
    const parent = this.state
    const sub = new WizardEngine({
      ...cfg,
      llm: cfg.llm ?? this.llmOverride,
      classify: cfg.classify ?? this.classifyOverride,
      baseUrl: cfg.baseUrl ?? this.config.baseUrl,
      persistence: cfg.persistence,
    }, `${this.logLabel}/${step.id}`)
    this.activeChildren.add(sub)
    const forward = (e: any) => {
      if (e.type === 'done' || e.type === 'stopped') return
      // A gate inside a child is still this run parking — surface it so a
      // detached caller returns instead of waiting through the child.
      if (e.type === 'wait') this.notifyPark()
      this.emit(e)
    }
    const off = sub.on(forward)
    try {
      await sub.run(parent)
    } finally {
      off()
      this.activeChildren.delete(sub)
    }
    if (this.abort) return Signal.stop
    const subState = sub.getState()
    const merged = subStep.onFinish ? await subStep.onFinish(parent, subState) : defaultMerge(parent, subState)
    this.applyState(merged)
    if (!subStep.handler) return Signal.skip
    const ctx = {
      state: this.state,
      subState,
      parent,
      sub: subState,
      setState: (updater: (prev: any) => any) => this.emitSetState(updater),
    }
    return await subStep.handler(ctx as any)
  }

  private async execParallel(step: StepConfig): Promise<SignalType> {
    const pStep = step as import('./types').ParallelStepConfig
    const parent = this.state
    const rawBranches = (pStep as any).branches as (WizardConfig | StepConfig[])[]
    const branchCfgs: WizardConfig[] = rawBranches.map(b =>
      Array.isArray(b) ? { steps: b as StepConfig[] } : this.childConfigOf(b),
    )
    this.emit({ type: 'step:start', step: { ...(step as any), id: `${step.id}:fanout` } as any })
    const results = await Promise.all(branchCfgs.map(async (cfg, i) => {
      const sub = new WizardEngine({
        ...cfg,
        llm: cfg.llm ?? this.llmOverride,
        classify: cfg.classify ?? this.classifyOverride,
        baseUrl: cfg.baseUrl ?? this.config.baseUrl,
        persistence: cfg.persistence,
      }, `${this.logLabel}/${step.id}#${i}`)
      this.activeChildren.add(sub)
      const off = sub.on(e => {
        if (e.type === 'done' || e.type === 'stopped') return
        if (e.type === 'wait') this.notifyPark()
        this.emit(e)
      })
      try {
        await sub.run(parent)
        return sub.getState()
      } finally {
        off()
        this.activeChildren.delete(sub)
      }
    }))
    if (this.abort) return Signal.stop
    const merged = pStep.onFinish ? await pStep.onFinish(parent, results) : results.reduce((acc, s) => ({ ...acc, ...s }), { ...parent })
    const branchedUnits = (results as any[]).flatMap(s => readUnitList(s))
    if (branchedUnits.length > 0 || Array.isArray((parent as any)?.units)) {
      (merged as any).units = mergeUnitLists(readUnitList(parent), branchedUnits)
    }
    this.applyState(merged)
    this.emit({ type: 'step:complete', step: { ...(step as any), id: `${step.id}:fanin` } as any, signal: Signal.skip })
    if (!(pStep as any).handler) return Signal.skip
    const ctx = { state: this.state, parent, branches: results, setState: (updater: (prev: any) => any) => this.emitSetState(updater) }
    return await (pStep as any).handler(ctx as any)
  }

  private async execApproval(step: StepConfig): Promise<SignalType> {
    const aStep = step as import('./types').ApprovalStepConfig
    const snapshot = snapshotOf(this.state, aStep.snapshot)
    // A decision recorded on a previous invocation (hydrate/resume) stands:
    // re-entering the gate must continue past it, not re-open it. Only an
    // undecided gate parks.
    const previous = this.state?._waits?.[step.id]
    const decided = previous?.status === 'approved' || previous?.status === 'denied' ? previous : null
    this.applyState({
      ...this.state,
      _waits: {
        ...(this.state._waits ?? {}),
        [step.id]: decided ?? { status: 'awaiting', snapshot, startedAt: Date.now() },
      },
    })
    this.emit({ type: 'wait', step, snapshot } as any)
    // Write the parked state down before the caller can observe the pause, so
    // a run that parks survives the invocation that parked it.
    await this.checkpoint(step.id)
    if (!decided) {
      const timeoutMs = aStep.timeoutMs
      // Suspend: resolves when _waits[id].status flips (approve/deny) via setState.
      await this.suspend(
        (s: any) => s?._waits?.[step.id]?.status === 'awaiting',
        timeoutMs ? { timeoutMs } : undefined,
      ).catch((err) => {
        if (err?.message === 'stopped') throw err
        throw err
      })
    }
    if (this.abort) return Signal.stop
    const rec = this.state?._waits?.[step.id]
    if (rec?.status === 'approved') {
      this.applyState({ ...this.state })
      if (!aStep.handler) return Signal.skip
      const ctx = { approved: true, comment: rec.comment, snapshot, state: this.state, setState: (updater: (prev: any) => any) => this.emitSetState(updater) }
      return await aStep.handler(ctx as any)
    }
    const msg = `Approval "${step.id}" denied${rec?.comment ? `: ${rec.comment}` : ''}`
    if (step.catch && this.stepMap.has(step.catch)) {
      if (aStep.handler) {
        const ctx = { approved: false, comment: rec?.comment, snapshot, state: this.state, setState: (updater: (prev: any) => any) => this.emitSetState(updater) }
        await aStep.handler(ctx as any)
      }
      return Signal.goto(step.catch)
    }
    if (aStep.handler) {
      const ctx = { approved: false, comment: rec?.comment, snapshot, state: this.state, setState: (updater: (prev: any) => any) => this.emitSetState(updater) }
      await aStep.handler(ctx as any)
    }
    return Signal.fail(msg)
  }

  private async execCompute(step: StepConfig): Promise<SignalType> {
    const cs = step as import('./types').ComputeStepConfig
    const ctx = {
      state: this.state,
      setState: (updater: (prev: any) => any) => this.emitSetState(updater),
      ai: this.callLlm.bind(this),
    }
    return await cs.handler(ctx as any)
  }

  private async execQueryVector(step: StepConfig): Promise<SignalType> {
    const qvStep = step as import('./types').QueryVectorStepConfig
    const { text, memory } = qvStep.context ? this.splitContext(qvStep.context(this.state)) : { text: {}, memory: {} }
    const filtered = qvStep.patterns?.length ? matchMemoryValues(memory, qvStep.patterns) : memory
    const queryInstruction = render(qvStep.query, { ...text, ...filtered })
    const llmMemory = Object.keys(filtered).length > 0 ? filtered : undefined
    const generatedQuery = this.llmOverride
      ? await this.llmOverride({ instructions: queryInstruction, memory: llmMemory, model: qvStep.model })
      : this.llmService
        ? await this.llmService.generateText({ instructions: queryInstruction, memory: llmMemory, model: qvStep.model })
        : (() => { throw new Error(`QueryVector step "${qvStep.id}": no model configured`) })()
    const adapter = qvStep.adapter ?? this.vectorAdapter
    if (!adapter) {
      throw new Error(`QueryVector step "${qvStep.id}": no vector adapter configured`)
    }
    const results = await adapter.search({ query: generatedQuery, topK: qvStep.topK })
    const ctx: QueryVectorStepContext = {
      query: generatedQuery,
      results,
      state: this.state,
      setState: (updater) => this.emitSetState(updater),
    }
    return await qvStep.handler(ctx as any)
  }

  private buildClassifyState(
    step: { stateTemplate?: string },
    text: Record<string, any>,
    memory: Record<string, MemoryValue>,
  ): unknown {
    if (step.stateTemplate) return render(step.stateTemplate, text)
    const merged = { ...text }
    for (const [k, v] of Object.entries(memory)) merged[k] = v.data
    if (Object.keys(merged).length > 0) return merged
    return this.state
  }

  private async execClassify(step: StepConfig): Promise<SignalType> {
    const cStep = step as import('./types').ClassifierStepConfig
    const { text, memory } = cStep.context ? this.splitContext(cStep.context(this.state)) : { text: {}, memory: {} }
    const questions = typeof cStep.questions === 'function' ? cStep.questions(this.state) : cStep.questions
    if (!this.classifyOverride) {
      throw new Error(`Classify step "${cStep.id}": no classifier configured (set WizardConfig.classify)`)
    }
    const answers = await this.classifyOverride({
      state: this.buildClassifyState(cStep, text, memory),
      questions,
      model: cStep.model,
    })
    const ctx: ClassifierStepContext = {
      answers,
      state: this.state,
      setState: (updater) => this.emitSetState(updater),
    }
    return await cStep.handler(ctx as any)
  }

  private async execRouter(step: StepConfig): Promise<SignalType> {
    const rStep = step as import('./types').RouterStepConfig
    const { text, memory } = rStep.context ? this.splitContext(rStep.context(this.state)) : { text: {}, memory: {} }
    const instruction = render(rStep.instruction, text)
    if (!this.classifyOverride) {
      throw new Error(`Router step "${rStep.id}": no classifier configured (set WizardConfig.classify)`)
    }
    const answers = await this.classifyOverride({
      state: this.buildClassifyState(rStep, text, memory),
      questions: { route: { type: 'choice', instructions: instruction, criteria: rStep.criteria } },
      model: rStep.model,
    })
    const choice = answers?.route?.choice
    if (typeof choice !== 'string' || choice.length === 0) {
      throw new Error(`Router step "${rStep.id}": classifier returned no choice`)
    }
    const ctx: RouterStepContext = {
      choice,
      confidence: answers.route.confidence,
      probabilities: answers.route.probabilities,
      answers,
      state: this.state,
      setState: (updater) => this.emitSetState(updater),
    }
    if (rStep.handler) return await rStep.handler(ctx as any)
    const dest = rStep.routes[choice]
    if (!dest) {
      throw new Error(`Router step "${rStep.id}": no route for choice "${choice}"`)
    }
    return Signal.goto(dest)
  }

  private async execLlmStep(step: StepConfig): Promise<SignalType> {
    const llmStep = step as import('./types').TextStepConfig
    const { text, memory } = this.splitContext(llmStep.context(this.state))
    let instruction = render(llmStep.instruction, text)
    instruction = this.appendStepInstructions(step, instruction)
    if (this.config.instruction) {
      instruction = this.config.instruction + '\n\n' + instruction
    }
    const isJsonStep = step.type === 'object' || step.type === 'schema'
    let result = await this.callLlm(instruction, memory, llmStep.model, step, llmStep.maxTokens)

    if (isJsonStep) {
      const maxJsonRetries = this.config.maxRetries ?? 3
      for (let attempt = 0; attempt < maxJsonRetries; attempt++) {
        const parsed = extractJson(result)
        if (parsed !== null) break
        result = await this.callLlm(
          `Your previous response was not valid JSON:\n\n${result.slice(0, 500)}\n\nFix it. Respond with valid JSON only — no markdown, no code fences, no explanation.`,
          memory,
          llmStep.model,
        )
      }
    }

    return await this.handleLlmResult(step, result)
  }

  private appendStepInstructions(step: StepConfig, instruction: string): string {
    if (step.type === 'select') {
      const optionsText = (step as any).options
        .map((o: any) => `- ${o.id}: ${o.label}${o.description ? ` — ${o.description}` : ''}`)
        .join('\n')
      instruction += `\n\nChoose ONE option. Respond with the option ID only. Nothing else — no explanation, no punctuation, no quotes.\n${optionsText}`
    }
    if (step.type === 'object') {
      instruction += '\n\nRespond with valid JSON only. No markdown, no explanation.'
    }
    if (step.type === 'schema') {
      const resolvedParams = typeof (step as any).params === 'function' ? (step as any).params(this.state) : (step as any).params
      const paramsText = resolvedParams
        .map((p: any) => `- ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${p.description}`)
        .join('\n')
      instruction += `\n\nFill in these params:\n${paramsText}\n\nRespond with valid JSON only. No markdown, no explanation.`
    }
    return instruction
  }

  private async handleLlmResult(step: StepConfig, result: string): Promise<SignalType> {
    let stepCtx: StepContext
    const emitSetState = (updater: (prev: any) => any) => this.emitSetState(updater)

    if (step.type === 'select') {
      const option = findMatchingOption(result, (step as any).options)
      if (!option) {
        const freeformOption = (step as any).options.find((o: any) => o.freeform)
        if (!freeformOption) {
          throw new Error(`Select step "${step.id}": LLM response "${result}" did not match any option`)
        }
        const explanation = await this.callLlm(`You chose "${freeformOption.id}" (${freeformOption.label}). Explain why in one short sentence.`)
        stepCtx = { result, option: freeformOption.id, freeform: explanation, state: this.state, setState: emitSetState }
      } else {
        const isFreeform = (step as any).options.find((o: any) => o.id === option)?.freeform
        let freeformValue: string | undefined
        if (isFreeform) {
          freeformValue = await this.callLlm(`You chose "${option}". Explain why in one short sentence.`)
        }
        stepCtx = { result, option, freeform: freeformValue, state: this.state, setState: emitSetState }
      }
    } else if (step.type === 'object' || step.type === 'schema') {
      const json = extractJson(result)
      stepCtx = { result, json, state: this.state, setState: emitSetState }
    } else {
      stepCtx = { result, state: this.state, setState: emitSetState }
    }
    return await (step as any).handler!(stepCtx as any)
  }

  private async callLlm(
    instruction: string,
    memory?: Record<string, MemoryValue>,
    model?: string,
    step?: StepConfig,
    maxTokens?: number,
  ): Promise<string> {
    const maxRetries = this.config.maxRetries ?? 3
    let lastError: Error | undefined
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const llmMemory = memory && Object.keys(memory).length > 0 ? memory : undefined
        const onToken = step ? (token: string) => this.emit({ type: 'token', step, token }) : undefined
        if (this.llmOverride) {
          return await this.llmOverride({ instructions: instruction, memory: llmMemory, model, max_tokens: maxTokens, onToken })
        }
        if (!this.llmService) {
          throw new Error('WizardEngine: no model configured — pass WizardConfig.llm (ctx.ai.wizard does this) or WizardConfig.baseUrl')
        }
        return await this.llmService.generateText({ instructions: instruction, memory: llmMemory, model, max_tokens: maxTokens, onToken })
      } catch (err: any) {
        lastError = err
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 1000)
          await new Promise(r => setTimeout(r, delay))
        }
      }
    }
    throw lastError!
  }

  private splitContext(ctxSlice: Record<string, any>): { text: Record<string, any>; memory: Record<string, MemoryValue> } {
    const memory: Record<string, MemoryValue> = {}
    const text: Record<string, any> = {}
    for (const [k, v] of Object.entries(ctxSlice)) {
      if (isMemoryValue(v)) memory[k] = v
      else text[k] = v
    }
    return { text, memory }
  }

  get failed(): string | null {
    return this.state?._error ?? null
  }
}
