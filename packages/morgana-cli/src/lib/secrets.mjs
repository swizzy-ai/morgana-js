/**
 * Local secrets — the values `morgana dev` merges into `ctx.vars`, and that
 * `morgana deploy` sends to the worker.
 *
 * They live in `morgana.secrets.json` at the project root, not inside
 * `.morgana/`, so the file is where a person looks for it. `morgana init` adds
 * it to `.gitignore` and creates it empty, so a key typed here never reaches a
 * commit or a build artefact. The file that `.morgana/secrets.json` held before
 * is still read, so nothing breaks while it is moved.
 */
import fs from 'node:fs'
import path from 'node:path'

export const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
export const SECRETS_FILE = 'morgana.secrets.json'

export function localSecretsPath(dir) {
  return path.join(dir, SECRETS_FILE)
}

/** Where secrets were kept before they moved to the project root. */
export function legacySecretsPath(dir) {
  return path.join(dir, '.morgana', 'secrets.json')
}

function readSecretsFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string'))
  } catch {
    return {}
  }
}

/** Name → value. The project-root file wins over the legacy one. A missing file is no secrets, not an error. */
export function readLocalSecrets(dir) {
  return { ...readSecretsFile(legacySecretsPath(dir)), ...readSecretsFile(localSecretsPath(dir)) }
}

/** True when secrets still sit in the old location, so the caller can say where they should move. */
export function hasLegacySecrets(dir) {
  return fs.existsSync(legacySecretsPath(dir))
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
