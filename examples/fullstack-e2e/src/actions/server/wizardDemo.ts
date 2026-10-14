import { defineServerAction } from '@morgana/sdk'

/**
 * A durable wizard, with no model step so it runs on a host that has no AI
 * provider — which is what the e2e host is.
 *
 * The point is the run, not the engine: the first call parks at the approval
 * gate and returns, and a *later, separate* invocation approves and finishes.
 * Because the two calls do not share a process, a passing test proves the
 * checkpoint reached storage and was read back — the durable behaviour itself.
 */
export const wizardDemo = defineServerAction({
  handler: async (ctx) => {
    const w = ctx.ai.createWorkflow()
    w.addComputeStep({
      id: 'prepare',
      handler: (c) => {
        c.setState((s) => ({ ...s, prepared: 'yes' }))
        return w.signal.skip
      },
    })
    w.addApprovalStep({ id: 'gate' })
    w.addComputeStep({
      id: 'finish',
      handler: (c) => {
        c.setState((s) => ({ ...s, finished: 'yes' }))
        return w.signal.skip
      },
    })

    const id = String(ctx.args.runId ?? 'e2e-wizard')
    if (ctx.args.decision === 'approve') return ctx.ai.wizard.approve(id, w)
    if (ctx.args.decision === 'deny') return ctx.ai.wizard.deny(id, w)
    return ctx.ai.wizard.run(id, w)
  },
})
