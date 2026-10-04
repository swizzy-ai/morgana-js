import { defineClientAction } from '@morgana/sdk'

/**
 * Channel declarations — and the access rules that go with them.
 *
 * A channel has two optional fields and nothing else:
 *
 *   `members`                              an explicit audience of user ids
 *   `create(name, { permissions: fn })`     a function that decides
 *
 * Anything absent means **open to the project**, which keeps a channel created
 * at runtime usable without declaring anything.
 *
 * The permission function becomes a deployed action, so it receives an ordinary
 * action context: `ctx.auth.user` is the person subscribing, and
 * `ctx.server.collections` is a store it can query. The rule is therefore code,
 * not a variant this framework has to anticipate — which is what lets a check
 * read a store, compare a list, or combine two conditions.
 *
 * The one constraint: a permission function is captured by source, so it must not
 * read anything from the module it was written in. A closure over a module-level
 * binding serialises as a reference to a name nothing defines, and throws when
 * the room is opened. Pass the value through `ctx.args` or read it from a store;
 * the build warns if a captured function references something it cannot reach.
 */
export const open = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const channels = ctx.channels as any

    // Open to the project: the default shape of a chat a site's own backend
    // posts into. Nothing declared, so nothing to check and no round trip.
    channels.create('lobby', { description: 'Open room, any visitor' })

    // An explicit audience. No function, no action call — the check is a `get`
    // against the channel's own record.
    channels.create('announcements', {
      members: ['usr_demo', 'usr_ada'],
      description: 'Named members only',
    })

    // A permission function. This one asks a store: is the caller on the support
    // team? It could equally combine two conditions or read the caller's roles —
    // whatever the question is, it is ordinary action code.
    channels.create('support', {
      description: 'Support staff only, decided by a query',
      permissions: async (accessCtx: any) => {
        const user = accessCtx.auth?.user
        if (!user) {
          // The generated action turns `ok: false` into a 401 when there was no
          // session and a 403 when there was, so the page can tell "you are signed
          // out" from "you are signed in and still not allowed".
          return { ok: false, reason: 'Sign in to reach support.' }
        }
        const staff = await (accessCtx.server.collections as any).query('support_team', {
          filter: { userId: user.id },
        })
        if (staff.total > 0) return { ok: true }
        return { ok: false, reason: 'You are not on the support team.' }
      },
    })

    // A check that is only a condition on the caller. The generated action
    // accepts a bare boolean for exactly this shape, so the shortest honest
    // expression of a rule stays short.
    channels.create('members-only', {
      description: 'Any signed-in user',
      permissions: (accessCtx: any) => Boolean(accessCtx.auth?.user),
    })

    const declared = channels.list() as Array<{ name: string }>
    ctx.log('declared channels', declared.map((c) => c.name).join(', '))
    return { ok: true, channels: declared.length }
  },
})