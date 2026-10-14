import { WizardEngine } from './WizardEngine'
import type { WizardListener } from './WizardEngine'
import { Signal } from './Signal'
import type {
  ClassifierQuestions,
  ComputeStepConfig,
  ComputeStepContext,
  MemoryValue,
  ObjectStepConfig,
  ObjectStepContext,
  ClassifierStepConfig,
  ClassifierStepContext,
  RouterStepConfig,
  RouterStepContext,
  SchemaParam,
  SchemaStepConfig,
  SchemaStepContext,
  SelectStepConfig,
  SelectStepContext,
  StepConfig,
  StepOption,
  SubWizardStepConfig,
  SubWizardStepContext,
  ApprovalStepConfig,
  ApprovalStepContext,
  ParallelStepConfig,
  TextStepConfig,
  TextStepContext,
  WizardConfig,
  WizardEvent,
  WizardPersistence,
} from './types'

export interface WizardAiAdapter {
  generateText: (opts: { instructions: string; model?: string; maxTokens?: number }) => Promise<string>
  streamText?: (opts: { instructions: string; model?: string; maxTokens?: number }) => AsyncGenerator<string>
}

export interface WizardOptions {
  instruction?: string
  maxRetries?: number
  classifier?: WizardConfig['classify']
  persistence?: WizardPersistence
  baseUrl?: string
  token?: string
}

export type TextStepOptions = {
  id?: string
  instruction: string
  context?: (state: any) => Record<string, any>
  model?: string
  maxTokens?: number
  catch?: string
  handler?: (ctx: TextStepContext) => Signal | Promise<Signal>
}

export type SelectStepOptions = {
  id?: string
  instruction: string
  context?: (state: any) => Record<string, any>
  options: StepOption[]
  model?: string
  catch?: string
  handler?: (ctx: SelectStepContext) => Signal | Promise<Signal>
}

export type ObjectStepOptions = {
  id?: string
  instruction: string
  context?: (state: any) => Record<string, any>
  model?: string
  maxTokens?: number
  catch?: string
  handler?: (ctx: ObjectStepContext) => Signal | Promise<Signal>
}

export type SchemaStepOptions = {
  id?: string
  instruction: string
  context?: (state: any) => Record<string, any>
  params: SchemaParam[] | ((state: any) => SchemaParam[])
  model?: string
  maxTokens?: number
  catch?: string
  handler?: (ctx: SchemaStepContext) => Signal | Promise<Signal>
}

export type ComputeStepOptions = {
  id?: string
  catch?: string
  handler: (ctx: ComputeStepContext) => Signal | Promise<Signal>
}

export type ClassifyStepOptions = {
  id?: string
  context?: (state: any) => Record<string, any>
  questions: ClassifierQuestions | ((state: any) => ClassifierQuestions)
  stateTemplate?: string
  model?: string
  catch?: string
  handler?: (ctx: ClassifierStepContext) => Signal | Promise<Signal>
}

export type RouterStepOptions = {
  id?: string
  context?: (state: any) => Record<string, any>
  instruction: string
  routes: Record<string, string>
  criteria: Record<string, string>
  stateTemplate?: string
  model?: string
  catch?: string
  handler?: (ctx: RouterStepContext) => Signal | Promise<Signal>
}

export type SubWizardStepOptions = {
  id?: string
  wizard?: WizardConfig
  child?: Wizard
  catch?: string
  handler?: (ctx: SubWizardStepContext) => Signal | Promise<Signal>
  onFinish?: (parent: any, sub: any) => any | Promise<any>
}

export type ApprovalStepOptions = {
  id: string
  snapshot?: string[] | ((state: any) => Record<string, unknown>)
  timeoutMs?: number
  catch?: string
  handler?: (ctx: ApprovalStepContext) => Signal | Promise<Signal>
}

export type ParallelStepOptions = {
  id?: string
  branches: (Wizard | WizardConfig | StepConfig[])[]
  catch?: string
  handler?: (ctx: any) => Signal | Promise<Signal>
  onFinish?: (parent: any, branches: any[]) => any | Promise<any>
}

function storeResult(stepId: string) {
  return ({ result, json, state, setState, option }: any): Signal => {
    const value = json !== undefined ? json : option !== undefined ? option : result
    setState((prev: any) => ({ ...prev, [stepId]: value }))
    void state
    return Signal.skip
  }
}

function storeAnswers(stepId: string) {
  return ({ answers, state, setState }: any): Signal => {
    setState((prev: any) => ({ ...prev, [stepId]: answers }))
    void state
    return Signal.skip
  }
}

