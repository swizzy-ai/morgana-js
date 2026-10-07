import { describe, expect, it } from 'vitest'
import { defineDesktopAction } from '../actions'
import type { DesktopContext } from '../contexts/desktop'
import type { ServerContext } from '../contexts/server'

describe('defineDesktopAction', () => {
  it('is an identity helper over config + handler', () => {
    const action = defineDesktopAction({
      config: { on: 'cron(* * * * *)' },
      handler: (ctx) => {
        void ctx.desktop.os.platform
        void ctx.desktop.app.bundleId
        void ctx.desktop.objects
        void ctx.desktop.os.dialog
        void ctx.desktop.os.window
        void ctx.server.collections
        return { ok: true }
      },
    })
    expect(action.config?.on).toBe('cron(* * * * *)')
    expect(typeof action.handler).toBe('function')
  })

  it('a DesktopContext is a ServerContext with ctx.desktop', () => {
    // Compile-time only: assignability proves the inheritance. Nothing runs,
    // so nothing can throw — the assertion is that this file typechecks.
    const ctx = null as unknown as DesktopContext
    const check: ServerContext = ctx
    expect(check).toBe(null)
  })
})
