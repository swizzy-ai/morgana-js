/**
 * `morgana spec` — the API surface, generated from the SDK itself.
 *
 * Reference material is never written into the docs by hand: it is read here,
 * from the installed SDK's own source (types and their doc comments), so it is
 * exact for the version a project actually has. The docs explain; this lists.
 *
 * The one hand-written part is the `on` grammar in `events`, because it is the
 * compiler's grammar rather than a type. Every pattern in it is checked against
 * the compiler in `spec.test.ts`, so it cannot drift either.
 */
import path from 'node:path'
import ts from 'typescript'
import { INTERACTION_EVENTS } from '@studiomorgana/sdk'

import { resolveSdkEntry } from './bundle'
import { EMITTABLE } from './routes'

export interface SpecMember {
  name: string
  optional: boolean
  type: string
  doc: string
  /** Rendered as name(params): result rather than name: type. */
  method?: boolean
}

export interface SpecSection {
  /** The SDK type this section is generated from, or a heading for a hand-made one. */
  title: string
  doc: string
  /** For a type alias with no members — a union of tokens, say. */
  alias?: string
  members: SpecMember[]
}

export interface SpecDoc {
  topic: string
  summary: string
  sections: SpecSection[]
  /** Rows of a grammar table: [pattern, meaning]. */
  grammar?: Array<[string, string]>
  see?: string[]
}

// ── reading the SDK ─────────────────────────────────────────────────────────

let cached: { program: ts.Program; checker: ts.TypeChecker; decls: Map<string, ts.Declaration> } | null = null

function sdk() {
  if (cached) return cached
  const entry = resolveSdkEntry()
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  })
  const srcDir = path.dirname(entry)
  const decls = new Map<string, ts.Declaration>()
  for (const sf of program.getSourceFiles()) {
    if (!path.resolve(sf.fileName).startsWith(path.resolve(srcDir)) || sf.fileName.includes('__tests__')) continue
    for (const st of sf.statements) {
      if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && !decls.has(st.name.text)) {
        decls.set(st.name.text, st)
      }
    }
  }
  cached = { program, checker: program.getTypeChecker(), decls }
  return cached
}

const firstParagraph = (s: string) => s.split(/\n\s*\n/)[0]!.replace(/\s*\n\s*/g, ' ').trim()
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

function docOf(node: ts.Node, checker: ts.TypeChecker): string {
  const name = (node as ts.NamedDeclaration).name
  const sym = name ? checker.getSymbolAtLocation(name) : undefined
  return sym ? firstParagraph(ts.displayPartsToString(sym.getDocumentationComment(checker))) : ''
}

/** One SDK type as a section: its members, with types and the first paragraph of each doc. */
export function describeType(name: string): SpecSection {
  const { checker, decls } = sdk()
  const decl = decls.get(name)
  if (!decl) throw new Error(`the SDK has no type named ${name}`)
  const doc = docOf(decl, checker)
  const type = checker.getTypeAtLocation((decl as ts.InterfaceDeclaration).name)
  const props = checker.getPropertiesOfType(type)

  if (!props.length || (ts.isTypeAliasDeclaration(decl) && type.isUnion())) {
    const text = ts.isTypeAliasDeclaration(decl) ? decl.type.getText() : checker.typeToString(type)
    return { title: name, doc, alias: oneLine(text), members: [] }
  }

  return { title: name, doc, members: membersOf(props, '') }
}

/**
 * Members as rows. A member whose declared type is an inline object literal
 * (`response: { status(…); stream(…) }`) is expanded one level into
 * `response.status(…)` rows, so its own docs survive instead of being printed
 * as raw source.
 */
function membersOf(props: ts.Symbol[], prefix: string): SpecMember[] {
  const { checker } = sdk()
  const out: SpecMember[] = []
  for (const p of props) {
    if (p.name.startsWith('__')) continue
    const d = p.valueDeclaration ?? p.declarations?.[0]
    const doc = firstParagraph(ts.displayPartsToString(p.getDocumentationComment(checker)))
    const optional = (p.flags & ts.SymbolFlags.Optional) !== 0
    const method = !!d && (ts.isMethodSignature(d) || ts.isMethodDeclaration(d))

    if (!prefix && d && ts.isPropertySignature(d) && d.type && ts.isTypeLiteralNode(d.type)) {
      if (doc) out.push({ name: prefix + p.name, optional, type: '{ … }', doc })
      out.push(...membersOf(checker.getPropertiesOfType(checker.getTypeAtLocation(d.type)), `${p.name}.`))
      continue
    }

    let text: string
    if (method) {
      const sigs = checker.getTypeOfSymbolAtLocation(p, d!).getCallSignatures()
      text = sigs.map((s) => checker.signatureToString(s, undefined, ts.TypeFormatFlags.NoTruncation)).join('  |  ')
    } else if (d && (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) && d.type) {
      text = d.type.getText()
    } else {
      text = checker.typeToString(checker.getTypeOfSymbol(p), undefined, ts.TypeFormatFlags.NoTruncation)
    }
    out.push({ name: prefix + p.name, optional, type: oneLine(text), method, doc })
  }
  return out
}

