/**
 * What a project's documentation is made from — `morgana docs`.
 *
 * Two sources, both exact:
 *   - the build (dist/): pages, routes, server objects, triggers, collections,
 *     custom objects, vars, and each page's address-bound states with every
 *     value its conditions use (the storyboard's frames);
 *   - the source (src/): read with the project's own TypeScript, for what the
 *     build doesn't keep — doc comments, contracts, the events each action
 *     answers, the frames sent on channels and the events objects emit.
 *
 * Nothing here is written by hand: the docs are as good as the comments.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const readJson = (file, empty) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return empty }
}

/** The project's TypeScript, else the one installed beside the CLI, else null (the docs then show what the build knows). */
function loadTs(dir) {
  for (const from of [path.join(dir, 'package.json'), import.meta.url]) {
    try { return createRequire(from)('typescript') } catch { /* not here */ }
  }
  return null
}

function filesUnder(root) {
  if (!fs.existsSync(root)) return []
  const out = []
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name)
    if (e.isDirectory()) out.push(...filesUnder(full))
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(e.name) && !/\.(test|spec|d)\.[a-z]+$/.test(e.name)) out.push(full)
  }
  return out.sort()
}

/**
 * Everything the docs show, for the project in `dir` (built into `dir/dist`).
 * @param {string} dir
 */
export function collectDocs(dir) {
  const dist = path.join(dir, 'dist')
  const manifest = readJson(path.join(dist, 'manifest.json'), null)
  if (!manifest) throw new Error('No build to document yet: run `morgana build` (or `morgana dev`) first.')
  const pkg = readJson(path.join(dir, 'package.json'), {})
  const ts = loadTs(dir)
  const src = (sub) => filesUnder(path.join(dir, 'src', sub))
  const read = (lane, files) => files.flatMap((f) => readSource(ts, dir, f, lane))

  const server = read('server', src('actions/server'))
  const client = read('client', src('actions/client'))
  const compile = read('compile', src('actions/compile'))
  const objectSources = read('object', src('server-objects'))
  const customSources = read('custom', src('objects'))
  const frames = collectFrames(ts, dir, [...src('actions'), ...src('server-objects'), ...src('objects'), ...src('lib'), ...filesUnder(path.join(dir, 'src')).filter((f) => !/[\\/](actions|server-objects|objects|lib)[\\/]/.test(f))])

  const objects = readJson(path.join(dist, 'server', 'objects.json'), []).map((meta) => {
    const s = objectSources.find((o) => o.kind === 'object' && o.name === meta.name) ?? {}
    return {
      name: meta.name,
      camel: camel(meta.name),
      doc: s.doc ?? '',
      file: s.file ?? '',
      channel: meta.channel ?? null,
      access: meta.access ?? {},
      state: s.state?.length ? s.state : Object.entries(meta.state ?? {}).map(([name, v]) => ({ name, type: typeof v, doc: '', optional: false })),
      methods: meta.methods.map((m) => ({ name: m, ...(s.methods?.find((x) => x.name === m) ?? { doc: '', params: '' }), access: meta.access?.[m] ?? null })),
      jobs: meta.jobs.map((j) => ({ name: j, ...(s.jobs?.find((x) => x.name === j) ?? { doc: '' }) })),
      emits: frames.emits.filter((e) => e.object === meta.name).map((e) => e.event),
    }
  })

  const routes = readJson(path.join(dist, 'server', 'apis.json'), [])
  const triggers = readJson(path.join(dist, 'server', 'triggers.json'), [])
  const stores = readJson(path.join(dist, 'server', 'stores.json'), [])

  return {
    name: manifest.apps?.[0]?.displayName || pkg.name || path.basename(dir),
    version: pkg.version ?? '',
    generatedAt: new Date().toISOString(),
    overview: readmeIntro(dir),
    pages: (manifest.pages ?? []).map((p) => ({ ...p, states: pageStates(dist, p.name) })),
    apps: manifest.apps ?? [],
    vars: Object.keys(manifest.vars ?? {}),
    routes: routes.map((r) => ({ ...r, source: server.find((a) => a.name === r.action) ?? null })),
    serverActions: server.filter((a) => a.kind === 'serverAction').map((a) => ({
      ...a,
      route: routes.find((r) => r.action === a.name) ?? null,
      triggers: triggers.filter((t) => t.run === a.name).map((t) => t.event),
    })),
    clientActions: client.filter((a) => a.kind === 'clientAction'),
    compileActions: compile.filter((a) => a.kind === 'serverAction' || a.kind === 'clientAction'),
    objects,
    customObjects: (manifest.customObjects ?? []).map((c) => {
      const s = customSources.find((o) => o.kind === 'custom' && o.name === c.name) ?? {}
      return { name: c.name, camel: camel(c.name), doc: s.doc ?? '', file: s.file ?? '', props: c.defaultProps ?? {}, events: c.events ?? [] }
    }),
    stores: stores.map((s) => ({ name: s.name, columns: s.shape?.columns ?? [] })),
    triggers,
    frames: frames.frames,
    storyboard: [],
  }
}

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

