import { defineServerAction } from '@morgana/sdk'

/**
 * Publishing to a channel, from a server action.
 *
 * The point of this action is that a channel is a *shared* surface: something
 * published here has to reach every page holding that channel open, in any
 * browser, not just the tab that happened to trigger it. Before the transport
 * existed, `ctx.events.publish` only wrote to the action log — so this action
 * looked correct, deployed cleanly, and reached nobody.
 *
 * The channels themselves are declared in the compile lane
 * (`src/actions/compile/channels.ts`), because a channel's name and its access
 * rule belong together in the build. `smoke.mjs` publishes here and then reads
 * the history back, so a publish that reaches nobody fails the pipeline.
 *
 * `ctx.events.subscribe` is still a no-op on the server lane, and that is a
 * property of the lane rather than a gap: an action invocation is short-lived, so
 * a subscription opened inside one cannot outlive it. Cross-invocation listening
 * is `config.on`, which is deployed and durable.
 */
export const say = defineServerAction({
  handler: async (ctx) => {
    const a = (ctx.args ?? {}) as Record<string, unknown>
    const channel = String(a.channel ?? 'lobby')
    const text = String(a.text ?? '')
    if (!text) throw new Error('say requires { text }')

    const published = await ctx.events.publish(channel, {
      user: String(a.user ?? 'anonymous'),
      text,
    })
    if (published === false) throw new Error(`could not publish to channel "${channel}"`)

    // Durable history is the other half: a page that connects later must be able
    // to see what it missed, or a channel loses messages for anyone who was not
    // open at the time.
    const history = await (ctx.events.channels as any).history(channel, 10)
    ctx.log('published to', channel, `history=${history.length}`)
    return { ok: true, channel, historyLength: history.length }
  },
})