/** Names of every built-in UI kind: the members of `UiApi` that create an object. */
export function uiKinds(): string[] {
  return describeType('UiApi')
    .members.filter((m) => /^Creatable</.test(m.type))
    .map((m) => m.name)
}

// ── the `on` grammar ───────────────────────────────────────────────────────

/** Every pattern here is asserted to parse by spec.test.ts. */
export const ON_GRAMMAR: Array<[string, string, string]> = [
  // [pattern, a concrete example the compiler must accept, meaning]
  ['compile', 'compile', 'Build time, in Node. Creates pages, apps and objects.'],
  ['<event>', 'clicked', 'Browser: any object on the page emitting it.'],
  ['<objectId>.<event>', 'save.clicked', 'Browser: that object only.'],
  ['<objectId>.<prop>.changed', 'title.content.changed', 'Browser: one prop of one object changed.'],
  ['state:<path>', 'state:hero.open', 'Browser: a state value changed.'],
  ['http.<method> /path/:param', 'http.get /orders/:id', 'Server: an HTTP route. Params, query and JSON body arrive in ctx.args. Not under /api/, /assets/, /pages/, /apps/ or at / (the host owns those).'],
  ['cron(<expression>)', 'cron(*/5 * * * *)', 'Server: on a schedule.'],
  ['store.<collection>.created|updated|deleted', 'store.orders.created', 'Server: a collection record changed.'],
  ['channel:<name>', 'channel:ops', 'Server: a message was published to the channel.'],
  ['action:<name>:completed', 'action:checkout:completed', 'Server: another action finished.'],
  ['object:<type>.<event>', 'object:chat-room.message', 'Server: any instance of a server object emitted the event.'],
  ['object:<type>/<name>.<event>', 'object:chat-room/lobby.message', 'Browser or server: one named instance.'],
]

function eventsDoc(): SpecDoc {
  const browser = [...new Set<string>([...INTERACTION_EVENTS, ...EMITTABLE])].sort()
  return {
    topic: 'events',
    summary:
      'An action runs when its `config.on` matches. One action may list several. ' +
      'Short DOM names are accepted too: click → clicked, change/input → changed, submit → submitted, load → loaded.',
    grammar: ON_GRAMMAR.map(([p, , m]) => [p, m]),
    sections: [
      { title: 'Browser events', doc: 'What the page runtime dispatches. Anything else in a browser selector is a build error.', alias: browser.join(', '), members: [] },
      describeType('ActionConfig'),
    ],
    see: ['morgana spec ui <kind> — the events each object emits are on its handle', 'morgana spec server-object'],
  }
}

// ── topics ─────────────────────────────────────────────────────────────────

const pascal = (s: string) => s.replace(/(^|-)([a-z0-9])/g, (_m, _d, c: string) => c.toUpperCase())

type Topic = { summary: string; types: string[]; see?: string[] }