/**
 * Fluent Wizard — the canonical interface. Steps plug cleanly:
 * `new Wizard(ai).addTextStep(...).addWizard('recon', recon).addApprovalStep({id})`
 */
export class Wizard {
  readonly Signal = Signal
  private ai: WizardAiAdapter
  private options: WizardOptions
  private steps: StepConfig[] = []
  private listeners: WizardListener[] = []
  private counters: Record<string, number> = {}
  private engine: WizardEngine | null = null

  constructor(ai: WizardAiAdapter, options: WizardOptions = {}) {
    this.ai = ai
    this.options = options
  }

  get signal(): typeof Signal {
    return this.Signal
  }

  private id(prefix: string, given?: string): string {
    if (given) return given
    const n = (this.counters[prefix] = (this.counters[prefix] ?? 0) + 1)
    return `${prefix}-${n}`
  }

  private llm(): WizardConfig['llm'] {
    return async (params) => {
      let instructions = params.instructions
      for (const [k, v] of Object.entries(params.memory ?? {})) {
        if ((v as any).mimeType?.startsWith('text/')) {
          instructions += `\n\n[${k} (${(v as any).mimeType})\n${(v as any).data}]`
        } else {
          instructions += `\n\n[${k}: ${(v as any).mimeType} attachment — not supported]`
        }
      }
      if (params.onToken && typeof this.ai.streamText === 'function') {
        const iterator = this.ai.streamText({
          instructions,
          model: params.model,
          maxTokens: params.max_tokens,
        })
        let acc = ''
        let next = await iterator.next()
        while (!next.done) {
          acc += next.value
          params.onToken(next.value)
          next = await iterator.next()
        }
        return acc
      }
      return this.ai.generateText({ instructions, model: params.model, maxTokens: params.max_tokens })
    }
  }

  addTextStep(opts: TextStepOptions): this {
    const id = this.id('text', opts.id)
    this.steps.push({
      type: 'text', id,
      instruction: opts.instruction,
      context: opts.context ?? (() => ({})),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
      ...(opts.catch ? { catch: opts.catch } : {}),
      handler: opts.handler ?? (storeResult(id) as TextStepConfig['handler']),
    })
    return this
  }

