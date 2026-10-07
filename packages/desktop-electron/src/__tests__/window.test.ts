import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { buildOs } from '../os'
import { electronBackend, type ElectronModule, type ElectronWindow } from '../electron-os'

function fakeWin(bounds = { x: 1900, y: 100, width: 800, height: 600 }): ElectronWindow & {
  calls: string[]
  pos: Array<[number, number]>
} {
  const calls: string[] = []
  const pos: Array<[number, number]> = []
  return {
    calls,
    pos,
    minimize: () => { calls.push('minimize') },
    maximize: () => { calls.push('maximize') },
    unmaximize: () => { calls.push('unmaximize') },
    isMaximized: () => false,
    close: () => { calls.push('close') },
    hide: () => { calls.push('hide') },
    show: () => { calls.push('show') },
    focus: () => { calls.push('focus') },
    isVisible: () => true,
    setTitle: () => { calls.push('title') },
    getBounds: () => ({ ...bounds }),
    setBounds: () => { calls.push('bounds') },
    center: () => { calls.push('center') },
    setFullScreen: () => { calls.push('fullscreen') },
    isFullScreen: () => false,
    setAlwaysOnTop: () => { calls.push('ontop') },
    setPosition: (x: number, y: number) => { pos.push([x, y]) },
  }
}

function fakeElectron(pick: string[] | null = null): ElectronModule {
  const noWin = (() => { throw new Error('no real windows in tests') }) as unknown as ElectronModule['BrowserWindow']
  const noNotify = (() => { throw new Error('no notifications in tests') }) as unknown as ElectronModule['Notification']
  return {
    app: {
      whenReady: async () => {},
      getPath: () => path.join(os.tmpdir(), 'morgana-win-test'),
      getVersion: () => '0.0.0',
      isPackaged: false,
      on: () => {},
    },
    BrowserWindow: noWin,
    clipboard: { readText: () => '', writeText: () => {} },
    shell: { openPath: async () => '', openExternal: async () => {} },
    Notification: noNotify,
    dialog: {
      showOpenDialog: async () => (pick === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: pick }),
      showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/out.txt' }),
      showMessageBox: async () => ({ response: 0 }),
      showErrorBox: () => {},
    },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
    },
  }
}

function gated(pick: string[] | null = null, declared: string[] = ['dialog', 'window']) {
  const win = fakeWin()
  const backend = electronBackend(fakeElectron(pick), win)
  return { win, os: buildOs({ declared, backend }) }
}

describe('dialog group', () => {
  it('cancel resolves null, confirm resolves the paths', async () => {
    expect(await gated(null).os.dialog.openFiles()).toBe(null)
    expect(await gated(['/a/b.txt']).os.dialog.openFiles()).toEqual(['/a/b.txt'])
    expect(await gated(null).os.dialog.saveFile()).toBe('/tmp/out.txt')
  })
})

describe('window group', () => {
  it('delegates calls to the bound window', async () => {
    const { win, os } = gated()
    await os.window.minimize()
    await os.window.close()
    await os.window.setTitle('Station')
    expect(win.calls).toEqual(['minimize', 'close', 'title'])
    expect(await os.window.isMaximized()).toBe(false)
  })

  it('clamps drag steps to the work area', async () => {
    const { win, os } = gated()
    await os.window.drag(500, 0)
    expect(win.pos).toEqual([[1840, 100]])
    await os.window.drag(-3000, -500)
    expect(win.pos[1]).toEqual([-720, 0])
  })

  it('rejects non-numeric drag with a named error', async () => {
    const { os } = gated()
    await expect(os.window.drag('x' as unknown as number, 0)).rejects.toThrow('numeric dx/dy')
  })

  it('an undeclared group throws naming the config line', () => {
    const { os } = gated(null, ['dialog'])
    expect(() => os.window).toThrow('desktop os group "window" is not declared in morgana.config.ts (desktop.os)')
  })
})
