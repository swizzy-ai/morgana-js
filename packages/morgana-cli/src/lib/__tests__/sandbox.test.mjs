// ctx.server.sandbox on the dev host: plain folders, real programs.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxHost } from '../sandbox.mjs'
import { makeHostContext } from '../host-context.mjs'
import { StoreEngine } from '../store.mjs'

const hosts = []
const host = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-sandbox-'))
  const h = new SandboxHost(root)
  hosts.push(h)
  return { h, root }
}
afterEach(async () => { for (const h of hosts.splice(0)) await h.closeAll() })

const SERVER = `
const http = require('node:http')
http.createServer((req, res) => res.end('hello from ' + req.url)).listen(Number(process.env.PORT), '127.0.0.1')
console.log('serving on ' + process.env.PORT)
`

describe('files', () => {
  it('writes, reads, lists and removes inside its own folder', async () => {
    const { h, root } = host()
    const box = h.open('session-1')
    await box.writeMany({ 'src/home.ts': 'export {}', 'package.json': '{"name":"p"}' })
    await box.write('notes/a.txt', 'one')
    expect(await box.read('notes/a.txt')).toBe('one')
    expect(await box.read('missing.txt')).toBeNull()
    expect(await box.list()).toEqual(['notes/a.txt', 'package.json', 'src/home.ts'])
    expect(await box.list('src')).toEqual(['src/home.ts'])
    await box.remove('notes')
    expect(await box.list()).toEqual(['package.json', 'src/home.ts'])
    expect(fs.existsSync(path.join(root, 'session-1', 'src', 'home.ts'))).toBe(true)
    expect(await h.api().list()).toEqual(['session-1'])
  })

  it('keeps files between opens of the same name', async () => {
    const { h } = host()
    await h.open('a').write('x.txt', 'kept')
    expect(await h.open('a').read('x.txt')).toBe('kept')
  })

  it('refuses paths that leave the sandbox, and bad names', async () => {
    const { h } = host()
    const box = h.open('safe')
    await expect(box.write('../escape.txt', 'no')).rejects.toThrow(/outside the sandbox/)
    await expect(box.read(path.resolve('/etc/passwd'))).rejects.toThrow(/outside the sandbox/)
    await expect(box.remove('.')).rejects.toThrow(/use destroy/)
    expect(() => h.open('../up')).toThrow(/a sandbox name is/)
    expect(() => h.open('Has Spaces')).toThrow(/a sandbox name is/)
  })

  it('destroy deletes the folder', async () => {
    const { h, root } = host()
    const box = h.open('gone')
    await box.write('a.txt', '1')
    await box.destroy()
    expect(fs.existsSync(path.join(root, 'gone'))).toBe(false)
  })
})

describe('running programs', () => {
  it('runs a program to the end and reports its output and exit code', async () => {
    const { h } = host()
    const box = h.open('run')
    await box.write('hi.js', 'console.log("hi " + require("node:fs").readFileSync("name.txt", "utf8"))')
    await box.write('name.txt', 'there')
    const ok = await box.run(['node', 'hi.js'])
    expect(ok).toMatchObject({ ok: true, exitCode: 0, timedOut: false })
    expect(ok.stdout.trim()).toBe('hi there')

    const bad = await box.run(['node', '-e', 'console.error("nope"); process.exit(3)'])
    expect(bad).toMatchObject({ ok: false, exitCode: 3 })
    expect(bad.stderr).toContain('nope')
  })

  it('runs npm the same way on every OS', async () => {
    const { h } = host()
    const r = await h.open('npm').run(['npm', '--version'])
    expect(r.ok).toBe(true)
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  }, 30_000)

  it('stops a program that runs past its timeout', async () => {
    const { h } = host()
    const r = await h.open('slow').run(['node', '-e', 'setTimeout(() => {}, 60000)'], { timeout: 300 })
    expect(r).toMatchObject({ ok: false, timedOut: true })
  })

  it('says so when the program does not exist', async () => {
    const { h } = host()
    const r = await h.open('missing').run(['no-such-program-anywhere'])
    expect(r.ok).toBe(false)
    expect(r.stderr).toMatch(/couldn't run no-such-program-anywhere/)
  })

  it('refuses a shell line instead of a list of words', async () => {
    const { h } = host()
    await expect(h.open('words').run('npm install')).rejects.toThrow(/a command is a list of words/)
  })
})

describe('started programs', () => {
  it('starts a server on a free port, returns its URL, keeps it running, and stops it', async () => {
    const { h } = host()
    const box = h.open('serve')
    await box.write('server.js', SERVER)
    const proc = await box.start(['node', 'server.js'], { port: 'auto' })
    expect(proc.running).toBe(true)
    expect(proc.url).toBe(`http://localhost:${proc.port}`)
    const res = await fetch(`http://127.0.0.1:${proc.port}/page`)
    expect(await res.text()).toBe('hello from /page')
    expect(await proc.output()).toContain(`serving on ${proc.port}`)

    // A later call (a new action) sees the same running program.
    const again = await h.open('serve').processes()
    expect(again.map((p) => p.id)).toEqual([proc.id])

    await box.stop()
    expect(proc.running).toBe(false)
    expect(await box.processes()).toEqual([])
  }, 30_000)

  it('puts the port into {port} in the command', async () => {
    const { h } = host()
    const box = h.open('portarg')
    await box.write('server.js', SERVER.replace('Number(process.env.PORT)', 'Number(process.argv[2])'))
    const proc = await box.start(['node', 'server.js', '{port}'], { port: 'auto' })
    expect(await (await fetch(`http://127.0.0.1:${proc.port}/`)).text()).toBe('hello from /')
  }, 30_000)

  it('says what the program printed when it stops before serving', async () => {
    const { h } = host()
    const box = h.open('crash')
    await expect(box.start(['node', '-e', 'console.log("broken config"); process.exit(1)'], { port: 'auto' }))
      .rejects.toThrow(/stopped before it served on port \d+\. Its output:\nbroken config/)
  }, 30_000)

  it('closeAll stops everything when dev exits', async () => {
    const { h } = host()
    const box = h.open('exit')
    await box.write('server.js', SERVER)
    const proc = await box.start(['node', 'server.js'], { port: 'auto' })
    await h.closeAll()
    await new Promise((r) => setTimeout(r, 500))
    await expect(fetch(`http://127.0.0.1:${proc.port}/`)).rejects.toThrow()
  }, 30_000)
})

describe('in a server action', () => {
  it('is ctx.server.sandbox, in folders beside the data', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-sandbox-ctx-'))
    const store = new StoreEngine({ file: path.join(dir, 'morgana.db') })
    const { ctx } = await makeHostContext({ store, filesDir: path.join(dir, 'files') })
    const box = await ctx.server.sandbox.open('from-action')
    await box.write('hello.txt', 'hi')
    expect(fs.readFileSync(path.join(dir, 'sandboxes', 'from-action', 'hello.txt'), 'utf8')).toBe('hi')
    expect(await ctx.server.sandbox.list()).toEqual(['from-action'])
  })
})
