/**
 * `@morgana/agents` — an agent is a name and an instruction.
 *
 * ## The three pieces
 *
 * A **provider** is where a completion goes. It is one transport, so a project
 * can use the Morgana route with no credentials and swap in its own key without
 * the loop noticing.
 *
 * **Tools** are actions. `ctx.ai.tools.register('closeTask', { describe })` says
 * what the model is told about a tool; the body is the server action of that
 * name, reached through the same runner `ctx.actions.run` uses. So a tool can
 * read collections and files, and inherits the calling action's session, because
 * it *is* an action.
 *
 * An **agent** is an instruction plus the tasks it is given. `create` writes the
 * declaration down; `run` is the expensive part.
 *
 * ## What survives
 *
 * The declaration, the tool descriptions, and nothing that can only exist as
 * code. Everything an agent knows about itself is a string, which is why an agent
 * declared by one action is reachable from every action, every event, on the
 * cloud, forever.
 *
 * ```ts
 * const mary = await ctx.ai.agents.create('mary', {
 *   instruction: 'You manage tasks. Be terse.',
 *   description: 'Task completion agent',
 * })
 *
 * const result = await mary.run('Close everything done for today', {
 *   tools: ['listTasks', 'closeTask'],
 *   context: { user: ctx.auth.user?.email },
 * })
 * ```
 */

// Types — what an author sees
export type {
  AgentDeclaration,
  AgentHandle,
  AgentMessage,
  AgentRunOptions,
  AgentRunResult,
  AgentStep,
  AgentsHandle,
  ToolCall,
  ToolDeclaration,
  ToolHandle,
  ToolParamSpec,
  ToolParams,
  ToolResult,
  ToolsHandle,
} from './types'

// The loop
export {
  AGENT_EVENTS,
  MAX_TURNS,
  buildMessages,
  runAgent,
  type AgentHost,
  type RunAgentConfig,
} from './loop'

// The handles — what the runtime builds for `ctx.ai`
export {
  buildAgentSurface,
  buildAgentsHandle,
  buildToolsHandle,
  type AgentsHost,
  type AiAgentSurface,
} from './context'

// Storage — the durable registries behind both handles
export {
  ProjectRegistries,
  type AgentRecord,
  type KeyValueStore,
  type RegistriesOptions,
  type ToolRecord,
} from './store'

// Tools
export { invokeTool, schemaOf, specOf, summarize, toHandle, type ToolRunner } from './tools'
export { checkArgs, paramsSchema, type ToolSchema, type ToolSchemaProperty } from './schema'

// The model every provider wraps
export {
  createModel,
  readCalls,
  readText,
  type ChatTransport,
  type ModelConfig,
  type ToolSpec,
} from './model'

// Providers
export {
  DEFAULT_MORGANA_MODEL,
  createAnthropicTransport,
  createMorganaTransport,
  createOllamaTransport,
  createOpenAITransport,
  providerModel,
  type MorganaProviderOptions,
  type ProviderOptions,
} from './providers'

// Provider selection — the one place that turns config into a transport
export {
  PROVIDERS,
  providerFromEnv,
  resolveTransport,
  type ProviderConfig,
  type ProviderName,
} from './provider'

// Nanoagent's loop vocabulary, re-exported so a caller does not have to depend on
// it directly to read a halt reason.
export { HaltKind, type HaltStatus } from '@hbbio/nanoagent'
