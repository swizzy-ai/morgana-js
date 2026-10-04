/**
 * The agent and tool surface — `ctx.ai.agents` and `ctx.ai.tools`.
 *
 * ## Declared here, implemented in the package
 *
 * `@morgana/agents` owns the loop and the storage. These are the *promises* the
 * context makes, and they live in the SDK for the same reason `ctx.collections`
 * lives in the SDK: an author writes against the contract, not against whichever
 * runtime happens to be answering. So a project that installs only the SDK still
 * typechecks an action that runs an agent.
 *
 * ## Async because storage is not memory
 *
 * Every method here returns a promise, for the same reason
 * `CollectionsHandle` does. An agent declared by one action is read by another,
 * so reading one reaches storage, and storage is not memory. A sync read would
 * compile cleanly and then be `undefined` at runtime.
 *
 * ## A tool is an action
 *
 * `register` records a description and a parameter shape. The body is the server
 * action of the same name, reached through the same runner `ctx.actions.run`
 * uses — so a tool inherits the calling invocation's session and can reach its
 * collections and files. There is no permission layer to configure because there
 * is nothing to bypass.
 */

/** One parameter of a tool, as the model is told about it. */
export interface ToolParamSpec {
  /** What this parameter is for. */
  describe?: string
  /** An example value, which improves the model's first guess. */
  example?: unknown
  /** Restrict the value. Omitted means "whatever the model sends". */
  oneOf?: readonly string[]
}

/**
 * A parameter shape: `{ id: 'string', 'note?': 'string' }`.
 *
 * A bare string is the type. A trailing `?` makes it optional. An object nests.
 * A `ToolParamSpec` describes one parameter in more detail.
 */
export interface ToolParams {
  [name: string]: string | ToolParamSpec | ToolParams
}

/** What a tool is for. The description is the part that matters. */
export interface ToolDeclaration {
  /**
   * What the tool does. Only the first paragraph reaches the model, so put the
   * summary first and any reasoning after a blank line.
   */
  describe?: string
  /** Parameter shape. Omitted means "accept whatever the model sends". */
  params?: ToolParams
}

/** A tool as `ctx.ai.tools` reports it. */
export interface ToolHandle {
  readonly name: string
  readonly describe?: string
  readonly params?: ToolParams
}

/** The project's tools — `ctx.ai.tools`. */
export interface ToolsHandle {
  /**
   * Declare or update a tool. The body is the server action of the same name.
   *
   * Idempotent, so the same call in two actions is harmless.
   */
  register(name: string, declaration?: ToolDeclaration): Promise<ToolHandle>
  /** A tool by name, or undefined when it was never registered. */
  get(name: string): Promise<ToolHandle | undefined>
  /** Every registered tool. */
  list(): Promise<ToolHandle[]>
  /** True when this name is registered. */
  has(name: string): Promise<boolean>
  /** Forget a tool. Resolves true when one was removed. */
  remove(name: string): Promise<boolean>
}

/** What an agent is. Everything but the name. */
export interface AgentDeclaration {
  /**
   * How the agent behaves. Its standing instruction, not the task.
   *
   * This is the frame everything else is read inside, so keep it short and put
   * the specifics of one job in `run`'s `context`.
   */
  instruction: string
  /**
   * What this agent is for, in a sentence.
   *
   * Shown by `ctx.ai.agents.list()`. It is *not* sent to the model — only
   * `instruction` is.
   */
  description?: string
  /** Human-readable label. Defaults to the name. */
  displayName?: string
  /** Default model override for this agent. */
  model?: string
}

/** One call the model asked for. */
export interface ToolCall {
  /** The action name. */
  name: string
  /** Arguments, already parsed. */
  args: Record<string, unknown>
}

/** What one tool returned, as fed back to the model. */
export interface ToolResult {
  name: string
  ok: boolean
  value?: unknown
  /** Why it failed. Also fed back, so the model can recover rather than stall. */
  error?: string
}

/** One turn of a run. */
export interface AgentStep {
  /** What the model said before calling anything. */
  text?: string
  /** Tools it called this turn. */
  calls?: ToolCall[]
  /** What those tools returned. */
  results?: ToolResult[]
}

/** One message in a run. */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

/** How to run one task. */
export interface AgentRunOptions {
  /**
   * Action names this task may call. Each must be a registered tool.
   *
   * A name with no tool behind it is an error rather than a silent no-op.
   */
  tools?: string[]
  /**
   * What this task's agent should see, beyond the task itself.
   *
   * Rendered as JSON and placed under the task. This is where the specifics
   * live, so the standing instruction stays short.
   */
  context?: unknown
  /** Extra instruction for this run only, appended after the agent's own. */
  instructions?: string
  /** Model override. Defaults to the agent's, then the provider's. */
  model?: string
  /** Token cap per model call. */
  maxTokens?: number
  /** Messages to start from, in addition to the task. */
  history?: AgentMessage[]
  /** Called after each turn, as it happens. */
  onStep?: (step: AgentStep) => void
  /** Channel to broadcast the agent's prose to as it goes. */
  channel?: string
  /** Broadcast each turn as it arrives, rather than one message at the end. */
  stream?: boolean
}

/** The outcome of a whole run. */
export interface AgentRunResult {
  /** The agent's final answer. */
  output: string
  /** Every tool call made, in order. */
  calls: ToolCall[]
  /** True when the run stopped because the internal turn cap was reached. */
  truncated: boolean
  /** The turn-by-turn trace. */
  steps: AgentStep[]
  finishReason: 'stop' | 'turn_cap' | 'error'
}

/** One agent. A handle is a snapshot, not a connection. */
export interface AgentHandle {
  readonly name: string
  readonly instruction: string
  readonly description?: string
  readonly displayName?: string

  /** Change the standing instruction. A run in flight keeps the old one. */
  update(patch: Partial<AgentDeclaration>): Promise<AgentHandle>

  /**
   * Run one task and wait for the answer. Tools are supplied here, never at
   * creation.
   */
  run(task: string, options?: AgentRunOptions): Promise<AgentRunResult>
}

/** Project agents — `ctx.ai.agents`. */
export interface AgentsHandle {
  /**
   * Declare an agent, or return the existing one.
   *
   * Runs nothing. Idempotent, so declaring the same name twice does not discard
   * the first declaration — call `update` to change one.
   */
  create(name: string, declaration: AgentDeclaration): Promise<AgentHandle>
  /** An agent by name, or undefined when it was never declared. */
  get(name: string): Promise<AgentHandle | undefined>
  /** Every declared agent, with its description. */
  list(): Promise<AgentHandle[]>
  /** True when this name is declared. */
  has(name: string): Promise<boolean>
  /** Forget an agent. Resolves true when one was removed. */
  remove(name: string): Promise<boolean>
}

/**
 * Events an agent emits, bindable with `on:` like any other backend event.
 *
 *   agent:task:started    once, when a run begins
 *   agent:tool:called     once per tool call, with name and args
 *   agent:task:completed  once, with the output
 *   agent:task:failed     once, when a run throws
 *   agent:broadcast       when a run publishes to a channel
 */
export const AGENT_EVENTS = {
  started: 'agent:task:started',
  tool: 'agent:tool:called',
  completed: 'agent:task:completed',
  failed: 'agent:task:failed',
  broadcast: 'agent:broadcast',
} as const
