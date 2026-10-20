/**
 * The documentation site — `morgana docs` — as one HTML file.
 *
 * Laid out the way good product docs are (Stripe's, as the reference): a
 * grouped navigation on the left, the page in the middle, the page's contents
 * on the right with the section you're reading marked. Each entry reads like
 * an API reference: name, how it's reached, what it does (its doc comment),
 * its parameters and what it returns, and a call you can copy.
 *
 * Pages: Overview · Storyboard · API · Events · Server objects · Data · UI and config.
 */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Inline marks: `code`, **bold**, [links](url). */
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

/**
 * A doc comment or README as HTML: paragraphs, lists, headings, fenced code,
 * and indented blocks (the flow sketches comments draw) kept as written.
 */
function prose(text) {
  if (!text) return ''
  const lines = String(text).replace(/\r/g, '').split('\n')
  const out = []
  let para = []
  let list = []
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`)
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`)
    para = []
    list = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^\s*```(\w*)/)
    if (fence) {
      flush()
      const body = []
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i])
      out.push(`<pre class="code"><code>${esc(body.join('\n'))}</code></pre>`)
      continue
    }
    if (/^ {2,}\S/.test(line) && !/^\s*[-*]\s/.test(line)) {
      flush()
      const body = [line]
      while (i + 1 < lines.length && (/^ {2,}\S/.test(lines[i + 1]) || (lines[i + 1].trim() === '' && /^ {2,}\S/.test(lines[i + 2] ?? '')))) body.push(lines[++i])
      const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length))
      out.push(`<pre class="sketch">${esc(body.map((l) => l.slice(indent)).join('\n'))}</pre>`)
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)/)
    if (h) { flush(); out.push(`<h4>${inline(h[2])}</h4>`); continue }
    const li = line.match(/^\s*[-*]\s+(.*)/)
    if (li) { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] } list.push(li[1]); continue }
    if (!line.trim()) { flush(); continue }
    if (list.length && /^\s+\S/.test(line)) { list[list.length - 1] += ` ${line.trim()}`; continue }
    if (list.length) flush()
    para.push(line.trim())
  }
  flush()
  return out.join('\n')
}

/** The first sentence of a doc comment, for lists and the search index. */
const lead = (doc) => {
  const first = String(doc ?? '').replace(/\s+/g, ' ').trim()
  const m = first.match(/^(.+?[.!?])(\s|$)/)
  return (m ? m[1] : first).slice(0, 180)
}

const sample = (type) => {
  const t = String(type).trim()
  if (/^string\b/.test(t)) return "'…'"
  if (/^number\b/.test(t)) return '0'
  if (/^boolean\b/.test(t)) return 'true'
  if (/\[\]$|^Array</.test(t)) return '[]'
  if (/^'/.test(t)) return t.split('|')[0].trim()
  return '{ … }'
}

function fieldsTable(fields, title) {
  if (!fields?.length) return ''
  return `<h4 class="label">${title}</h4><div class="params">${fields.map((f) => `
    <div class="param">
      <div class="param-head"><code class="pname">${esc(f.name)}</code><span class="ptype">${esc(f.type)}</span>${f.optional ? '<span class="popt">optional</span>' : ''}</div>
      ${f.doc ? `<div class="pdoc">${prose(f.doc)}</div>` : ''}
    </div>`).join('')}</div>`
}

const kindBadge = (k) => `<span class="badge badge-${slug(k)}">${esc(k)}</span>`

// ── pages ───────────────────────────────────────────────────────────────────

function overviewPage(m) {
  const count = (n, one, many = `${one}s`) => `<div class="stat"><b>${n}</b><span>${n === 1 ? one : many}</span></div>`
  const flows = m.serverActions.filter((a) => a.route || a.triggers.length)
  return `
  <h1>${esc(m.name)}</h1>
  <p class="subtitle">Generated from the project’s build and source${m.version ? ` · version ${esc(m.version)}` : ''}.</p>
  <div class="stats">
    ${count(m.pages.length, 'page')}${count(m.routes.length, 'HTTP route')}${count(m.serverActions.length, 'server action')}${count(m.clientActions.length, 'page action')}${count(m.objects.length, 'server object')}${count(m.stores.length, 'collection')}
  </div>
  ${m.overview ? `<h2 id="overview-intro">About</h2>${prose(m.overview)}` : ''}
  <h2 id="overview-shape">How it fits together</h2>
  <p>Pages in the browser run <a href="#events">page actions</a> when people click and type. Page actions call <a href="#api">server actions</a> by name; outside callers reach the <a href="#api/routes">HTTP routes</a>. Server actions keep records in <a href="#data">collections</a> and start <a href="#objects">server objects</a>, which hold state, run jobs and talk to the page on <a href="#events/channels">channels</a>.</p>
  <pre class="sketch">${esc([
    `browser  ${m.pages.map((p) => p.name).join(', ') || '(no pages)'}`,
    `   │  ${m.clientActions.length} page actions answer its events`,
    `   ▼`,
    `server   ${m.serverActions.length} actions${m.routes.length ? `, ${m.routes.length} HTTP route${m.routes.length > 1 ? 's' : ''}` : ''}${flows.length ? `, ${m.triggers.length} trigger${m.triggers.length === 1 ? '' : 's'}` : ''}`,
    `   │  ${m.objects.map((o) => o.name).join(', ') || 'no server objects'}`,
    `   ▼`,
    `data     ${m.stores.map((s) => s.name).join(', ') || 'no collections'}`,
  ].join('\n'))}</pre>`
}

/** A frame's state, short: its plain values (the screen it names), not the data it fills in with. */
function stateLine(state) {
  const plain = Object.entries(state).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
  const more = Object.keys(state).length - Math.min(plain.length, 4)
  const line = plain.slice(0, 4).map(([k, v]) => `${esc(k)} = ${esc(String(v))}`).join(' · ')
  return (line || 'as it opens') + (more > 0 ? ` <span class="muted">+ ${more} more</span>` : '')
}

function demosPage(m) {
  const demos = m.demos ?? []
  return `
  <h1>Demos</h1>
  <p class="subtitle">Videos of the app, recorded by <code>morgana demo</code>, sized for Reels, TikTok and Shorts.</p>
  ${demos.length ? `<div class="reels">${demos.map((d) => `
    <figure class="reel" id="demo-${slug(d.name)}-${slug(d.format)}">
      <video src="${esc(d.file)}" ${d.poster ? `poster="${esc(d.poster)}"` : ''} controls playsinline preload="none"></video>
      <figcaption><b>${esc(d.title)}</b><span class="state">${esc(d.format)} · ${(d.bytes / 1024 / 1024).toFixed(1)} MB · <a href="${esc(d.file)}" download>download</a></span></figcaption>
    </figure>`).join('')}</div>` : '<div class="callout">No demos yet. Write them in <code>morgana.demos.json</code> and run <code>morgana demo --all</code>, or <code>morgana demo --from-storyboard</code> for one of every screen.</div>'}
  <h2 id="demos-making">Making them</h2>
  <pre class="code"><code>morgana demo                 # the demos in morgana.demos.json
