/**
 * Sandboxes on the dev host — `ctx.server.sandbox`.
 *
 * Each sandbox is a plain folder under `<dataDir>/sandboxes/<name>/`: a server
 * action writes files into it, installs packages and runs programs there, and
 * gets a URL for a program that serves. No container, so no overhead — and no
 * isolation: programs run as you, which is right for your own code on your own
 * machine. The cloud host gives each sandbox an isolated container behind the
 * same API.
 *
 * One SandboxHost lives as long as `morgana dev`, so started programs outlive
 * the action call that started them; `closeAll()` stops them when dev exits.
 */
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/
/** The most of a program's output kept, per stream. */
const OUTPUT_LIMIT = 1_000_000
/** The most of a started program's output kept for `output()`. */
const TAIL_LIMIT = 64_000

export class SandboxHost {
  #root
  /** name → Map<id, started program> */
  #running = new Map()
  #nextId = 1

  constructor(root) {
    this.#root = path.resolve(root)
  }

  /** The `ctx.server.sandbox` surface. */
  api() {
    return {
      open: async (name) => this.open(name),
      list: async () => (fs.existsSync(this.#root) ? fs.readdirSync(this.#root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : []),
    }
  }

  open(name) {
    if (typeof name !== 'string' || !NAME.test(name)) {
      throw new Error(`a sandbox name is lower-case letters, digits, - and _ (up to 63), starting with a letter or digit — not "${name}"`)
    }
    const root = path.join(this.#root, name)
    fs.mkdirSync(root, { recursive: true })
    const running = this.#running.get(name) ?? new Map()
    this.#running.set(name, running)
    const host = this

    /** A path inside this sandbox, or an error naming the path that tried to leave it. */
    const inside = (rel = '.') => {
      if (typeof rel !== 'string' || rel.includes('\0')) throw new Error(`sandbox "${name}": not a path: ${JSON.stringify(rel)}`)
      const full = path.resolve(root, rel)
      if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`sandbox "${name}": "${rel}" is outside the sandbox`)
      // A link inside the sandbox must not lead out of it.
      let probe = full
      while (probe !== root && !fs.existsSync(probe)) probe = path.dirname(probe)
      const real = fs.realpathSync(probe)
      const realRoot = fs.realpathSync(root)
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error(`sandbox "${name}": "${rel}" leads outside the sandbox`)
      return full
    }

    const handle = {
      name,
      async write(rel, data) {
        const full = inside(rel)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, data)
      },
      async writeMany(files) {
        for (const [rel, data] of Object.entries(files ?? {})) await handle.write(rel, data)
      },
      async read(rel) {
        const full = inside(rel)
        return fs.existsSync(full) && fs.statSync(full).isFile() ? fs.readFileSync(full, 'utf8') : null
      },
      async list(folder = '.') {
        const start = inside(folder)
        if (!fs.existsSync(start)) return []
        const out = []
        const walk = (dir) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'node_modules') continue
            const full = path.join(dir, e.name)
            if (e.isDirectory()) walk(full)
            else out.push(path.relative(root, full).split(path.sep).join('/'))
          }
        }
        walk(start)
        return out.sort()
      },
      async remove(rel) {
        const full = inside(rel)
        if (full === root) throw new Error(`sandbox "${name}": to remove everything, use destroy()`)
        fs.rmSync(full, { recursive: true, force: true })
      },
      async run(command, opts = {}) {
        return runToEnd(command, { cwd: inside(opts.cwd), env: opts.env, timeout: opts.timeout ?? 120_000, name })
      },
      async install(packages = [], opts = {}) {
        return handle.run(['npm', 'install', '--no-audit', '--no-fund', ...packages], { timeout: 600_000, ...opts })
      },
      async start(command, opts = {}) {
        checkCommand(command, name)
        const port = opts.port === undefined ? undefined
          : opts.port === true || opts.port === 'auto' ? await freePort()
            : Number(opts.port)
        const args = port === undefined ? command : command.map((a) => a.replaceAll('{port}', String(port)))
        const env = { ...process.env, ...opts.env, ...(port !== undefined ? { PORT: String(port) } : {}) }
        const child = launch(args, { cwd: inside(opts.cwd), env })
        const id = `p${host.#nextId++}`
        let tail = ''
        const keep = (chunk) => { tail = (tail + chunk).slice(-TAIL_LIMIT) }
        child.stdout.on('data', keep)
        child.stderr.on('data', keep)
        const proc = {
          id,
          command: [...command],
          running: true,
          ...(port !== undefined ? { port, url: `http://localhost:${port}` } : {}),
          output: async () => tail,
        }
        const entry = { proc, child }
        running.set(id, entry)
        let failed = null
        child.on('error', (err) => { failed = err; proc.running = false })
        child.on('exit', () => { proc.running = false })

        if (port !== undefined) {
          const deadline = Date.now() + (opts.wait ?? 60_000)
          while (!(await answers(port))) {
            if (failed) throw new Error(`sandbox "${name}": couldn't start ${command.join(' ')}: ${failed.message}`)
            if (!proc.running) throw new Error(`sandbox "${name}": ${command.join(' ')} stopped before it served on port ${port}. Its output:\n${tail.slice(-4000)}`)
            if (Date.now() > deadline) {
              killTree(child)
              throw new Error(`sandbox "${name}": ${command.join(' ')} didn't answer on port ${port} within ${opts.wait ?? 60_000}ms. Its output:\n${tail.slice(-4000)}`)
            }
            await new Promise((r) => setTimeout(r, 150))
          }
        }
        return proc
      },
      async processes() {
        return [...running.values()].map((e) => e.proc)
      },
      async stop(id) {
        for (const [key, entry] of running) {
          if (id !== undefined && key !== id) continue
          if (entry.proc.running) await stopChild(entry.child)
          running.delete(key)
        }
      },
      async destroy() {
        await handle.stop()
        host.#running.delete(name)
        fs.rmSync(root, { recursive: true, force: true })
      },
    }
    return handle
  }

  /** Stop every started program (dev is exiting). */
  async closeAll() {
    for (const running of this.#running.values()) {
      for (const entry of running.values()) if (entry.proc.running) killTree(entry.child)
      running.clear()
    }
  }
}

