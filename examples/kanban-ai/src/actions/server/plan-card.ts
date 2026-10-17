import { defineServerAction, type ServerContext } from '@studiomorgana/sdk'

/**
 * The AI feature, as a server action.
 *
 * It asks the model to split a goal into 3–5 short tasks, one per line, then adds
 * each to the To do column. The model is `ctx.ai`. The key is read from the environment, so the browser never sees it:
 * ANTHROPIC_API_KEY or OPENAI_API_KEY, with MORGANA_LLM_PROVIDER choosing the provider.
 *
 * With no model reachable, the goal is split on punctuation instead. The feature
 * always answers, so the page can be tested offline.
 *
 * Planning creates data, so only a signed-in visitor may call it. `ctx.auth.require()`
 * checks that here. `config.auth` would not: it only guards HTTP routes, and this
 * action is called by name from the browser.
 */
export interface Contract {
  input: { text: string }
  output: { steps: string[] }
}

export const planCard = defineServerAction<ServerContext<Contract>>({
  config: {},
  handler: async (ctx) => {
    // config.auth only guards HTTP routes. A named action checks the session itself.
    ctx.auth.require()
    const text = String(ctx.args.text ?? '').trim().slice(0, 2000)
    if (!text) throw new Error('describe the goal first')

    let steps: string[]
    try {
      const answer = await ctx.ai.generateText({
        instructions: [
          'Split this goal into 3 to 5 short, concrete tasks a person can do.',
          'Answer with one task per line. No numbers, no bullets, no preamble.',
          `Goal: ${text}`,
        ].join('\n'),
        maxTokens: 300,
      })
      steps = answer
        .split('\n')
        .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 5)
    } catch {
      // No model reachable: fall back to splitting the goal itself.
      steps = fallbackSteps(text)
    }
    if (!steps.length) steps = fallbackSteps(text)

    const board = await ctx.objects.board.getOrCreate('main', { title: 'Kanban' })
    for (const step of steps) await board.addCard({ text: step, column: 'todo' })
    return { steps }
  },
})

/** Offline plan: each clause of the goal becomes a task, with a wrap-up task at the end. */
function fallbackSteps(goal: string): string[] {
  const parts = goal.split(/[.;\n]+|,\s+/).map((p) => p.trim()).filter((p) => p.length > 2)
  const steps = parts.length > 1 ? parts.slice(0, 4) : [goal, `Check the result of "${goal.slice(0, 60)}"`]
  return [...steps, 'Review and close the goal'].slice(0, 5)
}
