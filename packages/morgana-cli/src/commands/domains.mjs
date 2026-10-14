/**
 * `morgana domains` — serve the project at a hostname you own.
 *
 *   morgana domains add shop.example.com     prints the TXT record to create
 *   morgana domains verify shop.example.com  checks it, then routes the host
 *   morgana domains list
 *   morgana domains remove shop.example.com
 *
 * The hostname must also reach the worker: a route on your Cloudflare zone, or
 * a Cloudflare for SaaS custom hostname pointing at it.
 */
import { say, warn, row, bold, dim } from '../ui.mjs'
import { resolveTarget, resolveCredential } from './deploy.mjs'

async function call(base, bearer, method, route, body) {
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
  return { status: res.status, ok: res.ok, body: parsed }
}

export async function domains({ action, hostname, url, project, env, token } = {}) {
  if (!['add', 'verify', 'list', 'remove'].includes(action)) {
    throw new Error('usage: morgana domains <add|verify|list|remove> [hostname]')
  }
  if (action !== 'list' && !hostname) throw new Error(`morgana domains ${action} needs a hostname`)
  const { base, projectId, envName } = resolveTarget({ url, project, env })
  const { bearer } = await resolveCredential({ base, token })
  const route = `/api/v1/projects/${encodeURIComponent(projectId)}/domains`
  const qs = `?env=${encodeURIComponent(envName)}`

  if (action === 'list') {
    const r = await call(base, bearer, 'GET', `${route}${qs}`)
    if (!r.ok) throw new Error(`${r.status} ${r.body?.message ?? ''}`)
    const list = r.body?.data?.domains ?? []
    say(`${bold('domains')} ${dim(`${projectId} (${envName})`)}`)
    if (!list.length) say(dim('  (none)'))
    for (const d of list) say(`  ${d.hostname}  ${d.status === 'active' ? 'active' : dim('pending — TXT ' + d.txtName + ' = ' + d.txtValue)}`)
    return list
  }
  if (action === 'add') {
    const r = await call(base, bearer, 'POST', `${route}${qs}`, { hostname })
    if (!r.ok) throw new Error(`${r.status} ${r.body?.message ?? ''}`)
    const d = r.body.data
    if (d.status === 'active') {
      say(row('active', d.hostname))
      return d
    }
    say(`Prove you control ${bold(d.hostname)} — add this DNS record:`)
    say(`  type   TXT`)
    say(`  name   ${d.txtName}`)
    say(`  value  ${d.txtValue}`)
    say(dim(`then: morgana domains verify ${d.hostname}`))
    return d
  }
  if (action === 'verify') {
    const r = await call(base, bearer, 'POST', `${route}/${encodeURIComponent(hostname)}/verify${qs}`)
    if (!r.ok) {
      warn(r.body?.message ?? `verify failed (${r.status})`)
      return null
    }
    say(row('active', `${r.body.data.url}`))
    return r.body.data
  }
  const r = await call(base, bearer, 'DELETE', `${route}/${encodeURIComponent(hostname)}${qs}`)
  if (!r.ok) throw new Error(`${r.status} ${r.body?.message ?? ''}`)
  say(row('removed', hostname))
}
