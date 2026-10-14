/**
 * The wizard surface — `ctx.ai.wizard`.
 *
 * ## Declared here, implemented in the package
 *
 * `@studiomorgana/wizard` owns the engine and the durable run registry. These are the
 * *promises* the context makes, and they live in the SDK for the same reason
 * `ctx.ai.agents` does: an author writes against the contract, not against
 * whichever runtime happens to be answering.
 *
 * ## A definition is code; a run is data
 *
 * A wizard's steps are functions, so a wizard is defined in the action that
 * uses it (via `createWizard` from `@studiomorgana/wizard`) and cannot be stored. A
 * *run* is data — where it parked and the state it carried — and that is what
 * `ctx.ai.wizard` keeps durable, keyed by a caller-supplied run id.
 *
 * ## Async because storage is not memory
 *
 * Every method returns a promise. A wizard that parks at an approval gate is
 * continued by a later invocation on a different process, so reading and
 * writing a run reaches storage.
 */

/**
 * The shape the engine runs.
 *
 * Kept structural rather than importing `@studiomorgana/wizard` so the SDK stays
 * self-contained: a `Wizard` from the package and a plain `WizardConfig` object
 * both satisfy it, and a project that installs only the SDK can still typecheck
 * an action that uses one.
 */
export interface WizardConfigLike {
  steps: readonly unknown[]
  instruction?: string
  baseUrl?: string
  token?: string
  [key: string]: unknown
}

/** The fluent `Wizard` builder from `@studiomorgana/wizard`. */
export interface WizardLike {
  toConfig(): WizardConfigLike
}

/** The control signals a step handler returns (a subset of the package's). */
export interface SignalLike {
  skip: unknown
  stop: unknown
  retry(): unknown
  goto(stepId: string): unknown
  fail(message: string): unknown
}

/**
 * The fluent builder `ctx.ai.createWorkflow()` returns.
 *
 * Structural, so the SDK needs no dependency on `@studiomorgana/wizard`: it names the
 * step methods an author calls and what `run` yields. `createWorkflow` is the
 * runtime's thin alias over the package's `Wizard`, and the built object is what
 * `ctx.ai.wizard.run`/`resume` accept as a `WizardDefinition`.
 */
export interface WizardBuilder extends WizardLike {
  readonly signal: SignalLike
  addTextStep(opts: Record<string, unknown>): this
  addSelectStep(opts: Record<string, unknown>): this
  addObjectStep(opts: Record<string, unknown>): this
  addSchemaStep(opts: Record<string, unknown>): this
  addComputeStep(opts: { id?: string; catch?: string; handler: (ctx: any) => unknown }): this
  addClassifyStep(opts: Record<string, unknown>): this
  addRouterStep(opts: Record<string, unknown>): this
  addSubWizardStep(opts: Record<string, unknown>): this
  addWizard(id: string, child: WizardLike, opts?: Record<string, unknown>): this
  addApprovalStep(opts: { id: string; [key: string]: unknown }): this
  addParallel(opts: Record<string, unknown>): this
  on(listener: (event: { type: string; [key: string]: unknown }) => void): this
  run(initialState?: any): Promise<any>
  getState(): any
  stop(): void
  isRunning(): boolean
}

/** Anything `ctx.ai.wizard` can run. */
export type WizardDefinition = WizardLike | WizardConfigLike

export type WizardRunStatus = 'running' | 'paused' | 'done' | 'stopped' | 'failed'

/** What a run is, without its (possibly large) state. */
export interface WizardRunMeta {
  id: string
  status: WizardRunStatus
  /** The step a resume re-enters at, or null when the run is finished. */
  stepId: string | null
  updatedAt: number
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

/** The project's wizard runs — `ctx.ai.wizard`. */
export interface WizardsHandle {
  /**
   * Start a run, or continue the one already under `id`.
   *
   * The same call on a retry resumes: with a stored checkpoint it re-enters at
   * the recorded step; without one it starts from the top. Returns as soon as
   * the run parks at a gate or finishes, so an approval answered in a later
   * invocation is not held open here.
   */
  run(id: string, wizard: WizardDefinition, options?: WizardRunOptions): Promise<WizardRunResult>
  /** Continue an existing run. Throws when `id` has no checkpoint. */
  resume(id: string, wizard: WizardDefinition, options?: WizardRunOptions): Promise<WizardRunResult>
  /** Approve a parked gate and continue. */
  approve(id: string, wizard: WizardDefinition, options?: { comment?: string; state?: any }): Promise<WizardRunResult>
  /** Deny a parked gate and continue (the wizard's `catch`/handler decides what follows). */
  deny(id: string, wizard: WizardDefinition, options?: { comment?: string; state?: any }): Promise<WizardRunResult>
  /** One run's meta, or undefined when unknown. */
  get(id: string): Promise<WizardRunMeta | undefined>
  /** Every run, newest first. */
  list(): Promise<WizardRunMeta[]>
  /** True when `id` has a checkpoint. */
  has(id: string): Promise<boolean>
  /** Forget a run. Resolves true when one was removed. */
  remove(id: string): Promise<boolean>
}

/**
 * Events a wizard run emits, bindable with `on:` like any other backend event.
 *
 *   wizard:run:started    once, when a run begins
 *   wizard:run:paused     once, when a run parks at a gate
 *   wizard:run:completed  once, when a run finishes
 *   wizard:run:failed     once, when a run throws
 */
export const WIZARD_EVENTS = {
  started: 'wizard:run:started',
  paused: 'wizard:run:paused',
  completed: 'wizard:run:completed',
  failed: 'wizard:run:failed',
} as const
