import { defineClientAction } from '@studiomorgana/sdk'

export const modeLight = defineClientAction({ config: { on: 't-mode-light.clicked' }, handler: (ctx) => void ctx.ui.setTheme('light') })
export const modeDark = defineClientAction({ config: { on: 't-mode-dark.clicked' }, handler: (ctx) => void ctx.ui.setTheme('dark') })
export const modeSystem = defineClientAction({ config: { on: 't-mode-system.clicked' }, handler: (ctx) => void ctx.ui.setTheme('system') })
