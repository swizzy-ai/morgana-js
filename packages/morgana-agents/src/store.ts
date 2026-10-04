/**
 * Durable registries — what makes an agent outlive the invocation that made it.
 *
 * ## Why storage at all
 *
 * An agent is a name and an instruction. That pair is small, and it is worth
 * more than the action that happened to run it: an agent declared by one action
 * should be reachable from every other action, every event, on the cloud,
 * forever. A registry that lived in a function's local scope would make every
 * one of those statements false, so the declaration is written down instead.
 *
 * ## What persists
 *
 * Two records per project. An **agent**: its name, instruction, and the two
 * lines of prose that describe it. A **tool**: its name, description and
 * parameter shape. Both are plain JSON, and both are keyed by name so one read
 * answers one question.
 *
 * ## What does not
 *
 * Nothing that can only exist as code. A tool's body is always a server action,
 * which the runtime already stores, so there is no function here to lose — the
 * thing that disappears when an invocation ends cannot be dropped by an
 * invocation that never had it.
 */

import type { AgentDeclaration, ToolDeclaration } from './types'

/** The storage surface the registries need. KV, in the worker. */
export interface KeyValueStore {
  /** The value, or null when the key is absent. */
  get<T>(key: string): Promise<T | null>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  /** Every key under a prefix. Bounded: ask for a prefix, never for all. */
  keys(prefix: string): Promise<string[]>
}

/** A persisted agent. */
export interface AgentRecord {
  name: string
  instruction: string
  description?: string
  displayName?: string
  model?: string
  createdAt: number
  updatedAt: number
}

/** A persisted tool. */
export interface ToolRecord {
  name: string
  describe?: string
  params?: ToolDeclaration['params']
  createdAt: number
  updatedAt: number
}

export interface RegistriesOptions {
  store: KeyValueStore
  /** Key prefix for agents. Tool keys hang off this with a `tools:` sibling. */
  prefix: string
  /** Clock, so tests can assert on timestamps without waiting. */
  now?: () => number
}

function requireName(name: unknown, what: string): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`ctx.ai.${what} requires a name`)
  }
  return name.trim()
}

/**
 * The project's agents and tools.
 *
 * Both registries read through a per-instance cache and write straight through,
 * so a hot Durable Object answers every agent question without touching storage.
 * The cache is populated once, on the first read that misses — a `list()` per
 * instance lifetime rather than per invocation, which matters because a metered
 * listing that fails looks identical to an empty project.
 */
export class ProjectRegistries {
  private readonly store: KeyValueStore
  private readonly prefix: string
  private readonly now: () => number

  private agentCache: Map<string, AgentRecord> | null = null
  private toolCache: Map<string, ToolRecord> | null = null

  constructor(options: RegistriesOptions) {
    this.store = options.store
    this.prefix = options.prefix
    this.now = options.now ?? (() => Date.now())
  }

  private agentKey(name: string): string {
    return `${this.prefix}:${name}`
  }

  private get toolPrefix(): string {
    return `${this.prefix.replace(/:agents$/, '')}:tools`
  }

  private toolKey(name: string): string {
    return `${this.toolPrefix}:${name}`
  }

  // ─── Agents ────────────────────────────────────────────────────────────────

  private async agents(): Promise<Map<string, AgentRecord>> {
    if (this.agentCache) return this.agentCache
    const loaded = new Map<string, AgentRecord>()
    for (const key of await this.store.keys(`${this.prefix}:`)) {
      const record = await this.store.get<AgentRecord>(key)
      if (record && typeof record.name === 'string' && typeof record.instruction === 'string') {
        loaded.set(record.name, record)
      }
    }
    this.agentCache = loaded
    return loaded
  }

  /**
   * Declare an agent, or return the existing one.
   *
   * Idempotent: a second `create` for the same name is a no-op, so the same
   * declaration in two actions cannot quietly discard the first one's config.
   * Change one with `update`.
   */
  async createAgent(name: string, declaration: AgentDeclaration): Promise<AgentRecord> {
    const clean = requireName(name, 'agents.create')
    if (!declaration || typeof declaration.instruction !== 'string' || !declaration.instruction.trim()) {
      throw new Error(`ctx.ai.agents.create("${clean}") requires an instruction`)
    }

    const existing = (await this.agents()).get(clean)
    if (existing) return existing

    const at = this.now()
    const record: AgentRecord = {
      name: clean,
      instruction: declaration.instruction,
      description: declaration.description,
      displayName: declaration.displayName ?? clean,
      model: declaration.model,
      createdAt: at,
      updatedAt: at,
    }
    await this.store.put(this.agentKey(clean), record)
    this.agentCache!.set(clean, record)
    return record
  }

