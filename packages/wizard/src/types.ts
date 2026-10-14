import type { VectorAdapter, VectorResult } from './vector'
import { Signal } from './Signal'

export interface MemoryValue {
  mimeType: string
  data: string
  name?: string
}

export function isMemoryValue(v: unknown): v is MemoryValue {
  return typeof v === 'object' && v !== null && 'mimeType' in v && 'data' in v
}

export interface StepOption {
  id: string
  label: string
  description?: string
  freeform?: boolean
}

export interface SchemaParam {
  name: string
  type: string
  description: string
  required: boolean
}

export interface TextStepConfig {
  type: 'text'
  id: string
  instruction: string
  context: (state: any) => Record<string, any>
  model?: string
  maxTokens?: number
  catch?: string
  handler: (ctx: TextStepContext) => Signal | Promise<Signal>
}

export interface SelectStepConfig {
  type: 'select'
  id: string
  instruction: string
  context: (state: any) => Record<string, any>
  options: StepOption[]
  model?: string
  catch?: string
  handler: (ctx: SelectStepContext) => Signal | Promise<Signal>
}

export interface ObjectStepConfig {
  type: 'object'
  id: string
  instruction: string
  context: (state: any) => Record<string, any>
  model?: string
  catch?: string
  handler: (ctx: ObjectStepContext) => Signal | Promise<Signal>
}

export interface SchemaStepConfig {
  type: 'schema'
  id: string
  instruction: string
  context: (state: any) => Record<string, any>
  params: SchemaParam[] | ((state: any) => SchemaParam[])
  model?: string
  catch?: string
  handler: (ctx: SchemaStepContext) => Signal | Promise<Signal>
}

export interface ComputeStepConfig {
  type: 'compute'
  id: string
  catch?: string
  handler: (ctx: ComputeStepContext) => Signal | Promise<Signal>
}

export interface SubWizardStepConfig {
  type: 'subwizard'
  id: string
  wizard: WizardConfig
  catch?: string
  handler?: (ctx: SubWizardStepContext) => Signal | Promise<Signal>
  /** Merge parent + sub state into the parent state. Defaults to {...parent, ...sub}. */
  onFinish?: (parent: any, sub: any) => any | Promise<any>
}

export interface ApprovalStepConfig {
  type: 'approval'
  id: string
  snapshot?: string[] | ((state: any) => Record<string, unknown>)
  timeoutMs?: number
  catch?: string
  handler?: (ctx: ApprovalStepContext) => Signal | Promise<Signal>
  onFinish?: (parent: any, sub: any) => any | Promise<any>
}

export interface ApprovalStepContext {
  approved: boolean
  comment?: string
  snapshot: Record<string, unknown>
  state: any
  setState: (updater: (prev: any) => any) => void
}

export interface QueryVectorStepConfig {
  type: 'queryVector'
  id: string
  query: string
  context?: (state: any) => Record<string, any>
  patterns?: string[]
  topK?: number
  adapter?: VectorAdapter
  model?: string
  catch?: string
  handler: (ctx: QueryVectorStepContext) => Signal | Promise<Signal>
}

export interface QueryVectorStepContext {
  query: string
  results: VectorResult[]
  state: any
  setState: (updater: (prev: any) => any) => void
}

export interface BooleanQuestion {
  type: 'boolean'
  instructions: string
  criteria?: { true: string; false: string } | Record<string, string>
}