const TOPICS: Record<string, Topic> = {
  ctx: {
    summary: 'The context every action receives. `morgana spec ctx client|server` for one lane.',
    types: ['BaseContext'],
    see: ['morgana spec ctx client', 'morgana spec ctx server', 'morgana spec server'],
  },
  'ctx client': { summary: 'Browser and compile actions (`defineClientAction`).', types: ['ClientContext'] },
  'ctx compile': { summary: 'Compile actions are client actions with `on: "compile"`; creation (`ctx.ui.<kind>(…)`, `ctx.apps`, `ctx.ui.pages.create`) happens here.', types: ['ClientContext'] },
  'ctx server': { summary: 'Server actions (`defineServerAction`).', types: ['ServerContext'] },
  server: {
    summary: '`ctx.server` — requests, responses, collections, files, email, queue. Plus `ctx.ui` on the server, for server-rendered pages.',
    types: ['ServerApi', 'ServerRequest', 'ServerResponseInput', 'ServerUiApi'],
  },
  'server-object': {
    summary: 'Durable named instances with state, tables, methods, streams and jobs. Define in src/server-objects/<name>.ts with defineServerObject; reach as ctx.objects.<camelName> from server and browser.',
    types: ['ServerObjectSpec', 'ObjectAccessRule', 'ObjectSelf', 'ObjectTaskSelf', 'ObjectTable', 'ObjectQuery', 'ObjectType'],
    see: ['morgana spec events — object:<type>.<event> triggers'],
  },
  'custom-object': {
    summary: 'Your own UI kinds: one file in src/objects/, default-exporting createCustomObject. Becomes ctx.ui.<camelName> (typed by `morgana types`).',
    types: ['CustomObjectDefinition', 'CustomObjectDefineContext', 'CustomObjectClientContext'],
  },
  apps: { summary: 'Several apps in one project — each with its own pages, address and auth.', types: ['AppsHandle', 'AppHandle', 'CreateAppOptions'] },
  pages: { summary: 'Pages: create in compile actions, navigate and read in the browser.', types: ['PagesApi', 'PageProps', 'PageHandle'] },
  ui: { summary: 'Every built-in kind. `morgana spec ui <kind>` for its props and handle; `morgana spec ui handle` for what every handle has.', types: [] },
  'ui handle': { summary: 'Methods on every object handle.', types: ['ObjectHandle'] },
  config: { summary: 'morgana.config.ts', types: ['MorganaConfig'] },
  types: { summary: 'Typed contracts between actions. Export `Contract` from an action file; `morgana types` does the rest.', types: ['ActionContract'] },
}

/** Every topic, with its one-line summary. */
export function specTopics(): Array<{ topic: string; summary: string }> {
  return [
    ...Object.entries(TOPICS).map(([topic, t]) => ({ topic, summary: t.summary })),
    { topic: 'ui <kind>', summary: 'Props and handle of one kind, e.g. `ui button`.' },
    { topic: 'events', summary: 'Every `on` selector: browser events, HTTP routes, cron, store, channel, object triggers.' },
  ]
}

/** Build one topic. `topic` is the words after `morgana spec`, joined by a space. */
export function buildSpec(topic: string): SpecDoc {
  const t = topic.trim().toLowerCase().replace(/\s+/g, ' ')
  if (t === 'events') return eventsDoc()

  if (t === 'ui') {
    const ui = describeType('UiApi')
    return { topic: t, summary: TOPICS.ui!.summary, sections: [{ ...ui, members: ui.members.filter((m) => /^Creatable</.test(m.type)).map((m) => ({ ...m, type: '' })) }] }
  }
  const kind = /^ui ([\w-]+)$/.exec(t)?.[1]
  if (kind && kind !== 'handle') {
    const { decls } = sdk()
    const base = pascal(kind)
    const types = [`${base}Props`, `${base}Handle`].filter((n) => decls.has(n))
    if (!types.length) throw new Error(`no built-in kind "${kind}" — run \`morgana spec ui\` for the list`)
    return { topic: t, summary: `ctx.ui.${kind}(props) creates one (compile lane); ctx.ui.get(id) finds one (any lane).`, sections: types.map(describeType) }
  }

  const def = TOPICS[t]
  if (!def) throw new Error(`no spec topic "${topic}" — run \`morgana spec\` for the list`)
  return { topic: t, summary: def.summary, sections: def.types.map(describeType), see: def.see }
}

// ── rendering ──────────────────────────────────────────────────────────────

/** Plain text for a terminal or an agent's context. Markdown-ish, no colour. */
export function renderSpec(doc: SpecDoc): string {
  const out: string[] = [`# morgana spec ${doc.topic}`, '', doc.summary, '']
  if (doc.grammar) {
    const w = Math.max(...doc.grammar.map(([p]) => p.length))
    out.push('## on', '')
    for (const [p, m] of doc.grammar) out.push(`  ${p.padEnd(w)}  ${m}`)
    out.push('')
  }
  for (const s of doc.sections) {
    out.push(`## ${s.title}`, '')
    if (s.doc) out.push(s.doc, '')
    if (s.alias) out.push(`  ${s.alias}`, '')
    for (const m of s.members) {
      const head = m.method ? `  ${m.name}${m.type}` : `  ${m.name}${m.optional ? '?' : ''}${m.type ? `: ${m.type}` : ''}`
      out.push(head)
      if (m.doc) out.push(`      ${m.doc}`)
    }
    if (s.members.length) out.push('')
  }
  if (doc.see?.length) out.push('see also:', ...doc.see.map((s) => `  ${s}`), '')
  return out.join('\n')
}

/** For `--save`: the whole reference in one file an agent can read. */
export function renderAllSpecs(): string {
  const topics = [...Object.keys(TOPICS), 'events']
  return topics.map((t) => renderSpec(buildSpec(t))).join('\n---\n\n')
}
