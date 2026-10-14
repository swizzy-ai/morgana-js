/**
 * Local secrets — what `morgana dev` merges into `ctx.vars` on the server.
 *
 * The deployed equivalent lives on the worker (`morgana secrets set` without
 * `--local`). Locally a secret is a line in `.morgana/secrets.json`, which
 * `morgana init` already gitignores (the whole `.morgana/` directory), so a key
 * typed here never reaches a commit or a build artefact.
 */
import fs from 'node:fs'
import path from 'node:path'

export const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

export function localSecretsPath(dir) {
  return path.join(dir, '.morgana', 'secrets.json')
}

/** Name → value. A missing or unreadable file is no secrets, not an error. */
export function readLocalSecrets(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(localSecretsPath(dir), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string'))
  } catch {
    return {}
  }
}

export function writeLocalSecrets(dir, secrets) {
  const file = localSecretsPath(dir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(secrets, null, 2) + '\n', { mode: 0o600 })
}

/**
 * Every private var the dev host serves, lowest precedence first:
 * `.morgana/secrets.json`, then `MORGANA_VAR_<NAME>` from the environment (so a
 * one-off override needs no file edit). The env form keeps its name verbatim
 * and also answers lowercased, which is what it used to be read as.
 */
export function localPrivateVars(dir, env = process.env) {
  const fromEnv = {}
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith('MORGANA_VAR_') || typeof v !== 'string') continue
    const name = k.slice('MORGANA_VAR_'.length)
    fromEnv[name] = v
    fromEnv[name.toLowerCase()] = v
  }
  return { ...readLocalSecrets(dir), ...fromEnv }
}

/**
 * The `ctx.vars` handle — the SDK's `VarsHandle`, and the same semantics the
 * worker has: reads are the durable value, `set` writes a per-invocation
 * overlay that dies with the action.
 */
export function buildVarsHandle(stored) {
  const overlay = {}
  return {
    get: (key) => (Object.prototype.hasOwnProperty.call(overlay, key) ? overlay[key] : stored[key]),
    set: (key, value) => {
      overlay[key] = value
    },
    getAll: () => ({ ...stored, ...overlay }),
  }
}