/** The README's opening, up to its second heading: what the project is, in its authors' words. */
function readmeIntro(dir) {
  const file = ['README.md', 'readme.md'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f))
  if (!file) return ''
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  const out = []
  let headings = 0
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && ++headings > 1) break
    if (headings === 1 && /^#\s/.test(line)) continue
    out.push(line)
  }
  return out.join('\n').trim().slice(0, 4000)
}

/**
 * A page's states that live in the address (`?view=work`), with every value the
 * page's conditions test them for, read from the built page and stylesheet.
 */
function pageStates(dist, page) {
  const html = (() => { try { return fs.readFileSync(path.join(dist, 'pages', `${page}.html`), 'utf8') } catch { return '' } })()
  const css = (() => { try { return fs.readFileSync(path.join(dist, 'assets', 'style.css'), 'utf8') } catch { return '' } })()
  const m = html.match(/var L=(\{.*?\}),h=document/)
  const boot = m ? (() => { try { return JSON.parse(m[1]) } catch { return null } })() : null
  if (!boot) return []
  const values = {}
  for (const [, key, value] of css.matchAll(/\[data-s-([a-z0-9-]+)="([^"]*)"\]/g)) (values[key] ??= new Set()).add(value)
  return Object.entries(boot.d ?? {}).filter(([, d]) => d.address).map(([key, d]) => ({
    key,
    param: d.address,
    initial: boot.i?.[key] ?? '',
    values: [...(values[key.replace(/\./g, '-')] ?? [])],
  }))
}

// ── source ──────────────────────────────────────────────────────────────────

/** The doc comment written right above a node, without its stars. */
function docOf(ts, text, node) {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []
  const block = ranges.filter((r) => text.slice(r.pos, r.pos + 3) === '/**').pop()
  if (!block) {
    const lines = ranges.filter((r) => text.slice(r.pos, r.pos + 2) === '//').map((r) => text.slice(r.pos + 2, r.end).trim())
    return lines.join(' ').trim()
  }
  return cleanDoc(text.slice(block.pos, block.end))
}

const cleanDoc = (raw) => raw.replace(/^\/\*\*\s?/, '').replace(/\s*\*\/$/, '').split(/\r?\n/).map((l) => l.replace(/^\s*\* ?/, '')).join('\n').trim()

const literal = (ts, n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null)
const prop = (ts, obj, name) => obj?.properties?.find((p) => (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isShorthandPropertyAssignment(p)) && p.name?.getText() === name)

function strings(ts, n) {
  if (!n) return []
  const one = literal(ts, n)
  if (one != null) return [one]
  if (ts.isArrayLiteralExpression(n)) return n.elements.map((e) => literal(ts, e)).filter((s) => s != null)
  return [n.getText()]
}

/** A type's fields, when it is written out: name, type, optional, doc. */
function fieldsOf(ts, text, typeNode, sf) {
  if (!typeNode) return null
  let members = null
  if (ts.isTypeLiteralNode(typeNode)) members = typeNode.members
  else if (typeof typeNode === 'string' || ts.isTypeReferenceNode(typeNode)) {
    const name = typeof typeNode === 'string' ? typeNode : typeNode.typeName.getText()
    const decl = sf.statements.find((s) => (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name.text === name)
    if (decl && ts.isInterfaceDeclaration(decl)) members = decl.members
    else if (decl && ts.isTypeAliasDeclaration(decl) && ts.isTypeLiteralNode(decl.type)) members = decl.type.members
  }
  if (!members) return null
  return members.filter((m) => m.name).map((m) => ({
    name: m.name.getText(),
    type: m.type ? m.type.getText().replace(/\s+/g, ' ') : 'unknown',
    optional: !!m.questionToken,
    doc: docOf(ts, text, m),
  }))
}

/** One source file: its actions, or its server object, or its custom object. */
function readSource(ts, dir, file, lane) {
  const rel = path.relative(dir, file).replace(/\\/g, '/')
  if (!ts) return []
  const text = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const out = []
  const contract = sf.statements.find((s) => ts.isInterfaceDeclaration(s) && s.name.text === 'Contract')
  const contractPart = (part) => {
    const m = contract?.members.find((x) => x.name?.getText() === part)
    if (!m?.type) return null
    return { type: m.type.getText().replace(/\s+/g, ' '), fields: fieldsOf(ts, text, m.type, sf) }
  }
  const fileDoc = (() => {
    // The first doc comment in the file that isn't attached to an import: the file's own header.
    const first = sf.statements.find((s) => !ts.isImportDeclaration(s))
    const own = first ? docOf(ts, text, first) : ''
    if (own) return own
    // Or the comment that opens the file, above its imports.
    const top = sf.statements[0]
    return top && ts.isImportDeclaration(top) ? docOf(ts, text, top) : ''
  })()

  for (const st of sf.statements) {
    // export const name = defineServerAction(...) / defineClientAction(...)
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const call = d.initializer
        if (!call || !ts.isCallExpression(call)) continue
        const fn = call.expression.getText()
        if (fn !== 'defineServerAction' && fn !== 'defineClientAction') continue
        const opts = call.arguments[0]
        const config = ts.isObjectLiteralExpression(opts) ? prop(ts, opts, 'config')?.initializer : null
        const cfg = config && ts.isObjectLiteralExpression(config) ? config : null
        out.push({
          kind: fn === 'defineServerAction' ? 'serverAction' : 'clientAction',
          lane,
          name: d.name.getText(),
          file: rel,
          doc: docOf(ts, text, st) || (sf.statements.filter((s) => ts.isVariableStatement(s)).length === 1 ? fileDoc : ''),
          on: strings(ts, prop(ts, cfg, 'on')?.initializer),
          auth: literal(ts, prop(ts, cfg, 'auth')?.initializer),
          input: contractPart('input'),
          output: contractPart('output'),
        })
      }
    }
    // export default defineServerObject({...}) / createCustomObject({...})
    if (ts.isExportAssignment(st) && ts.isCallExpression(st.expression)) {
      const fn = st.expression.expression.getText()
      const opts = st.expression.arguments[0]
      if (!opts || !ts.isObjectLiteralExpression(opts)) continue
      const name = literal(ts, prop(ts, opts, 'name')?.initializer)
      const doc = docOf(ts, text, st) || fileDoc
      if (fn === 'defineServerObject') {
        const members = (key) => {
          const o = prop(ts, opts, key)?.initializer
          if (!o || !ts.isObjectLiteralExpression(o)) return []
          return o.properties.filter((p) => p.name).map((p) => {
            const f = ts.isPropertyAssignment(p) ? p.initializer : p
            const params = f && (ts.isArrowFunction(f) || ts.isFunctionExpression(f) || ts.isMethodDeclaration(f)) ? f.parameters.slice(1).map((x) => x.type?.getText().replace(/\s+/g, ' ') ?? x.name.getText()).join(', ') : ''
            return { name: p.name.getText(), doc: docOf(ts, text, p), params }
          })
        }
        const stateDecl = sf.statements.find((s) => ts.isInterfaceDeclaration(s) && s.name.text === 'State')
        out.push({
          kind: 'object', lane, name, file: rel, doc,
          methods: members('methods'), jobs: members('jobs'),
          state: stateDecl ? fieldsOf(ts, text, 'State', sf) ?? [] : [],
        })
      }
      if (fn === 'createCustomObject') out.push({ kind: 'custom', lane, name, file: rel, doc })
    }
  }
  return out
}

