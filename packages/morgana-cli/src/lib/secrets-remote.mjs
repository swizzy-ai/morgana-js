/**
 * The worker's secrets API, and the push of the project's local secrets to it.
 *
 * Shared by `morgana secrets` and `morgana deploy`, so the two cannot send a
 * secret differently. Values go only to the worker, over HTTPS, and only their
 * names are ever printed.
 */
import { readLocalSecrets, SECRET_NAME_RE } from './secrets.mjs'

export async function call(base, bearer, method, route, body) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { message: text.slice(0, 300) }
  }
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
    throw new Error(`${method} ${route} → ${res.status} ${parsed?.message ?? ''}`)
  }
  return { status: res.status, body: parsed }
}

/**
 * Send every local secret to the worker for this project and environment. A
 * name that is not a valid secret name stops the push before anything is sent.
 * Returns the names sent (sorted), never the values.
 */
export async function pushLocalSecrets({ base, bearer, projectId, envName, dir }) {
  const all = readLocalSecrets(dir)
  const names = Object.keys(all).sort()
  const bad = names.filter((n) => !SECRET_NAME_RE.test(n))
  if (bad.length) throw new Error(`invalid secret name(s) in morgana.secrets.json: ${bad.join(', ')} — use letters, digits and _`)
  const route = `/api/v1/projects/${encodeURIComponent(projectId)}/secrets`
  const qs = `?env=${encodeURIComponent(envName)}`
  for (const name of names) {
    await call(base, bearer, 'PUT', `${route}/${encodeURIComponent(name)}${qs}`, { value: all[name] })
  }
  return names
}
