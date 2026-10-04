/**
 * Tools — an action, and something the model is told about it.
 *
 * A tool is the name of a server action. There is no tool function and no
 * second execution path: the runtime calls the action through the same runner
 * `ctx.actions.run` uses, so a tool reaches exactly what the action that ran the
 * agent could already reach — its collections, its files, its auth, its session.
 *
 * That is why there is no permission layer to configure. There is nothing to
 * bypass.
 */

import { checkArgs, paramsSchema, type ToolSchema } from './schema'
import type { ToolCall, ToolDeclaration, ToolHandle, ToolParams, ToolResult } from './types'
import type { ToolSpec } from './model'

/** A tool plus everything the model needs to be told about it. */
export interface ResolvedTool {
  name: string
  describe?: string
  params?: ToolParams
}

/** What the loop needs in order to run a task. */
export interface ToolRunner {
  /**
   * Invoke the action of that name. Throws on failure, and the caller turns
   * that into a tool error the model can recover from.
   *
   * One method, and deliberately so. The tool loop already knows which names it
   * published and what schema each one carried, so a second lookup would only be
   * a second thing to disagree.
   */
  run(name: string, args: Record<string, unknown>): Promise<unknown>
}

/**
 * The first paragraph of a description, which is all a model is told.
 *
 * Everything after a blank line is the author explaining themselves, and a tool
 * description is a prompt — extra reasoning there costs tokens and buys nothing.
 */
export function summarize(describe: string | undefined, name: string): string {
  const first = describe?.split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim()
  // A tool with no doc is still usable — the model knows the name — but the
  // prompt says so plainly rather than leaving the model to guess.
  return first || `Runs the "${name}" action. No description was registered.`
}

/** The JSON Schema a tool is published to the model with. */
export function schemaOf(declaration: ToolDeclaration | undefined): ToolSchema {
  return declaration?.params ? paramsSchema(declaration.params) : { type: 'object', properties: {} }
}

/**
 * Turn one declaration into the tool list the model sees.
 *
 * The declared parameters become the schema, and `checkArgs` runs before the
 * action does — so a malformed call is reported as a tool error the model can
 * act on, rather than reaching the action as `undefined` and failing there.
 */
export function specOf(name: string, declaration: ToolDeclaration | undefined): ToolSpec {
  return { name, description: summarize(declaration?.describe, name), schema: schemaOf(declaration) }
}

/** Run one tool, checking its arguments first. Never throws. */
export async function invokeTool(
  runner: ToolRunner,
  name: string,
  declaration: ToolDeclaration | undefined,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const complaint = checkArgs(declaration?.params, args)
  if (complaint) {
    return {
      name,
      ok: false,
      error: `The arguments were not usable: ${complaint}. Call it again with the right shape.`,
    }
  }

  try {
    return { name, ok: true, value: await runner.run(name, args) }
  } catch (err) {
    // A failing tool is fed back, not fatal. The model can often recover from
    // "that ticket does not exist" and killing the run throws that away.
    return { name, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** One tool as `ctx.ai.tools` reports it. */
export function toHandle(name: string, declaration: ToolDeclaration | undefined): ToolHandle {
  return {
    name,
    get describe() {
      return declaration?.describe
    },
    get params() {
      return declaration?.params
    },
  }
}

export type { ToolCall }