  addSelectStep(opts: SelectStepOptions): this {
    const id = this.id('select', opts.id)
    this.steps.push({
      type: 'select', id,
      instruction: opts.instruction,
      context: opts.context ?? (() => ({})),
      options: opts.options,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.catch ? { catch: opts.catch } : {}),
      handler: opts.handler ?? (storeResult(id) as SelectStepConfig['handler']),
    })
    return this
  }

  addObjectStep(opts: ObjectStepOptions): this {
    const id = this.id('object', opts.id)
    this.steps.push({
      type: 'object', id,
      instruction: opts.instruction,
      context: opts.context ?? (() => ({})),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
      ...(opts.catch ? { catch: opts.catch } : {}),
      handler: opts.handler ?? (storeResult(id) as ObjectStepConfig['handler']),
    })
    return this
  }

  addSchemaStep(opts: SchemaStepOptions): this {
    const id = this.id('schema', opts.id)
    this.steps.push({
      type: 'schema', id,
      instruction: opts.instruction,
      context: opts.context ?? (() => ({})),
      params: opts.params,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
      ...(opts.catch ? { catch: opts.catch } : {}),
      handler: opts.handler ?? (storeResult(id) as SchemaStepConfig['handler']),
    })
    return this
  }

  addComputeStep(opts: ComputeStepOptions): this {
    const id = this.id('compute', opts.id)
    this.steps.push({ type: 'compute', id, ...(opts.catch ? { catch: opts.catch } : {}), handler: opts.handler })
    return this
  }

  addClassifyStep(opts: ClassifyStepOptions): this {
    const id = this.id('classify', opts.id)
    this.steps.push({
      type: 'classify', id,
      context: opts.context ?? (() => ({})),
      questions: opts.questions,
      ...(opts.stateTemplate ? { stateTemplate: opts.stateTemplate } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.catch ? { catch: opts.catch } : {}),
      handler: opts.handler ?? (storeAnswers(id) as ClassifierStepConfig['handler']),
    })
    return this
  }

  addRouterStep(opts: RouterStepOptions): this {
    const id = this.id('router', opts.id)
    this.steps.push({
      type: 'router', id,
      context: opts.context ?? (() => ({})),
      instruction: opts.instruction,
      routes: opts.routes,
      criteria: opts.criteria,
      ...(opts.stateTemplate ? { stateTemplate: opts.stateTemplate } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.catch ? { catch: opts.catch } : {}),
      ...(opts.handler ? { handler: opts.handler } : {}),
    })
    return this
  }

  addSubWizardStep(opts: SubWizardStepOptions): this {
    const id = this.id('subwizard', opts.id)
    const cfg = opts.wizard ?? (opts.child ? opts.child.toConfig() : undefined)
    if (!cfg) throw new Error(`addSubWizardStep "${id}": provide wizard or child`)
    const step: SubWizardStepConfig = {
      type: 'subwizard', id, wizard: cfg,
      ...(opts.catch ? { catch: opts.catch } : {}),
      ...(opts.handler ? { handler: opts.handler } : {}),
      ...(opts.onFinish ? { onFinish: opts.onFinish } : {}),
    }
    this.steps.push(step)
    return this
  }

  /** Clean plug: child Wizard instance + merge on finish. */
  addWizard(id: string, child: Wizard, opts?: { catch?: string; handler?: SubWizardStepOptions['handler']; onFinish?: (parent: any, sub: any) => any | Promise<any> }): this {
    return this.addSubWizardStep({ id, child, ...opts })
  }

  addApprovalStep(opts: ApprovalStepOptions): this {
    const step: ApprovalStepConfig = {
      type: 'approval', id: opts.id,
      ...(opts.snapshot ? { snapshot: opts.snapshot } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.catch ? { catch: opts.catch } : {}),
      ...(opts.handler ? { handler: opts.handler } : {}),
    }
    if (this.steps.some(s => s.id === opts.id)) throw new Error(`Duplicate step id: ${opts.id}`)
    this.steps.push(step)
    return this
  }

  /** Parallel fan-out as an event: branches run concurrently, merged on finish. */
  addParallel(opts: ParallelStepOptions): this {
    const id = this.id('parallel', opts.id)
    const branches = opts.branches.map(b => (b instanceof Wizard ? b.toConfig() : b) as WizardConfig | StepConfig[])
    const step: ParallelStepConfig = {
      type: 'parallel', id, branches: branches as any,
      ...(opts.catch ? { catch: opts.catch } : {}),
      ...(opts.handler ? { handler: opts.handler } : {}),
      ...(opts.onFinish ? { onFinish: opts.onFinish } : {}),
    }
    this.steps.push(step)
    return this
  }

  toConfig(): WizardConfig {
    const config: WizardConfig = { steps: this.steps, llm: this.llm() }
    if (this.options.instruction) config.instruction = this.options.instruction
    if (typeof this.options.maxRetries === 'number') config.maxRetries = this.options.maxRetries
    if (this.options.classifier) config.classify = this.options.classifier
    if (this.options.baseUrl) config.baseUrl = this.options.baseUrl
    if (this.options.token) config.token = this.options.token
    if (this.options.persistence) config.persistence = this.options.persistence
    return config
  }

  on(listener: WizardListener): this {
    this.listeners.push(listener)
    return this
  }

  private buildEngine(): WizardEngine {
    const engine = new WizardEngine(this.toConfig(), 'wizard')
    for (const l of this.listeners) engine.on(l)
    return engine
  }

  async run(initialState?: any): Promise<any> {
    this.engine = this.buildEngine()
    await this.engine.run(initialState)
    return this.engine.getState()
  }

  async resumeFrom(stepId?: string | null, state?: any): Promise<any> {
    if (!this.engine) this.engine = this.buildEngine()
    await this.engine.resumeFrom(stepId, state)
    return this.engine.getState()
  }

  async hydrate(base?: any): Promise<any> {
    if (!this.engine) this.engine = this.buildEngine()
    await this.engine.hydrate(base)
    return this.engine.getState()
  }

  getState(): any {
    return this.engine ? this.engine.getState() : undefined
  }

  setState(updater: (prev: any) => any): void {
    this.engine?.setState(updater)
  }

  approve(id: string, comment?: string): void {
    this.engine?.approve(id, comment)
  }

  deny(id: string, comment?: string): void {
    this.engine?.deny(id, comment)
  }

  stop(): void {
    this.engine?.stop()
  }

  isRunning(): boolean {
    return this.engine ? this.engine.isRunning() : false
  }

  getStatus(): string {
    return this.engine ? this.engine.getStatus() : 'idle'
  }
}

export function createWizard(ai: WizardAiAdapter, options?: WizardOptions): Wizard {
  return new Wizard(ai, options)
}

export type { MemoryValue }
