# @studiomorgana/wizard

Durable, multi-step workflows for Morgana — the engine behind `ctx.ai`
wizards. A run is a sequence of steps (compute, model, approval) whose state is
checkpointed, so it can park at an approval gate and be finished by a later,
separate request.

You do not usually install this yourself: `@studiomorgana/cli` brings it, and
server actions reach it as `ctx.ai`. New to Morgana? Start with the
[guide](https://github.com/swizzy-ai/morgana-js/tree/main/docs).

## In a server action

```ts
import { defineServerAction } from '@studiomorgana/sdk'

export const publishPost = defineServerAction({
  handler: async (ctx) => {
    const w = ctx.ai.createWorkflow()
    w.addComputeStep({
      id: 'draft',
      handler: (c) => {
        c.setState((s) => ({ ...s, draft: `Post: ${ctx.args.topic}` }))
        return w.signal.skip
      },
    })
    w.addApprovalStep({ id: 'review' })           // the run parks here
    w.addComputeStep({
      id: 'publish',
      handler: (c) => {
        c.setState((s) => ({ ...s, published: true }))
        return w.signal.skip
      },
    })

    const id = String(ctx.args.postId)
    if (ctx.args.decision === 'approve') return ctx.ai.wizard.approve(id, w)
    if (ctx.args.decision === 'deny') return ctx.ai.wizard.deny(id, w)
    return ctx.ai.wizard.run(id, w)              // starts, or resumes, run `id`
  },
})
```

`run` returns as soon as the run parks or finishes. Calling it again with the
same id resumes from the checkpoint; `approve` / `deny` answer a gate.
`ctx.ai.wizard.get / list / has / remove` manage runs.

Runs emit backend events — `wizard:run:started`, `wizard:run:paused`, … — that
server actions can follow with `on`.

## Full surface

```bash
npx morgana spec ctx server     # ctx.ai, including wizards
```

## Licence

Apache-2.0.