  async getAgent(name: string): Promise<AgentRecord | undefined> {
    return (await this.agents()).get(requireName(name, 'agents.get'))
  }

  async listAgents(): Promise<AgentRecord[]> {
    return [...(await this.agents()).values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  async hasAgent(name: string): Promise<boolean> {
    return (await this.agents()).has(requireName(name, 'agents.has'))
  }

  /** Patch an agent's declaration. A run in flight keeps what it started with. */
  async updateAgent(name: string, patch: Partial<AgentDeclaration>): Promise<AgentRecord> {
    const clean = requireName(name, 'agents.update')
    const current = await this.getAgent(clean)
    if (!current) {
      throw new Error(`agent "${clean}" has not been declared`)
    }
    if (patch.instruction !== undefined) {
      if (typeof patch.instruction !== 'string' || !patch.instruction.trim()) {
        throw new Error(`agent "${clean}".update({ instruction }) requires a non-empty string`)
      }
    }
    const next: AgentRecord = {
      ...current,
      ...patch,
      name: current.name,
      updatedAt: this.now(),
    }
    await this.store.put(this.agentKey(clean), next)
    this.agentCache!.set(clean, next)
    return next
  }

  async removeAgent(name: string): Promise<boolean> {
    const clean = requireName(name, 'agents.remove')
    if (!(await this.agents()).has(clean)) return false
    await this.store.delete(this.agentKey(clean))
    this.agentCache!.delete(clean)
    return true
  }

  // ─── Tools ─────────────────────────────────────────────────────────────────

  private async tools(): Promise<Map<string, ToolRecord>> {
    if (this.toolCache) return this.toolCache
    const loaded = new Map<string, ToolRecord>()
    for (const key of await this.store.keys(`${this.toolPrefix}:`)) {
      const record = await this.store.get<ToolRecord>(key)
      if (record && typeof record.name === 'string') loaded.set(record.name, record)
    }
    this.toolCache = loaded
    return loaded
  }

  /**
   * Declare or update a tool.
   *
   * The body is the server action of the same name, so there is nothing else to
   * store. A description is what makes a tool get called correctly, and it is
   * optional — a tool with none still works, and the prompt says so.
   */
  async registerTool(name: string, declaration: ToolDeclaration = {}): Promise<ToolRecord> {
    const clean = requireName(name, 'tools.register')
    const existing = (await this.tools()).get(clean)
    const at = this.now()
    const record: ToolRecord = {
      name: clean,
      describe: declaration.describe,
      params: declaration.params,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    }
    await this.store.put(this.toolKey(clean), record)
    this.toolCache!.set(clean, record)
    return record
  }

  async getTool(name: string): Promise<ToolRecord | undefined> {
    return (await this.tools()).get(requireName(name, 'tools.get'))
  }

  async listTools(): Promise<ToolRecord[]> {
    return [...(await this.tools()).values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  async hasTool(name: string): Promise<boolean> {
    return (await this.tools()).has(requireName(name, 'tools.has'))
  }

  async removeTool(name: string): Promise<boolean> {
    const clean = requireName(name, 'tools.remove')
    if (!(await this.tools()).has(clean)) return false
    await this.store.delete(this.toolKey(clean))
    this.toolCache!.delete(clean)
    return true
  }

  /** Drop every cached read, so the next read comes from storage. */
  invalidate(): void {
    this.agentCache = null
    this.toolCache = null
  }

  /**
   * Remove tools whose action is gone.
   *
   * Called by a deploy: an action that was deleted must not leave a tool behind
   * that the model can still call into nothing. Tools with no action at all are
   * left alone — the action may be deployed by another project route — so this
   * is a conservative prune, not a reconciliation.
   */
  async pruneTools(isDeployed: (name: string) => Promise<boolean>): Promise<string[]> {
    const dropped: string[] = []
    for (const record of await this.listTools()) {
      if (await isDeployed(record.name)) continue
      await this.removeTool(record.name)
      dropped.push(record.name)
    }
    return dropped
  }
}
