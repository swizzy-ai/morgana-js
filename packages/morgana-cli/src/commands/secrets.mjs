/**
 * `morgana secrets` — set, list and remove the private vars server actions read.
 *
 *   morgana secrets set RESEND_API_KEY re_123        deployed project (worker)
 *   echo re_123 | morgana secrets set RESEND_API_KEY  value from stdin
 *   morgana secrets set RESEND_API_KEY re_123 --local  morgana.secrets.json for `morgana dev`
 *   morgana secrets list [--local]
 *   morgana secrets remove RESEND_API_KEY [--local]
 *
 * A secret is read in a server action as `ctx.vars.get('RESEND_API_KEY')`. It
 * never reaches the build, the manifest or the browser. Values are write-only
 * from here: `list` prints names, because a command that echoes keys back is
 * how keys end up in screenshots and CI logs.
 */
import { say, warn, row, bold, dim } from '../ui.mjs'
import { resolveTarget, resolveCredential } from './deploy.mjs'
import { SECRET_NAME_RE, readLocalSecrets, writeLocalSecrets, localSecretsPath, hasLegacySecrets, legacySecretsPath } from '../lib/secrets.mjs'
import { call } from '../lib/secrets-remote.mjs'

async function readStdin() {
  if (process.stdin.isTTY) return ''
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data.replace(/\r?\n$/, '')
}

function checkName(name) {
  if (!name) throw new Error('a secret name is required, e.g. `morgana secrets set RESEND_API_KEY <value>`')
  if (!SECRET_NAME_RE.test(name)) throw new Error(`invalid secret name "${name}" — use letters, digits and _`)
}

export async function secrets({ action, name, value, local = false, dir = process.cwd(), url, project, env, token } = {}) {
  if (!['set', 'list', 'remove'].includes(action)) {
    throw new Error('usage: morgana secrets <set|list|remove> [NAME] [VALUE] [--local]')
  }
  if (action !== 'list') checkName(name)
  if (action === 'set' && !value) value = await readStdin()
  if (action === 'set' && !value) throw new Error(`no value for ${name} — pass it as an argument or pipe it on stdin`)

  if (local) {
    const all = readLocalSecrets(dir)
    if (action === 'list') {
      const names = Object.keys(all).sort()
      say(`${bold('local secrets')} ${dim(localSecretsPath(dir))}`)
      if (!names.length) say(dim('  (none)'))
      for (const n of names) say(`  ${n}`)
      if (hasLegacySecrets(dir)) warn(`found ${legacySecretsPath(dir)} — move it to ${localSecretsPath(dir)} (set any value once to copy it)`)
      return names
    }
    if (action === 'set') {
      all[name] = value
      writeLocalSecrets(dir, all)
      say(row('set', `${name} ${dim('(local — morgana dev reads it as ctx.vars.get(...))')}`))
      return
    }
    if (!(name in all)) {
      warn(`${name} was not set locally`)
      return
    }
    delete all[name]
    writeLocalSecrets(dir, all)
    say(row('removed', name))
    return
  }

  const { base, projectId, envName } = resolveTarget({ url, project, env })
  const { bearer } = await resolveCredential({ base, token })
  const route = `/api/v1/projects/${encodeURIComponent(projectId)}/secrets`
  const qs = `?env=${encodeURIComponent(envName)}`

  if (action === 'list') {
    const { body } = await call(base, bearer, 'GET', `${route}${qs}`)
    const list = body?.data?.secrets ?? []
    say(`${bold('secrets')} ${dim(`${projectId} (${envName}) on ${base}`)}`)
    if (!list.length) say(dim('  (none)'))
    for (const s of list) say(`  ${s.name}  ${dim(new Date(s.updatedAt).toISOString())}`)
    return list
  }
  if (action === 'set') {
    await call(base, bearer, 'PUT', `${route}/${encodeURIComponent(name)}${qs}`, { value })
    say(row('set', `${name} ${dim(`for ${projectId} (${envName}) — live on the next action call`)}`))
    return
  }
  const { status } = await call(base, bearer, 'DELETE', `${route}/${encodeURIComponent(name)}${qs}`)
  if (status === 404) warn(`${name} was not set for ${projectId} (${envName})`)
  else say(row('removed', name))
}