export interface ChoiceQuestion {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export interface ScoreQuestion {
  type: 'score'
  instructions: string
  criteria: string[]
}

export type ClassifierQuestion = BooleanQuestion | ChoiceQuestion | ScoreQuestion

export type ClassifierQuestions = Record<string, ClassifierQuestion>

export interface ClassifierAnswer {
  type: 'boolean' | 'choice' | 'score'
  boolean?: number
  choice?: string
  confidence?: number
  probabilities?: Record<string, number>
  score?: number
  legend?: Record<string, string>
  [k: string]: unknown
}

export type ClassifierAnswers = Record<string, ClassifierAnswer>

export interface ClassifierStepConfig {
  type: 'classify'
  id: string
  context: (state: any) => Record<string, any>
  questions: ClassifierQuestions | ((state: any) => ClassifierQuestions)
  /** Optional template rendered against text context to build a string state. Defaults to the context object (or full state when context is empty). */
  stateTemplate?: string
  model?: string
  catch?: string
  handler: (ctx: ClassifierStepContext) => Signal | Promise<Signal>
}

export interface RouterStepConfig {
  type: 'router'
  id: string
  context: (state: any) => Record<string, any>
  instruction: string
  /** Maps choice -> destination step id. Unmapped choices fail loudly (no fallbacks). */
  routes: Record<string, string>
  /** Human-readable description per choice, sent as the choice criteria. */
  criteria: Record<string, string>
  /** Optional template rendered against text context to build a string state. */
  stateTemplate?: string
  model?: string
  catch?: string
  handler?: (ctx: RouterStepContext) => Signal | Promise<Signal>
}

export interface ClassifierStepContext {
  answers: ClassifierAnswers
  state: any
  setState: (updater: (prev: any) => any) => void
}

export interface RouterStepContext {
  choice: string
  confidence?: number
  probabilities?: Record<string, number>
  answers: ClassifierAnswers
  state: any
  setState: (updater: (prev: any) => any) => void
}

export interface ParallelStepConfig {
  type: 'parallel'
  id: string
  /** Branches run concurrently. Each branch is a step list (or wizard config). */
  branches: WizardConfig[] | StepConfig[][]
  catch?: string
  handler?: (ctx: ParallelStepContext) => Signal | Promise<Signal>
  /** Merge parent + branch states. Defaults to {...parent, ...mergedBranches}. */
  onFinish?: (parent: any, branches: any[]) => any | Promise<any>
}

export interface ParallelStepContext {
  state: any
  parent: any
  branches: any[]
  setState: (updater: (prev: any) => any) => void
}

export type StepConfig = TextStepConfig | SelectStepConfig | ObjectStepConfig | SchemaStepConfig | ComputeStepConfig | SubWizardStepConfig | QueryVectorStepConfig | ClassifierStepConfig | RouterStepConfig | ApprovalStepConfig | ParallelStepConfig

export interface TextStepContext {
  result: string
  state: any
  setState: (updater: (prev: any) => any) => void
}

export interface SelectStepContext {
  result: string
  option: string | null
  freeform?: string
  state: any
  setState: (updater: (prev: any) => any) => void
}

export interface ObjectStepContext {
  result: string
  json: any
  state: any
  setState: (updater: (prev: any) => any) => void
}

export interface SchemaStepContext {
  result: string
  json: any
  state: any
  setState: (updater: (prev: any) => any) => void
}

export interface ComputeStepContext {
  state: any
  setState: (updater: (prev: any) => any) => void
  ai: (instruction: string, memory?: Record<string, MemoryValue>, model?: string) => Promise<string>
}

export interface SubWizardStepContext {
  state: any
  subState: any
  /** Parent state before the subwizard ran. */
  parent?: any
  /** Alias for parent (merge inputs). */
  sub?: any
  setState: (updater: (prev: any) => any) => void
}

export type StepContext = TextStepContext | SelectStepContext | ObjectStepContext | SchemaStepContext | ComputeStepContext | SubWizardStepContext | QueryVectorStepContext | ClassifierStepContext | RouterStepContext | ApprovalStepContext | ParallelStepContext

/**
 * How a wizard run survives a restart.
 *
 * `checkpoint(stepId, state)` is called at step boundaries only — never on
 * every state change. State snapshots are large (a recon run holds a whole
 * file graph), so persisting them per mutation turns a normal run into tens
 * of megabytes of writes; boundaries give the same resume behaviour for a
 * fraction of the I/O.
 */
export interface WizardPersistence {
  checkpoint: (stepId: string | null, state: any) => void | Promise<void>
  load: () => WizardCheckpoint | null | Promise<WizardCheckpoint | null>
}

export interface WizardCheckpoint {
  stepId: string | null
  state: any
}

export interface WizardConfig {
  steps: StepConfig[]
  instruction?: string
  baseUrl?: string
  token?: string
  llm?: (params: {
    instructions: string
    memory?: Record<string, MemoryValue>
    model?: string
    max_tokens?: number
    onToken?: (token: string) => void
  }) => Promise<string>
  classify?: (params: {
    state: unknown
    questions: ClassifierQuestions
    model?: string
  }) => Promise<ClassifierAnswers>
  vectorAdapter?: VectorAdapter
  maxRetries?: number
  persistence?: WizardPersistence
}

export type WizardEvent =
  | { type: 'step:start'; step: StepConfig }
  | { type: 'step:complete'; step: StepConfig; result?: string; signal: Signal }
  | { type: 'token'; step: StepConfig; token: string }
  | { type: 'state:changed'; state: any }
  | { type: 'wait'; step: StepConfig; snapshot: Record<string, unknown> }
  | { type: 'done'; state: any }
  | { type: 'stopped'; state: any }
  | { type: 'error'; error: Error }
