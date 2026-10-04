/**
 * The loop — one task, from an instruction to an answer.
 *
 * ## What drives it
 *
 * Nanoagent's `loopAgent`, which is a bounded `while` around `stepAgent`. Two
 * things are borrowed from it deliberately: the *halt* vocabulary, so a run can
 * say why it stopped rather than just returning, and the *stuck* detection, which
 * notices an empty answer or two assistant turns in a row and hands over to a
 * recovery hook instead of burning the remaining budget on the same dead end.
 *
 * ## The turn cap
 *
 * A model that keeps calling tools keeps paying for them, so there is a fixed
 * cap and it is not a setting. A backstop against a pathological loop is not a
 * dial. A run that hits it reports `truncated` and `turnReason: 'turn_cap'`
 * rather than pretending it finished.
 */

import type { AgentContext, ChatMemory, Message } from '@hbbio/nanoagent'
import { AssistantMessage, HaltKind, SystemMessage, UserMessage, loopAgent, toText } from '@hbbio/nanoagent'
import { AGENT_EVENTS } from '@morgana/sdk'
import { createModel, type ChatTransport } from './model'
import { invokeTool, specOf, summarize, type ToolRunner } from './tools'
import type { AgentRunOptions, AgentRunResult, AgentStep, ToolDeclaration, ToolResult } from './types'

/** Hard cap on tool-calling turns. A backstop, not a setting. */
export const MAX_TURNS = 12

/**
 * Events an agent emits, bindable with `on:` like any other backend event.
 *
 * The names live in `@morgana/sdk` rather than here, and are re-exported so a
 * host importing from either package gets the same object. An author's config
 * names these strings and this loop emits them, so two copies would be two
 * chances for the binding and the emitter to disagree.
 */
export { AGENT_EVENTS }

/**
 * What the host must provide. A few functions and no ambient state.
 *
 * Every one of these is something the host already has: the same action runner
 * `ctx.actions.run` uses, the channel publisher, and the event emitter. That is
 * the whole reason an agent reaches no further than the action that called it.
 */
export interface AgentHost extends ToolRunner {
  /** Publish to a channel. `channel` is optional per run. */
  publish(channel: string, payload: unknown): Promise<void> | void
  /** Emit an `agent:*` event so `on:` bindings can react. */
  emit(event: string, payload: unknown): void
}

export interface RunAgentConfig {
  host: AgentHost
  /** Where this run's completions go. */
  transport: ChatTransport
  /** The agent being run. */
  agent: { name: string; instruction: string; model?: string }
  /** Declarations for the names this task may call, already validated. */
  declarations: Record<string, ToolDeclaration>
  task: string
  options?: AgentRunOptions
}

/**
 * Build the prompt.
 *
 * The standing instruction first, then what this task may do, then the context
 * it should see, then the task. Order matters to the model: the instruction is
 * the frame everything else is read inside.
 */
export function buildMessages(
  agent: { instruction: string },
  task: string,
  options: {
    tools: string[]
    declarations: Record<string, ToolDeclaration>
    instructions?: string
    context?: unknown
    history?: AgentRunOptions['history']
  },
): Message[] {
  const system: string[] = [agent.instruction]

  if (options.instructions) system.push(options.instructions)

  if (options.tools.length) {
    const lines = options.tools.map((name) => `- ${name}: ${summarize(options.declarations[name]?.describe, name)}`)
    system.push(
      'You may call these tools by name when you need them. Call one only when it is ' +
        'needed, and answer in plain text once you have what you need.\n' +
        lines.join('\n'),
    )
  }

  const messages: Message[] = [SystemMessage(system.join('\n\n'))]

  // History is replayed in the roles it was written in.
  //
  // Sending `assistant` through `SystemMessage` instead would relabel the
  // model's own past answers as instructions, and the whole conversation would
  // become one undifferentiated block of directives.
  //
  // `tool` is skipped rather than guessed at. A tool result is only meaningful
  // next to the call it answers — it carries a `tool_call_id`, and every provider
  // rejects a tool message without one — so replaying one out of context would
  // fail the run. History that needs tool results is a trace, not a prompt, and
  // `AgentRunResult.steps` is where traces live.
  for (const m of options.history ?? []) {
    if (!m || typeof m.content !== 'string') continue
    if (m.role === 'system') messages.push(SystemMessage(m.content))
    else if (m.role === 'assistant') messages.push(AssistantMessage(m.content, undefined))
    else if (m.role === 'user') messages.push(UserMessage(m.content))
  }

  if (options.context !== undefined && options.context !== null) {
    let rendered: string
    try {
      rendered = JSON.stringify(options.context)
    } catch {
      rendered = String(options.context)
    }
    messages.push(UserMessage(`Context:\n${rendered}`))
  }

  messages.push(UserMessage(task))
  return messages
}

