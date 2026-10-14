import { defineServerAction } from '@studiomorgana/sdk'
export const promote = defineServerAction({
  handler: async (ctx) => {
    const u = ctx.auth.require()
    return await ctx.auth.users.setRoles(u.id, ['admin'])
  },
})
