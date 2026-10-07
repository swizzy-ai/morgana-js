import { defineDesktopAction } from '@morgana/sdk'

/**
 * Desktop demo: reads the clipboard through the declared capability and
 * reports the app identity. Runs in the installed app, never in the cloud.
 */
export const notes = defineDesktopAction({
  config: { on: 'http.get /desktop-notes', auth: 'public' },
  handler: async (ctx) => {
    const clip = await ctx.desktop.os.clipboard.read()
    return {
      ok: true,
      platform: ctx.desktop.os.platform,
      app: ctx.desktop.app.name,
      clip: clip.slice(0, 80),
    }
  },
})
