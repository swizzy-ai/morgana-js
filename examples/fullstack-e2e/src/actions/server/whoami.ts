import { defineServerAction } from '@studiomorgana/sdk'
export const whoami = defineServerAction({
  handler: async (ctx) => {
    const u = ctx.auth.require()
    return { id: u.id, email: u.email, roles: u.roles }
  },
})