morgana demo fix-cv --list   # its scenes, numbered
morgana demo fix-cv --skip 3 # without scene 3
morgana demo --all --audio assets/beat.mp3</code></pre>`
}

function storyboardPage(m) {
  const pages = m.pages.map((p) => {
    const frames = m.storyboard.filter((f) => f.page === p.name)
    const states = p.states.filter((s) => s.values.length)
    return `
    <h2 id="storyboard-${slug(p.name)}">${esc(p.name)} <span class="muted">${esc(p.address)}</span></h2>
    ${p.render === 'server' ? `<p>Rendered on the server for each request${frames.length ? '' : ': list its addresses as frames with a <code>path</code> in morgana.docs.json to photograph them'}.</p>` : ''}
    ${states.length ? `<p>The screens of this page, one for each value of ${states.map((s) => `<code>${esc(s.key)}</code>`).join(' and ')} (kept in the address as ${states.map((s) => `<code>?${esc(s.param)}=</code>`).join(', ')}).</p>` : '<p>This page has one screen.</p>'}
    ${frames.length ? `<div class="board">${frames.map((f) => `
      <figure class="frame" id="frame-${esc(f.id)}">
        ${f.image ? `<a href="storyboard/${esc(f.image)}" target="_blank"><img src="storyboard/${esc(f.image)}" alt="${esc(f.title)}"></a>` : `<div class="noimg">${esc(f.problem || 'Not photographed')}</div>`}
        <figcaption><b>${esc(f.title)}</b><span class="state">${stateLine(f.state)}</span>
        ${f.same ? `<span class="note">Looks the same as “${esc(m.storyboard.find((x) => x.id === f.same)?.title ?? f.same)}”: this screen fills in from data. Add a frame with that data in morgana.docs.json.</span>` : ''}
        ${f.note ? `<span class="note">${inline(f.note)}</span>` : ''}</figcaption>
      </figure>`).join('')}</div>` : ''}`
  }).join('')
  return `
  <h1>Storyboard</h1>
  <p class="subtitle">Every screen of every page, photographed from the running app.</p>
  ${m.storyboardProblem ? `<div class="callout">${inline(m.storyboardProblem)}</div>` : ''}
  ${pages}
  <h2 id="storyboard-more">Adding screens</h2>
  <p>Screens that only appear with data (a finished result, a signed-in view) can be listed in <code>morgana.docs.json</code> at the project’s root, with the state to open them in:</p>
  <pre class="code"><code>${esc(JSON.stringify({ storyboard: [{ title: 'Brief, with a service picked', page: m.pages[0]?.name ?? 'home', state: { view: 'brief', service: '…' } }] }, null, 2))}</code></pre>`
}

function callOf(a) {
  const fields = a.input?.fields ?? []
  const args = fields.length ? `{ ${fields.filter((f) => !f.optional).map((f) => `${f.name}: ${sample(f.type)}`).join(', ')} }` : '{}'
  return `const result = await ctx.actions.run('${a.name}', ${args})`
}

function actionEntry(a) {
  const reached = []
  if (a.route) reached.push(`<div class="endpoint"><span class="method method-${slug(a.route.method)}">${esc(a.route.method)}</span><code>${esc(a.route.path)}</code>${a.route.auth ? `<span class="muted">auth: ${esc(a.route.auth)}</span>` : ''}</div>`)
  for (const t of a.triggers) reached.push(`<div class="endpoint"><span class="method method-event">ON</span><code>${esc(t)}</code></div>`)
  if (!a.route && !a.triggers.length) {
    const cron = a.on.filter((o) => /^cron/.test(o))
    for (const c of cron) reached.push(`<div class="endpoint"><span class="method method-event">CRON</span><code>${esc(c)}</code></div>`)
    if (!cron.length) reached.push(`<div class="endpoint"><span class="method method-call">CALL</span><code>ctx.actions.run('${esc(a.name)}', …)</code></div>`)
  }
  return `
  <article class="entry" id="api/${esc(a.name)}">
    <h3 id="api-${esc(a.name)}">${esc(a.name)} ${kindBadge('server action')}</h3>
    ${reached.join('')}
    ${a.doc ? prose(a.doc) : '<p class="muted">No doc comment yet. Write one above the action and it appears here.</p>'}
    ${fieldsTable(a.input?.fields, 'Parameters')}
    ${!a.input?.fields && a.input?.type && a.input.type !== 'Record<string, never>' ? `<h4 class="label">Parameters</h4><pre class="code"><code>${esc(a.input.type)}</code></pre>` : ''}
    ${fieldsTable(a.output?.fields, 'Returns')}
    ${!a.output?.fields && a.output?.type && !/^(null|void|undefined|unknown)$/.test(a.output.type) ? `<h4 class="label">Returns</h4><pre class="code"><code>${esc(a.output.type)}</code></pre>` : ''}
    ${!a.route && !a.triggers.length ? `<pre class="code call"><code>${esc(callOf(a))}</code></pre>` : ''}
    <p class="file">${esc(a.file)}</p>
  </article>`
}

function apiPage(m) {
  const routed = m.serverActions.filter((a) => a.route)
  const triggered = m.serverActions.filter((a) => !a.route && a.triggers.length)
  const called = m.serverActions.filter((a) => !a.route && !a.triggers.length)
  return `
  <h1>API</h1>
  <p class="subtitle">The server actions: what reaches each one, what it takes, what it gives back.</p>
  ${routed.length ? `<h2 id="api/routes">HTTP routes</h2>${routed.map(actionEntry).join('')}` : ''}
  ${called.length ? `<h2 id="api/called">Called by name</h2><p>Pages and other actions call these with <code>ctx.actions.run(name, input)</code>.</p>${called.map(actionEntry).join('')}` : ''}
  ${triggered.length ? `<h2 id="api/triggered">Run by events</h2>${triggered.map(actionEntry).join('')}` : ''}
  ${m.compileActions.length ? `<h2 id="api/compile">Build steps</h2><p>Run once, when the project is built: they make the pages, objects and collections.</p>
    <div class="list">${m.compileActions.map((a) => `<div class="row"><code>${esc(a.name)}</code><span>${esc(lead(a.doc)) || '<span class="muted">no doc comment</span>'}</span><span class="file">${esc(a.file)}</span></div>`).join('')}</div>` : ''}`
}

function eventsPage(m) {
  // Page events, grouped by what they come from: "svc-tile.clicked" → svc-tile.
  const rows = []
  for (const a of m.clientActions) for (const on of a.on) rows.push({ on, a })
  const groupOf = (on) => (on === 'loaded' ? 'page' : on.startsWith('state:') ? 'state' : on.startsWith('key:') ? 'keyboard' : on.split('.')[0])
  const groups = new Map()
  for (const r of rows) (groups.get(groupOf(r.on)) ?? groups.set(groupOf(r.on), []).get(groupOf(r.on))).push(r)
  const fromPage = m.frames.filter((f) => f.from === 'page')
  const fromServer = m.frames.filter((f) => f.from === 'server')
  const frameRow = (f) => `<div class="row"><code>${esc(f.t)}</code><span>${f.fields.length ? f.fields.map((x) => `<code class="soft">${esc(x)}</code>`).join(' ') : '<span class="muted">no fields</span>'}</span><span class="file">${f.files.map(esc).join('<br>')}</span></div>`
  return `
  <h1>Events</h1>
  <p class="subtitle">What happens when: page events and the actions that answer them, server triggers, and the messages on channels.</p>
  <h2 id="events/page">Page events</h2>
  <p>Each event on the page and the page action that runs. An object’s events are named <code>&lt;id&gt;.&lt;event&gt;</code>; <code>loaded</code> fires when a page opens; <code>state:&lt;key&gt;</code> when that state changes.</p>
  <div class="list">${[...groups.values()].flat().map(({ on, a }) => `<div class="row"><code class="event">${esc(on)}</code><span><b>${esc(a.name)}</b> ${a.doc ? `· ${esc(lead(a.doc))}` : ''}</span><span class="file">${esc(a.file)}</span></div>`).join('')}</div>
  <h2 id="events/server">Server triggers</h2>
  ${m.triggers.length ? `<div class="list">${m.triggers.map((t) => `<div class="row"><code class="event">${esc(t.event)}</code><span>runs <a href="#api/${esc(t.run)}"><b>${esc(t.run)}</b></a>${t.enabled === false ? ' <span class="muted">(off)</span>' : ''}</span><span></span></div>`).join('')}</div>` : '<p class="muted">No server triggers.</p>'}
  ${m.objects.some((o) => o.emits.length) ? `<h3 id="events-emitted">Emitted by server objects</h3><div class="list">${m.objects.flatMap((o) => o.emits.map((e) => `<div class="row"><code class="event">object:${esc(o.name)}.${esc(e)}</code><span>from <a href="#objects/${esc(o.name)}"><b>${esc(o.name)}</b></a></span><span></span></div>`)).join('')}</div>` : ''}
  <h2 id="events/channels">Channel messages</h2>
  <p>Messages are JSON objects named by their <code>t</code>. ${m.objects.filter((o) => o.channel).map((o) => `<a href="#objects/${esc(o.name)}">${esc(o.name)}</a> listens on <code>${esc(o.channel.name)}</code>`).join('; ') || ''}</p>
  ${fromServer.length ? `<h3 id="events-server-frames">Server → page</h3><div class="list">${fromServer.map(frameRow).join('')}</div>` : ''}
  ${fromPage.length ? `<h3 id="events-page-frames">Page → server</h3><div class="list">${fromPage.map(frameRow).join('')}</div>` : ''}`
}

function objectsPage(m) {
  return `
  <h1>Server objects</h1>
  <p class="subtitle">Durable state with methods and jobs. Server code reaches each one as <code>ctx.objects.&lt;name&gt;</code>.</p>
  ${m.objects.map((o) => `
  <article class="entry" id="objects/${esc(o.name)}">
    <h2 id="objects-${esc(o.name)}">${esc(o.name)} ${kindBadge('server object')}</h2>
    <div class="endpoint"><span class="method method-call">OBJ</span><code>ctx.objects.get('${esc(o.camel)}', name)</code></div>
    ${o.channel ? `<div class="endpoint"><span class="method method-event">CHANNEL</span><code>${esc(o.channel.name)}</code>${o.channel.receive ? `<span class="muted">messages go to ${esc(o.channel.receive)}()</span>` : ''}</div>` : ''}
    ${o.doc ? prose(o.doc) : '<p class="muted">No doc comment yet.</p>'}
    ${Object.keys(o.access).length ? `<p><b>From the browser:</b> ${Object.entries(o.access).map(([k, v]) => `<code>${esc(k)}</code> (${esc(v)})`).join(', ')}. Everything else is server only.</p>` : '<p><b>Server only:</b> the browser can’t reach it.</p>'}
    <h3 id="objects-${esc(o.name)}-methods">Methods</h3>
    <div class="params">${o.methods.map((x) => `<div class="param"><div class="param-head"><code class="pname">${esc(x.name)}(${esc(x.params)})</code>${x.access ? `<span class="popt">browser: ${esc(x.access)}</span>` : ''}</div>${x.doc ? `<div class="pdoc">${prose(x.doc)}</div>` : ''}</div>`).join('')}</div>
    ${o.jobs.length ? `<h3 id="objects-${esc(o.name)}-jobs">Jobs</h3><div class="params">${o.jobs.map((x) => `<div class="param"><div class="param-head"><code class="pname">${esc(x.name)}</code></div>${x.doc ? `<div class="pdoc">${prose(x.doc)}</div>` : ''}</div>`).join('')}</div>` : ''}
    ${fieldsTable(o.state, 'State')}
    <p class="file">${esc(o.file)}</p>
  </article>`).join('') || '<p class="muted">No server objects.</p>'}`
}

function dataPage(m) {
  return `
  <h1>Data</h1>
  <p class="subtitle">Collections: the project’s tables, as the build declares them.</p>
  ${m.stores.map((s) => `
    <h2 id="data-${slug(s.name)}">${esc(s.name)}</h2>
    <pre class="code call"><code>${esc(`await ctx.server.collections.query('${s.name}', { pageSize: 50 })`)}</code></pre>
    <table class="cols"><thead><tr><th>Column</th><th>Type</th></tr></thead><tbody>
      <tr><td><code>id</code></td><td class="muted">string · the row’s key</td></tr>
      ${s.columns.map((c) => `<tr><td><code>${esc(c.name)}</code></td><td>${esc(c.type)}</td></tr>`).join('')}
    </tbody></table>`).join('') || '<p class="muted">No collections.</p>'}`
}

function uiPage(m) {
  return `
  <h1>UI and config</h1>
  <p class="subtitle">Apps, pages, custom objects and the variables the project reads.</p>
  <h2 id="ui/pages">Apps and pages</h2>
  <table class="cols"><thead><tr><th>Page</th><th>Address</th><th>App</th><th>Rendered</th></tr></thead><tbody>
    ${m.pages.map((p) => `<tr><td><a href="#storyboard-${slug(p.name)}"><code>${esc(p.name)}</code></a></td><td><code>${esc(p.address)}</code></td><td>${esc(p.app)}</td><td>${esc(p.render)}</td></tr>`).join('')}
  </tbody></table>
  ${m.pages.some((p) => p.states.length) ? `<h3 id="ui-address">State in the address</h3><div class="list">${m.pages.flatMap((p) => p.states.map((s) => `<div class="row"><code>?${esc(s.param)}=</code><span><b>${esc(s.key)}</b> on ${esc(p.name)}${s.values.length ? ` · ${s.values.map((v) => `<code class="soft">${esc(v)}</code>`).join(' ')}` : ''}</span><span class="muted">starts as ${esc(JSON.stringify(s.initial))}</span></div>`)).join('')}</div>` : ''}
  <h2 id="ui/custom">Custom objects</h2>
  ${m.customObjects.map((c) => `
    <h3 id="ui-${slug(c.name)}">${esc(c.name)} ${kindBadge('custom object')}</h3>
    <div class="endpoint"><span class="method method-call">UI</span><code>ctx.ui.${esc(c.camel)}({ id: '…' })</code></div>
    ${prose(c.doc)}
    ${Object.keys(c.props).length ? `<h4 class="label">Props</h4><div class="params">${Object.entries(c.props).map(([k, v]) => `<div class="param"><div class="param-head"><code class="pname">${esc(k)}</code><span class="ptype">${esc(typeof v)}</span><span class="popt">default ${esc(JSON.stringify(v))}</span></div></div>`).join('')}</div>` : ''}
    <p class="file">${esc(c.file)}</p>`).join('') || '<p class="muted">No custom objects.</p>'}
  <h2 id="ui/vars">Variables</h2>
  ${m.vars.length ? `<p>Read with <code>ctx.vars.get(name)</code>. Secrets are set with <code>morgana secrets</code> and never appear here.</p><div class="list">${m.vars.map((v) => `<div class="row"><code>${esc(v)}</code><span></span><span></span></div>`).join('')}</div>` : '<p class="muted">No public variables.</p>'}`
}

// ── the site ────────────────────────────────────────────────────────────────

/** @param {ReturnType<import('./docs-model.mjs').collectDocs>} m */
export function renderDocs(m) {
  const pages = [
    { id: 'overview', title: 'Overview', html: overviewPage(m), items: [] },
    { id: 'storyboard', title: 'Storyboard', html: storyboardPage(m), items: m.pages.map((p) => [`storyboard-${slug(p.name)}`, p.name]) },
    ...((m.demos ?? []).length ? [{ id: 'demos', title: 'Demos', html: demosPage(m), items: (m.demos ?? []).map((d) => [`demo-${slug(d.name)}-${slug(d.format)}`, d.title]) }] : []),
    { id: 'api', title: 'API', html: apiPage(m), items: m.serverActions.map((a) => [`api/${a.name}`, a.name]) },
    { id: 'events', title: 'Events', html: eventsPage(m), items: [['events/page', 'Page events'], ['events/server', 'Server triggers'], ['events/channels', 'Channel messages']] },
    { id: 'objects', title: 'Server objects', html: objectsPage(m), items: m.objects.map((o) => [`objects/${o.name}`, o.name]) },
    { id: 'data', title: 'Data', html: dataPage(m), items: m.stores.map((s) => [`data-${slug(s.name)}`, s.name]) },
    { id: 'ui', title: 'UI and config', html: uiPage(m), items: [['ui/pages', 'Apps and pages'], ['ui/custom', 'Custom objects'], ['ui/vars', 'Variables']] },
  ]
  const index = [
    ...m.serverActions.map((a) => ({ t: a.name, k: 'Server action', h: `api/${a.name}`, d: lead(a.doc) })),
    ...m.clientActions.map((a) => ({ t: a.name, k: `Page action · ${a.on.join(', ')}`, h: 'events/page', d: lead(a.doc) })),
    ...m.objects.map((o) => ({ t: o.name, k: 'Server object', h: `objects/${o.name}`, d: lead(o.doc) })),
    ...m.objects.flatMap((o) => o.methods.map((x) => ({ t: `${o.name}.${x.name}`, k: 'Method', h: `objects/${o.name}`, d: lead(x.doc) }))),
    ...m.stores.map((s) => ({ t: s.name, k: 'Collection', h: `data-${slug(s.name)}`, d: s.columns.map((c) => c.name).join(', ') })),
    ...m.frames.map((f) => ({ t: f.t, k: `Channel message · ${f.from === 'page' ? 'page → server' : 'server → page'}`, h: 'events/channels', d: f.fields.join(', ') })),
    ...m.customObjects.map((c) => ({ t: c.name, k: 'Custom object', h: `ui-${slug(c.name)}`, d: lead(c.doc) })),
  ]
  const nav = pages.map((p) => `
    <div class="nav-group" data-page="${p.id}">
      <a class="nav-page" href="#${p.id}">${esc(p.title)}</a>
      ${p.items.length ? `<div class="nav-items">${p.items.map(([h, t]) => `<a href="#${esc(h)}">${esc(t)}</a>`).join('')}</div>` : ''}
    </div>`).join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.name)} · Docs</title>
<style>
:root { --bg:#ffffff; --side:#f7f8fa; --ink:#1a1f36; --text:#3c4257; --soft:#697386; --line:#e3e8ee; --accent:#635bff; --accent-soft:#f0efff; --code:#f6f8fa; --codeink:#24292f; --get:#09825d; --post:#635bff; --event:#c2410c; --call:#0e6fb8; --warn:#fff8e6; --warnline:#f5d78e; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0f1219; --side:#141821; --ink:#f5f7fb; --text:#c4cad6; --soft:#8b93a5; --line:#262c38; --accent:#8f88ff; --accent-soft:#1f1d3a; --code:#171b24; --codeink:#d9dee8; --get:#3ecf8e; --post:#9d97ff; --event:#ff9a5c; --call:#5ab0f0; --warn:#2a2412; --warnline:#5c4a1a; color-scheme: dark; } }
:root[data-theme="dark"] { --bg:#0f1219; --side:#141821; --ink:#f5f7fb; --text:#c4cad6; --soft:#8b93a5; --line:#262c38; --accent:#8f88ff; --accent-soft:#1f1d3a; --code:#171b24; --codeink:#d9dee8; --get:#3ecf8e; --post:#9d97ff; --event:#ff9a5c; --call:#5ab0f0; --warn:#2a2412; --warnline:#5c4a1a; color-scheme: dark; }
* { box-sizing: border-box; }
html { scroll-padding-top: 76px; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
code, pre { font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 13px; }
:not(pre) > code { background: var(--code); color: var(--codeink); padding: 1px 5px; border-radius: 4px; border: 1px solid var(--line); }
code.soft { border: 0; }
.top { position: sticky; top: 0; z-index: 5; height: 60px; display: flex; align-items: center; gap: 16px; padding: 0 20px; background: var(--bg); border-bottom: 1px solid var(--line); }
.brand { font-weight: 700; color: var(--ink); font-size: 17px; white-space: nowrap; } .brand span { color: var(--accent); font-weight: 600; margin-left: 6px; }
.search { position: relative; flex: 1; max-width: 420px; }
.search input { width: 100%; height: 36px; border: 1px solid var(--line); border-radius: 8px; background: var(--side); color: var(--ink); padding: 0 12px; font: inherit; font-size: 14px; }
.results { position: absolute; top: 42px; left: 0; right: 0; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 16px 40px -12px rgba(0,0,0,.25); max-height: 60vh; overflow: auto; display: none; }
.results a { display: block; padding: 9px 12px; border-bottom: 1px solid var(--line); color: var(--text); } .results a:hover, .results a.on { background: var(--accent-soft); text-decoration: none; }
.results b { color: var(--ink); } .results small { display: block; color: var(--soft); }
.top .meta { margin-left: auto; color: var(--soft); font-size: 13px; white-space: nowrap; }
.menu { display: none; border: 1px solid var(--line); background: var(--side); color: var(--ink); border-radius: 8px; height: 36px; padding: 0 12px; font: inherit; }
.layout { display: grid; grid-template-columns: 260px minmax(0, 1fr) 220px; }
.side { position: sticky; top: 60px; height: calc(100vh - 60px); overflow: auto; background: var(--side); border-right: 1px solid var(--line); padding: 18px 12px 40px; }
.nav-group { margin-bottom: 4px; }
.nav-page { display: block; padding: 6px 10px; border-radius: 6px; color: var(--ink); font-weight: 600; font-size: 14px; }
.nav-items { display: none; margin: 2px 0 8px 10px; border-left: 1px solid var(--line); }
.nav-group.open .nav-items { display: block; }
.nav-items a { display: block; padding: 4px 10px; color: var(--soft); font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-items a.on { color: var(--accent); font-weight: 600; }
.nav-group.open > .nav-page { color: var(--accent); background: var(--accent-soft); }
main { min-width: 0; padding: 36px 48px 80px; max-width: 900px; }
section[data-page] { display: none; } section[data-page].shown { display: block; }
h1 { color: var(--ink); font-size: 32px; line-height: 40px; margin: 0 0 6px; }
.subtitle { font-size: 19px; color: var(--soft); margin: 0 0 26px; line-height: 1.45; }
h2 { color: var(--ink); font-size: 24px; line-height: 32px; font-weight: 600; margin: 44px 0 12px; padding-top: 4px; }
h3 { color: var(--ink); font-size: 18px; margin: 30px 0 8px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
h4 { color: var(--ink); font-size: 15px; margin: 18px 0 6px; }
h4.label { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--soft); border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-top: 22px; }
p { margin: 8px 0; } ul { padding-left: 20px; }
.muted { color: var(--soft); font-weight: 400; font-size: .92em; }
.entry { border-top: 1px solid var(--line); padding: 4px 0 18px; margin-top: 18px; }
.endpoint { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 6px 0; }
.endpoint code { background: transparent !important; border: 0 !important; padding: 0 !important; color: var(--ink) !important; font-size: 13.5px; }
.method { font: 700 11px/1 "SF Mono", Menlo, Consolas, monospace; padding: 4px 6px; border-radius: 4px; letter-spacing: .04em; }
.method-get { color: var(--get); background: color-mix(in srgb, var(--get) 12%, transparent); }
.method-post, .method-put, .method-delete, .method-patch { color: var(--post); background: color-mix(in srgb, var(--post) 12%, transparent); }
.method-event { color: var(--event); background: color-mix(in srgb, var(--event) 12%, transparent); }
.method-call { color: var(--call); background: color-mix(in srgb, var(--call) 12%, transparent); }
.badge { font-size: 11px; font-weight: 600; color: var(--soft); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; }
.params { border-bottom: 1px solid var(--line); }
.param { padding: 12px 0; border-top: 1px solid var(--line); } .param:first-child { border-top: 0; }
.param-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.pname { font-weight: 700; color: var(--ink) !important; background: transparent !important; border: 0 !important; padding: 0 !important; }
.ptype { font: 12px "SF Mono", Menlo, Consolas, monospace; color: var(--soft); }
.popt { font-size: 12px; color: var(--soft); }
.pdoc { color: var(--text); font-size: 14px; } .pdoc p { margin: 4px 0; }
pre.code { background: var(--code); color: var(--codeink); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; overflow: auto; }
pre.call { border-left: 3px solid var(--accent); }
pre.sketch { background: transparent; color: var(--text); border-left: 2px solid var(--line); padding: 4px 0 4px 14px; overflow: auto; line-height: 1.5; }
.file { font: 12px "SF Mono", Menlo, Consolas, monospace; color: var(--soft); }
.list { border-top: 1px solid var(--line); }
.row { display: grid; grid-template-columns: minmax(150px, 230px) 1fr auto; gap: 14px; padding: 9px 0; border-bottom: 1px solid var(--line); align-items: baseline; font-size: 14px; }
.row .file { text-align: right; }
code.event { color: var(--event) !important; }
table.cols { width: 100%; border-collapse: collapse; font-size: 14px; margin: 10px 0; }
table.cols th { text-align: left; color: var(--soft); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--line); padding: 8px 0; }
table.cols td { border-bottom: 1px solid var(--line); padding: 8px 12px 8px 0; }
.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin: 8px 0 10px; }
.stat { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; } .stat b { display: block; font-size: 24px; color: var(--ink); } .stat span { color: var(--soft); font-size: 13px; }
.board { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; margin-top: 14px; }
.frame { margin: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--side); }
.frame img { display: block; width: 100%; aspect-ratio: 1280/820; object-fit: cover; object-position: top; border-bottom: 1px solid var(--line); }
.noimg { aspect-ratio: 1280/820; display: grid; place-items: center; color: var(--soft); font-size: 13px; padding: 20px; text-align: center; }
.reels { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; margin-top: 14px; }
.reel { margin: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--side); }
.reel video { display: block; width: 100%; aspect-ratio: 9/16; background: #000; object-fit: contain; }
.reel figcaption { padding: 10px 12px; display: grid; gap: 3px; } .reel b { color: var(--ink); }
.frame figcaption { padding: 10px 12px; display: grid; gap: 3px; } .frame b { color: var(--ink); }
.state { font: 12px "SF Mono", Menlo, Consolas, monospace; color: var(--soft); }
.note { font-size: 12.5px; color: var(--soft); }
.callout { background: var(--warn); border: 1px solid var(--warnline); border-radius: 8px; padding: 10px 14px; margin: 10px 0; }
.toc { position: sticky; top: 60px; height: calc(100vh - 60px); overflow: auto; padding: 36px 16px 40px 8px; font-size: 13px; }
.toc h5 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--soft); }
.toc a { display: block; padding: 3px 0 3px 10px; border-left: 2px solid transparent; color: var(--soft); }
.toc a.sub { padding-left: 22px; font-size: 12.5px; }
.toc a.on { color: var(--accent); border-left-color: var(--accent); font-weight: 600; text-decoration: none; }
@media (max-width: 1180px) { .layout { grid-template-columns: 240px minmax(0, 1fr); } .toc { display: none; } }
@media (max-width: 760px) {
  .layout { grid-template-columns: 1fr; } .menu { display: block; } .top .meta { display: none; }
  .side { display: none; position: fixed; inset: 60px 0 0 0; z-index: 4; height: auto; } body.nav-open .side { display: block; }
  main { padding: 24px 16px 60px; } .row { grid-template-columns: 1fr; gap: 4px; } .row .file { text-align: left; }
}
</style></head>
<body>
<header class="top">
  <button class="menu" id="menu" aria-label="Menu">☰</button>
  <a class="brand" href="#overview">${esc(m.name)}<span>Docs</span></a>
  <div class="search"><input id="q" type="search" placeholder="Search actions, objects, events…" autocomplete="off"><div class="results" id="results"></div></div>
  <span class="meta">Generated ${esc(m.generatedAt.slice(0, 16).replace('T', ' '))} · morgana docs</span>
</header>
<div class="layout">
  <nav class="side" id="side">${nav}</nav>
  <main id="main">${pages.map((p) => `<section data-page="${p.id}" id="page-${p.id}">${p.html}</section>`).join('')}</main>
  <aside class="toc" id="toc"></aside>
</div>
<script>
(function () {
  var INDEX = ${JSON.stringify(index).replace(/</g, '\\u003c')};
  var sections = [].slice.call(document.querySelectorAll('section[data-page]'));
  var groups = [].slice.call(document.querySelectorAll('.nav-group'));
  var toc = document.getElementById('toc');
  var spy = null;
  function pageOf(hash) {
    var id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id) return { page: 'overview', target: null };
    var el = document.getElementById(id);
    var sec = el ? el.closest('section[data-page]') : document.getElementById('page-' + id);
    return { page: sec ? sec.getAttribute('data-page') : 'overview', target: el && el.tagName !== 'SECTION' ? el : null };
  }
  function show() {
    var at = pageOf(location.hash);
    sections.forEach(function (s) { s.classList.toggle('shown', s.getAttribute('data-page') === at.page); });
    groups.forEach(function (g) { g.classList.toggle('open', g.getAttribute('data-page') === at.page); });
    buildToc(at.page);
    document.body.classList.remove('nav-open');
    if (at.target) at.target.scrollIntoView(); else window.scrollTo(0, 0);
  }
  function buildToc(page) {
    var sec = document.getElementById('page-' + page);
    var heads = [].slice.call(sec.querySelectorAll('h2[id], h3[id]'));
    toc.innerHTML = heads.length ? '<h5>On this page</h5>' + heads.map(function (h) {
      return '<a href="#' + encodeURIComponent(h.id).replace(/%2F/g, '/') + '" data-for="' + h.id + '" class="' + (h.tagName === 'H3' ? 'sub' : '') + '">' + h.textContent.replace(/</g, '&lt;') + '</a>';
    }).join('') : '';
    if (spy) spy.disconnect();
    spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        [].forEach.call(toc.querySelectorAll('a'), function (a) { a.classList.toggle('on', a.getAttribute('data-for') === e.target.id); });
        [].forEach.call(document.querySelectorAll('.nav-items a'), function (a) {
          var h = decodeURIComponent(a.getAttribute('href').slice(1));
          var mine = document.getElementById(h);
          a.classList.toggle('on', !!mine && (mine === e.target || mine.contains(e.target)));
        });
      });
    }, { rootMargin: '-70px 0px -70% 0px' });
    heads.forEach(function (h) { spy.observe(h); });
  }
  window.addEventListener('hashchange', show);
  document.getElementById('menu').addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  var q = document.getElementById('q'), results = document.getElementById('results'), picked = 0;
  function search() {
    var words = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
    if (!words.length) { results.style.display = 'none'; return; }
    var hits = INDEX.filter(function (x) { var hay = (x.t + ' ' + x.k + ' ' + x.d).toLowerCase(); return words.every(function (w) { return hay.indexOf(w) >= 0; }); }).slice(0, 12);
    picked = 0;
    results.innerHTML = hits.length ? hits.map(function (x, i) { return '<a href="#' + x.h + '" class="' + (i === 0 ? 'on' : '') + '"><b>' + x.t.replace(/</g, '&lt;') + '</b> <span class="muted">' + x.k.replace(/</g, '&lt;') + '</span><small>' + x.d.replace(/</g, '&lt;') + '</small></a>'; }).join('') : '<a><small>Nothing matches.</small></a>';
    results.style.display = 'block';
  }
  q.addEventListener('input', search);
  q.addEventListener('keydown', function (e) {
    var links = results.querySelectorAll('a[href]');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); picked = (picked + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % Math.max(1, links.length); [].forEach.call(links, function (a, i) { a.classList.toggle('on', i === picked); }); }
    if (e.key === 'Enter' && links[picked]) { location.hash = links[picked].getAttribute('href'); q.value = ''; results.style.display = 'none'; }
    if (e.key === 'Escape') { q.value = ''; results.style.display = 'none'; }
  });
  results.addEventListener('click', function () { q.value = ''; results.style.display = 'none'; });
  document.addEventListener('keydown', function (e) { if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); } });
  show();
})();
</script>
</body></html>`
}