function checkCommand(command, name) {
  if (!Array.isArray(command) || command.length === 0 || command.some((a) => typeof a !== 'string')) {
    throw new Error(`sandbox "${name}": a command is a list of words, like ['npm', 'install'] — not ${JSON.stringify(command)}`)
  }
}

/**
 * Spawn without a shell. `node`, `npm` and `npx` run on this Node, so they
 * work the same on every OS (on Windows `npm` is a .cmd file, which can't be
 * spawned without a shell).
 */
function launch(command, { cwd, env }) {
  const [program, ...rest] = command
  const nodeDir = path.dirname(process.execPath)
  const npmCli = (file) => {
    for (const base of [path.join(nodeDir, 'node_modules', 'npm', 'bin'), path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin')]) {
      const p = path.join(base, file)
      if (fs.existsSync(p)) return p
    }
    return null
  }
  let file = program
  let args = rest
  if (program === 'node') file = process.execPath
  else if (program === 'npm' || program === 'npx') {
    const cli = npmCli(program === 'npm' ? 'npm-cli.js' : 'npx-cli.js')
    if (cli) { file = process.execPath; args = [cli, ...rest] }
  }
  return spawn(file, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32' })
}

function runToEnd(command, { cwd, env, timeout, name }) {
  checkCommand(command, name)
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let child
    try {
      child = launch(command, { cwd, env: { ...process.env, ...env } })
    } catch (err) {
      resolve({ ok: false, exitCode: null, stdout: '', stderr: String(err?.message ?? err), timedOut: false })
      return
    }
    child.stdout.on('data', (c) => { if (stdout.length < OUTPUT_LIMIT) stdout += c })
    child.stderr.on('data', (c) => { if (stderr.length < OUTPUT_LIMIT) stderr += c })
    const timer = setTimeout(() => { timedOut = true; killTree(child) }, timeout)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, exitCode: null, stdout, stderr: stderr + `couldn't run ${command[0]}: ${err.message}`, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0 && !timedOut, exitCode: code, stdout, stderr, timedOut })
    })
  })
}

/** A program and everything it started: `npx` → `node` → the server. */
function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    else process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill()
  }
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) { resolve(); return }
    child.once('exit', () => resolve())
    killTree(child)
    setTimeout(resolve, 5000).unref?.()
  })
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/** Whether something answers on the port, over IPv4 or IPv6 (dev servers pick either). */
async function answers(port) {
  return (await answersOn(port, '127.0.0.1')) || answersOn(port, '::1')
}

function answersOn(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (ok) => { socket.destroy(); resolve(ok) }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(500, () => done(false))
  })
}
