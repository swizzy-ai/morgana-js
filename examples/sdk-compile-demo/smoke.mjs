// Smoke test: builds, then boots the server and checks frontend + backend.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const port = 4329

function run(nodeArgs, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, nodeArgs, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, out, err, child }))
  })
}

const build = await run(['build.mjs'])
console.log(build.out)
if (build.code !== 0) {
  console.error(build.err)
  process.exit(1)
}

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: dir,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((r) => setTimeout(r, 800))
if (!(await waitForServer(`http://localhost:${port}/`))) {
  console.error('smoke FAILED: server never came up')
  child.kill()
  process.exit(1)
}

const failures = []
async function check(label, url, want) {
  let res
  try {
    res = await fetch(url)
  } catch (err) {
    console.log(`FAIL ${label} -> fetch failed: ${err.message}`)
    failures.push(label)
    return
  }
  const text = await res.text()
  const ok = res.ok && text.includes(want)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} -> ${res.status} contains ${JSON.stringify(want)}`)
  if (!ok) failures.push(label)
}
async function checkPost(label, url, body, want) {
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.log(`FAIL ${label} -> fetch failed: ${err.message}`)
    failures.push(label)
    return
  }
  const text = await res.text()
  const ok = res.ok && text.includes(want)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} -> ${res.status} contains ${JSON.stringify(want)}`)
  if (!ok) failures.push(label)
}
/** Poll until the server accepts connections (slow boots under load). */
async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  for (;;) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 404) return true
    } catch { /* not up yet */ }
    if (Date.now() - start > timeoutMs) return false
    await new Promise((r) => setTimeout(r, 500))
  }
}

await check('home page', `http://localhost:${port}/pages/home.html`, 'data-entity="hero"')
await check('default page is entry', `http://localhost:${port}/`, 'Acme — Ship faster')
await check('landing head', `http://localhost:${port}/pages/landing.html`, '<title>Acme — Ship faster</title>')
await check('landing grid bp', `http://localhost:${port}/assets/style.css`, 'grid-template-columns:repeat(3')
await check('landing free badge', `http://localhost:${port}/assets/style.css`, 'position:absolute;left:16px')
await check('landing display font', `http://localhost:${port}/assets/style.css`, 'font-size:52px')
await check('landing lucide', `http://localhost:${port}/pages/landing.html`, 'data-lucide="arrow-right"')
await check('landing stacks', `http://localhost:${port}/pages/landing.html`, 'data-entity="l-copy"')
await check('dashboard asset', `http://localhost:${port}/assets/dashboard.svg`, '<svg')
await check('loaded wiring', `http://localhost:${port}/assets/client.js`, 'fireLoaded')
await checkPost('action run', `http://localhost:${port}/api/actions/getStats/run`, { params: {} }, '"visitors":1284')
await check('kitchen table', `http://localhost:${port}/pages/kitchen.html`, 'data-sortable="true"')
await check('kitchen tabs', `http://localhost:${port}/pages/kitchen.html`, 'data-part="tab-list"')
await check('kitchen switch', `http://localhost:${port}/pages/kitchen.html`, 'data-part="track"')
await check('kitchen chart', `http://localhost:${port}/pages/kitchen.html`, '<svg')
await check('kitchen dialog', `http://localhost:${port}/pages/kitchen.html`, 'data-open-dialog="k-dialog"')
await check('kitchen list', `http://localhost:${port}/pages/kitchen.html`, 'n1')
await check('state binding', `http://localhost:${port}/pages/home.html`, 'data-bind="*:cart.statusLabel"')
await check('client.js', `http://localhost:${port}/assets/client.js`, '"checkout"')
await check('live handle wiring', `http://localhost:${port}/assets/client.js`, 'Checkout now')
await check('page runtime present', `http://localhost:${port}/assets/client.js`, '__morgana_runtime')
await check('object manifest', `http://localhost:${port}/pages/home.html`, '__MORGANA_OBJECTS__')
await check('state wiring', `http://localhost:${port}/assets/client.js`, 'state:cart.open')
await check('http route', `http://localhost:${port}/hello?name=ada`, '"hi ada"')
await check('triggers', `http://localhost:${port}/api/triggers`, 'store.orders.created')
await checkPost('event log ingest', `http://localhost:${port}/api/events/log`, { event: 'action:error', source: 'smoke' }, '"success":true')
await check('event log read', `http://localhost:${port}/api/events/log`, 'action:error')

// The collections contract, invoked as an action rather than inspected as a
// string — because that is the only way to exercise it. Every method on
// `ctx.server.collections` returns a promise, and an un-awaited call is legal
// JavaScript, so a handle that drifted to returning a bare value still compiles,
// still builds, still deploys, and only fails here. `verifyContract` asserts
// every method's resolved shape and cleans up after itself.
await checkPost('collections contract', `http://localhost:${port}/api/actions/verifyContract/run`, {}, '"ok":true')

// And the read path that broke in production, end to end: listOrders returned a
// promise that was read like a value, so it threw on every deployed call while
// passing here. It has to actually return items.
await checkPost('collections read', `http://localhost:${port}/api/actions/listOrders/run`, {}, '"items"')

// Channels: publish from a server action, then read the durable history back.
// A channel that accepts a publish but reaches nobody is the exact shape of bug
// the transport fixed — `publish` used to only write to the action log, so this
// passed while no page could ever hear it. Asserting the history is what proves
// something was actually recorded.
await checkPost('channel publish', `http://localhost:${port}/api/actions/say/run`, { channel: 'lobby', text: 'smoke' }, '"ok":true')
await checkPost('channel history', `http://localhost:${port}/api/channels/history`, { name: 'lobby' }, 'smoke')

// Channel access. `lobby` declares nothing, `announcements` an explicit member
// list, and `support` a permission function — so these four checks between them
// cover the whole model: open, member list, and the function that decides.
//
// The point is the *refusals*. A host that ignored the rules would answer 200 to
// all of them and still look like it worked, which is exactly the shape of the
// bug that left every trigger undeployed for weeks.
{
  const status = async (channel, headers = {}) => {
    const res = await fetch(`http://localhost:${port}/api/events?channel=${channel}`, {
      headers: { accept: 'text/event-stream', ...headers },
      signal: AbortSignal.timeout(2000),
    }).catch((e) => ({ status: e?.name === 'TimeoutError' ? 200 : 0 }))
    return res.status
  }
  const expect = async (label, channel, want) => {
    const got = await status(channel)
    if (got !== want) {
      console.error(`channel access FAILED — ${label}: ${channel} returned ${got}, expected ${want}`)
      failures.push(`channel access: ${channel}`)
    } else {
      console.log(`ok   channel access -> ${label}`)
    }
  }
  // Nothing declared: open to the project, which is what keeps a channel created
  // at runtime usable.
  await expect('lobby is open', 'lobby', 200)
  // A member list refuses a caller who is not on it — with no session, so the
  // check is "nobody can be on this list" rather than a membership comparison.
  await expect('announcements needs a member', 'announcements', 401)
  // A permission function, evaluated for a caller with no session. The function
  // answers ok:false, and the refusal carries its reason.
  await expect('support refuses a stranger', 'support', 401)
}

child.kill()
await new Promise((r) => setTimeout(r, 300))
if (failures.length) {
  console.error('smoke FAILED:', failures.join(', '))
  process.exit(1)
}
console.log('smoke passed')
