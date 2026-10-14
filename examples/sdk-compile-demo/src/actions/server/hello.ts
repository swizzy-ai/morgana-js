import { defineServerAction } from '@studiomorgana/sdk'

export interface Contract {
  input: { name?: string }
  output: { greeting: string }
}

export const hello = defineServerAction({
  handler: (ctx) => {
    const args = ctx.args as Contract['input']
    return { greeting: `hi ${args?.name ?? 'world'}` }
  },
})