/**
 * Run one task to completion.
 *
 * Emits `agent:task:started` at the beginning and exactly one of
 * `agent:task:completed` or `agent:task:failed` at the end, so a binding on
 * either can never fire twice or not at all.
 */
export async function runAgent(config: RunAgentConfig): Promise<AgentRunResult> {
  const { host, transport, agent, options = {} } = config
  const names = options.tools ?? []

  const transportForRun: ChatTransport =
    options.model && options.model !== transport.model
      ? { ...transport, model: options.model }
      : transport

  const specs = names.map((name) => specOf(name, config.declarations[name]))

  const steps: AgentStep[] = []
  const allCalls: AgentRunResult['calls'] = []

  const model = createModel({
    transport: transportForRun,
    tools: async () => specs,
    call: (name, args) =>
      invokeTool(host, name, config.declarations[name], args).then((r) => {
        if (!r.ok) throw new Error(r.error ?? 'tool failed')
        return r.value
      }),
    maxTokens: options.maxTokens,
    onStep: (step) => {
      for (const call of step.calls ?? []) {
        host.emit(AGENT_EVENTS.tool, {
          agent: agent.name,
          task: config.task,
          tool: call.name,
          args: call.args,
        })
        allCalls.push(call)
      }
      steps.push(step)
      options.onStep?.(step)
      if (options.stream && step.text) {
        void broadcast(agent.name, step.text, true)
      }
    },
  })

  async function broadcast(agentName: string, text: string, partial: boolean): Promise<void> {
    if (!options.channel || !text) return
    await host.publish(options.channel, { agent: agentName, text, partial })
    host.emit(AGENT_EVENTS.broadcast, {
      agent: agentName,
      channel: options.channel,
      partial,
    })
  }

  host.emit(AGENT_EVENTS.started, { agent: agent.name, task: config.task, tools: names })

  /**
   * A second model for Nanoagent's control question.
   *
   * `stepAgent` asks the model whether it wants user input before it checks
   * `isFinal`, and that question is the framework's, not the agent's. It gets its
   * own `Model` so it shares the transport but not the step reporter and not the
   * tool list — otherwise the answer ("no") is broadcast to the agent's channel
   * as though the agent had said it, and a yes/no check is handed a chance to
   * call a tool.
   *
   * It costs one short extra call per prose turn. That is Nanoagent's design, and
   * paying it buys a real halt reason instead of a guess at when to stop.
   */
  const controlModel = createModel({
    transport: transportForRun,
    tools: async () => [],
    call: async () => {
      throw new Error('the control model may not call tools');
    },
    maxTokens: 8,
  })

  const initial: ChatMemory = { agent: agent.name }

  const agentCtx: AgentContext<ChatMemory> = {
    name: agent.name,

    // Final when the model has answered in prose and asked for nothing. This is
    // Nanoagent's hook, so the halt is a first-class reason rather than a `break`.
    //
    // The content is read with `toText`, not by comparing to a string. Nanoagent
    // carries content as a `Content` object, so a naive `typeof === 'string'`
    // read is always empty — and an `isFinal` that is never true turns every run
    // into a full-length spin against the turn cap.
    isFinal: async ({ messages }) => {
      const last = messages[messages.length - 1]
      if (!last || last.role !== 'assistant') return false
      if (Array.isArray((last as { tool_calls?: unknown }).tool_calls)) return false
      return (toText(last.content) ?? '').trim().length > 0
    },

    /**
     * There is nobody to ask.
     *
     * Nanoagent checks whether the model wants user input and halts if so, then
     * looks for a handler to answer it. Without one, a run that asks "should I
     * also close the remaining three?" throws instead of answering. An agent
     * running a task is not in a conversation, so the answer is always "no, you
     * are not waiting for anyone".
     */
    getUserInput: async () =>
      'There is nobody to answer that. You are not in a conversation — finish the task ' +
      'and give your final answer now.',

    /**
     * Recovery. Reached when the model repeats itself, answers nothing, or a tool
     * keeps failing.
     *
     * Appending a system message that says so is better than letting the loop
     * spend the remaining budget making the same call. The halt is cleared,
     * because leaving it set would re-enter this hook on the next step forever.
     */
    controller: async (state) => {
      // A `tool_error` halt can only be reached from a failed `model.complete`.
      // Tool failures never get here: they are caught inside the tool loop and
      // fed back as a tool message, which is the whole point of doing that.
      //
      // So this is the provider being unreachable or erroring — a bad key, a 500,
      // an outage. Nudging and trying again would spend the entire turn budget on
      // a service that is already broken, and then report `turn_cap`, which is a
      // lie: the agent did not think too long, nothing answered it at all.
      if (state.halted?.kind === HaltKind.ToolError) {
        throw state.halted.error instanceof Error
          ? state.halted.error
          : new Error(String(state.halted.error))
      }

      const last = state.messages[state.messages.length - 1]
      const reason =
        'Your last reply was empty or repeated itself. Do something different, or give your final answer now.'
      const nudged = [...state.messages, SystemMessage(reason)]
      if (last?.role === 'assistant' && Array.isArray((last as { tool_calls?: unknown }).tool_calls)) {
        // An assistant turn with tool calls must be followed by its results. The
        // tools that never came back are reported rather than left dangling.
        nudged.push(
          ...(last.tool_calls ?? []).map((c: { id: string; function?: { name?: string } }) => ({
            role: 'tool' as const,
            tool_call_id: c.id,
            content: { type: 'text' as const, text: 'That tool call was abandoned.' },
          })),
        )
      }
      return { ...state, messages: nudged, halted: undefined }
    },
  }

  try {
    const final = await loopAgent(agentCtx, {
      model,
      messages: buildMessages(agent, config.task, {
        tools: names,
        declarations: config.declarations,
        instructions: options.instructions,
        context: options.context,
        history: options.history,
      }),
      memory: initial,
    }, { maxSteps: MAX_TURNS, yesModel: controlModel })

    const output = toText(final.messages[final.messages.length - 1]?.content) ?? ''

    const capped = final.halted?.kind === HaltKind.Stopped
    const finishReason: AgentRunResult['finishReason'] = capped ? 'turn_cap' : 'stop'

    if (!options.stream) await broadcast(agent.name, output, false)

    host.emit(AGENT_EVENTS.completed, {
      agent: agent.name,
      task: config.task,
      output,
      calls: allCalls,
      turns: steps.length,
      truncated: capped,
    })

    return {
      output: output.trim(),
      calls: allCalls,
      truncated: capped,
      steps,
      finishReason,
    }
  } catch (err) {
    host.emit(AGENT_EVENTS.failed, {
      agent: agent.name,
      task: config.task,
      error: err instanceof Error ? err.message : String(err),
      calls: allCalls,
    })
    throw err
  }
}

/** Re-exported so a host can build its own result type from a trace. */
export type { ToolResult, AgentStep }
