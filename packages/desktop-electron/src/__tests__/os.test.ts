import { describe, expect, it } from 'vitest'
import { buildOs, type OsBackend } from '../os'

function backend(): OsBackend {
  return {
    platform: 'test-os',
    arch: 'test-arch',
    dataDir: '/tmp/morgana-os-test',
    fs: {
      readFile: async () => null,
      writeFile: async () => {},
      exists: async () => false,
      list: async () => [],
      remove: async () => false,
    },
    clipboard: {
      read: async () => 'clip',
      write: async () => {},
    },
    notify: {
      show: async () => {},
    },
    shell: {
      openPath: async () => '',
      openUrl: async () => {},
    },
    dialog: {
      openFiles: async () => null,
      saveFile: async () => null,
      message: async () => {},
    },
    window: {
      minimize: async () => {},
      maximize: async () => {},
      unmaximize: async () => {},
      isMaximized: async () => false,
      close: async () => {},
      hide: async () => {},
      show: async () => {},
      focus: async () => {},
      isVisible: async () => true,
      setTitle: async () => {},
      getBounds: async () => ({ x: 0, y: 0, width: 0, height: 0 }),
      setBounds: async () => {},
      center: async () => {},
      fullscreen: async () => {},
      isFullscreen: async () => false,
      setAlwaysOnTop: async () => {},
      drag: async () => {},
    },
  }
}

describe('buildOs', () => {
  it('passes declared groups through to the backend', async () => {
    const os = buildOs({ declared: ['fs', 'clipboard'], backend: backend() })
    expect(os.platform).toBe('test-os')
    expect(await os.clipboard.read()).toBe('clip')
    expect(await os.fs.exists('x')).toBe(false)
  })

  it('an undeclared group throws naming the config line', () => {
    const os = buildOs({ declared: ['fs'], backend: backend() })
    expect(() => os.notify).toThrow('desktop os group "notify" is not declared in morgana.config.ts (desktop.os)')
  })

  it('an unknown group name fails at build time', () => {
    expect(() => buildOs({ declared: ['teleport'], backend: backend() })).toThrow('unknown desktop os group(s) "teleport"')
  })

  it('building the handle never throws — only reaching does', () => {
    const os = buildOs({ declared: [], backend: backend() })
    expect(os.platform).toBe('test-os')
    expect(() => os.shell).toThrow('not declared')
  })
})