/**
 * The messages that travel on channels — `publish(…, { t: 'step', … })` —
 * and the events server objects emit — `self.emit('status', …)` — wherever
 * they are written.
 */
function collectFrames(ts, dir, files) {
  const frames = new Map()
  const emits = []
  if (!ts) return { frames: [], emits }
  for (const file of [...new Set(files)]) {
    const rel = path.relative(dir, file).replace(/\\/g, '/')
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const objectName = (() => {
      const def = sf.statements.find((s) => ts.isExportAssignment(s) && ts.isCallExpression(s.expression) && s.expression.expression.getText() === 'defineServerObject')
      const opts = def?.expression.arguments[0]
      return opts && ts.isObjectLiteralExpression(opts) ? literal(ts, prop(ts, opts, 'name')?.initializer) : null
    })()
    const from = rel.includes('/actions/client/') || rel.includes('/objects/') ? 'page' : 'server'
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression.getText()
        if (/(^|\.)publish$/.test(callee)) {
          for (const arg of n.arguments) {
            if (!ts.isObjectLiteralExpression(arg)) continue
            const t = literal(ts, prop(ts, arg, 't')?.initializer)
            if (!t) continue
            const key = `${from}:${t}`
            const f = frames.get(key) ?? { t, from, fields: new Set(), files: new Set() }
            for (const p of arg.properties) if (p.name && p.name.getText() !== 't') f.fields.add(p.name.getText())
            f.files.add(rel)
            frames.set(key, f)
          }
        }
        if (/(^|\.)emit$/.test(callee) && objectName && /^self\b/.test(callee)) {
          const ev = literal(ts, n.arguments[0])
          if (ev && !emits.some((e) => e.object === objectName && e.event === ev)) emits.push({ object: objectName, event: ev })
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return {
    frames: [...frames.values()].map((f) => ({ t: f.t, from: f.from, fields: [...f.fields], files: [...f.files] })).sort((a, b) => a.from.localeCompare(b.from) || a.t.localeCompare(b.t)),
    emits,
  }
}
