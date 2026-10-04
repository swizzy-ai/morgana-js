/**
 * Public types for `@morgana/agents`.
 *
 * ## Why this file only re-exports
 *
 * The agent and tool surface is declared once, in `@morgana/sdk`
 * (`src/ai-agents.ts`), and re-exported here. A duplicated interface is not a
 * convenience; it is a second claim about the same thing that nothing keeps
 * honest.
 *
 * The SDK is the right place for it, and not only because it is where `ctx.ai` is
 * typed: the SDK is what an author's project installs, so the surface is
 * available to typecheck an action even in a project that never installs this
 * package.
 *
 * Everything below is a re-export, so `import … from './types'` keeps working and
 * the package has one import surface for its own code.
 *
 * ## The short version of what an author needs to know
 *
 * An **agent** is a name and an instruction, and it is durable — declared by one
 * action, readable from every other. **Tools** belong to the task, never to the
 * agent: `create` takes no tools and `run` does, so one agent can be reused for
 * work it was not built for. A **tool** is the name of a server action, reached
 * through the same runner `ctx.actions.run` uses, which is why there is no
 * permission layer to configure — there is nothing to bypass.
 */

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
} from '@morgana/sdk'