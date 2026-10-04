/**
 * Build `ctx.ai.agents` and `ctx.ai.tools`.
 *
 * `create` is a factory that runs nothing. It records a declaration and returns
 * a handle, so the same name asked for twice is the same agent — whether it is
 * being re-declared by a second action, or read by a third one that never
 * declared it at all.
 *
 * The registry is durable storage with a cache in front, not a local map. That
 * distinction is the whole feature: a map would make an agent reachable only from
 * the invocation that made it, which is not what "declare an agent" means.
 *
 * ## Why a handle carries its config
 *
 * `mary.instruction` is a plain string, not a promise. An author reading the
 * agent they just declared should not have to await to learn what it is, and a
 * synchronous read is the only kind that reads like one. So a handle is a
 * snapshot taken when it was built, and `update` returns a fresh one — which is
 * also why a run in flight keeps the instruction it started with.
 */

import type { ChatTransport } from './model'
import { runAgent, type AgentHost } from './loop'
import { toHandle } from './tools'
import { ProjectRegistries } from './store'
import type {
  AgentDeclaration,
  AgentHandle,
  AgentRunOptions,
  AgentRunResult,
  ToolDeclaration,
  ToolHandle,
} from './types'

/** What the host must provide to build the two handles. */
export interface AgentsHost extends AgentHost {
  /** Durable storage for agent and tool declarations. */
  registries: ProjectRegistries
  /** Where a run's completions go, for the default model. */
  transport: ChatTransport
}

function assertName(name: unknown, what: string): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`ctx.ai.${what} requires a name`)
  }
  return name.trim()
}

/** Build a handle over one snapshot of an agent's declaration. */
function agentHandle(
  host: AgentsHost,
  name: string,
  record: { instruction: string; description?: string; displayName?: string; model?: string },
): AgentHandle {
  return {
    name,
    instruction: record.instruction,
    description: record.description,
    displayName: record.displayName,

    async update(patch: Partial<AgentDeclaration>) {
      const next = await host.registries.updateAgent(name, patch)
      return agentHandle(host, name, next)
    },

    async run(task: string, options?: AgentRunOptions): Promise<AgentRunResult> {
      if (typeof task !== 'string' || !task.trim()) {
        throw new Error(`agent "${name}".run() requires a task string`)
      }

      // Resolve the declarations for the names this task may call. A name with
      // nothing behind it is an error rather than a silent no-op: a run that
      // believes it has tools and cannot call them is worse than one that plainly
      // has none.
      const wanted = options?.tools ?? []
      const declarations: Record<string, ToolDeclaration> = {}
      for (const tool of wanted) {
        const registered = await host.registries.getTool(tool)
        if (!registered) {
          throw new Error(
            `agent "${name}" was given the tool "${tool}", which is not registered. ` +
              `Declare it first: ctx.ai.tools.register('${tool}', { describe }).`,
          )
        }
        declarations[tool] = { describe: registered.describe, params: registered.params }
      }

      return runAgent({
        host,
        transport: host.transport,
        agent: { name, instruction: record.instruction, model: record.model },
        declarations,
        task,
        options: { ...options, model: options?.model ?? record.model },
      })
    },
  }
}

/**
 * The agents handle — `ctx.ai.agents`.
 *
 * Every method reads the durable registry, so `get` answers from any action, any
 * event, cloud or local.
 */
export function buildAgentsHandle(host: AgentsHost) {
  return {
    /**
     * Declare an agent, or return the existing one.
     *
     * Runs nothing. Idempotent, so declaring the same name twice does not
     * discard the first declaration — call `update` to change one.
     */
    async create(name: string, declaration: AgentDeclaration): Promise<AgentHandle> {
      const clean = assertName(name, 'agents.create')
      const record = await host.registries.createAgent(clean, declaration)
      return agentHandle(host, clean, record)
    },

    /** An agent by name, or undefined when it was never declared. */
    async get(name: string): Promise<AgentHandle | undefined> {
      const clean = assertName(name, 'agents.get')
      const record = await host.registries.getAgent(clean)
      return record ? agentHandle(host, clean, record) : undefined
    },

    /** Every declared agent, with its description. */
    async list(): Promise<AgentHandle[]> {
      const records = await host.registries.listAgents()
      return records.map((r) => agentHandle(host, r.name, r))
    },

    async has(name: string): Promise<boolean> {
      return host.registries.hasAgent(assertName(name, 'agents.has'))
    },

    async remove(name: string): Promise<boolean> {
      return host.registries.removeAgent(assertName(name, 'agents.remove'))
    },
  }
}

/**
 * The tools handle — `ctx.ai.tools`.
 *
 * Registration is idempotent and writes through, so the same `register` in two
 * actions is harmless and the description a reader sees is the one registered
 * last. There is no tool function to store: a tool's body is the server action
 * of the same name.
 */
export function buildToolsHandle(host: AgentsHost) {
  return {
    async register(name: string, declaration: ToolDeclaration = {}): Promise<ToolHandle> {
      const clean = assertName(name, 'tools.register')
      const record = await host.registries.registerTool(clean, declaration)
      return toHandle(record.name, record)
    },

    async get(name: string): Promise<ToolHandle | undefined> {
      const record = await host.registries.getTool(assertName(name, 'tools.get'))
      return record ? toHandle(record.name, record) : undefined
    },

    async list(): Promise<ToolHandle[]> {
      const records = await host.registries.listTools()
      return records.map((r) => toHandle(r.name, r))
    },

    async has(name: string): Promise<boolean> {
      return host.registries.hasTool(assertName(name, 'tools.has'))
    },

    async remove(name: string): Promise<boolean> {
      return host.registries.removeTool(assertName(name, 'tools.remove'))
    },
  }
}

/** What `ctx.ai.agents` and `ctx.ai.tools` are, as one object. */
export interface AiAgentSurface {
  agents: ReturnType<typeof buildAgentsHandle>
  tools: ReturnType<typeof buildToolsHandle>
}

/**
 * Build both handles over one host.
 *
 * They share the registries because they are the same kind of record: a name, a
 * bit of prose, and nothing else. Splitting them across two stores would mean
 * two caches to warm and two prefixes to prune.
 */
export function buildAgentSurface(host: AgentsHost): AiAgentSurface {
  return { agents: buildAgentsHandle(host), tools: buildToolsHandle(host) }
}
