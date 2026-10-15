/**
 * What the running page needs to keep itself up to date without anyone
 * touching the DOM: the declared state, which keys conditions read, the row
 * templates lists stamp in the browser, and which containers ease their
 * height when a condition changes what is inside them.
 *
 * Computed here, at build time, so the browser does no discovery: it reads
 * these tables and subscribes to exactly the paths they name.
 */
import { conditionStateKeys } from '../style/conditions'
import { renderNode } from './node'
import type { ProjectIR, StateDecl } from '../ir'

export interface LiveList {
  /** The state path whose array the list follows. */
  source: string
  /** Record field that keys a row (default: its index). */
  key?: string
  /** The template's root object. */
  template: string
  /** The template's markup, rendered once with its `*field` props unresolved. */
  html: string
  /** Per template object: the props that read a record field, as written (`*name`). */
  fields: Record<string, Record<string, string>>
}

export interface LiveTables {
  state: { decls: Record<string, StateDecl>; reflect: string[]; initial: Record<string, unknown> }
  lists: Record<string, LiveList>
  /** Container id → the state keys whose change it eases its height over. */
  morph: Record<string, string[]>
}

const FIELD = /\*[A-Za-z_$][\w$]*/

function subtree(ir: ProjectIR, root: string): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length) {
    const id = stack.pop() as string
    out.push(id)
    for (const c of ir.objects.get(id)?.children ?? []) stack.push(c)
  }
  return out
}

/** The tables for one page: `include` is every object id the page renders. */
export function liveTables(ir: ProjectIR, include: Set<string>): LiveTables {
  const reflect = new Set<string>()
  const lists: Record<string, LiveList> = {}
  const morph: Record<string, string[]> = {}

  for (const id of include) {
    const node = ir.objects.get(id)
    if (!node) continue
    for (const key of conditionStateKeys(node.props)) reflect.add(key)

    // A list following a state path, with a row template: the browser stamps it.
    const tid = node.contentTemplateId
    if (tid) for (const inner of subtree(ir, tid)) for (const key of conditionStateKeys(ir.objects.get(inner)?.props ?? {})) reflect.add(key)
    const bound = node.bindings.find((b) => (b.prop === '*' || b.prop === 'data') && typeof b.source === 'string')
    if (tid && bound && ir.objects.has(tid)) {
      const fields: Record<string, Record<string, string>> = {}
      for (const oid of subtree(ir, tid)) {
        const props = ir.objects.get(oid)?.props ?? {}
        for (const [prop, value] of Object.entries(props)) {
          if (typeof value === 'string' && FIELD.test(value)) (fields[oid] ??= {})[prop] = value
        }
      }
      lists[id] = {
        source: bound.source,
        ...(bound.shape?.key ? { key: bound.shape.key } : {}),
        template: tid,
        html: renderNode(ir, tid),
        fields,
      }
    }
  }

  // A container that eases its height does so when a key its insides read changes.
  for (const id of include) {
    const node = ir.objects.get(id)
    if (!node || node.props['easesHeight'] !== true) continue
    const keys = new Set<string>()
    for (const inner of subtree(ir, id)) {
      if (inner === id) continue
      for (const key of conditionStateKeys(ir.objects.get(inner)?.props ?? {})) keys.add(key)
    }
    morph[id] = [...keys]
  }

  // Only what a condition reads is reflected: a key nothing styles on (the
  // brief you're typing) never touches <html>. The colour mode is the one
  // exception — it lands on <body data-mode> before paint, styled or not.
  if (ir.stateDecls.has('theme.mode')) reflect.add('theme.mode')

  const initial: Record<string, unknown> = {}
  for (const key of reflect) {
    const v = key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], ir.stateDefaults)
    if (v !== undefined) initial[key] = v
  }
  return { state: { decls: Object.fromEntries(ir.stateDecls), reflect: [...reflect], initial }, lists, morph }
}

/**
 * The first thing in <body>: put every reflected state key on <html> (and the
 * colour mode on <body>) before anything paints, from the address, what was
 * kept, or the declared start — the same order the runtime restores in. A
 * reload on `?view=work` never flashes the first screen.
 */
export function prePaintScript(page: string, tables: LiveTables): string {
  const { reflect, initial, decls } = tables.state
  if (!reflect.length) return ''
  const data = JSON.stringify({ p: page, r: reflect, i: initial, d: decls }).replace(/</g, '\u003c')
  return (
    '<script>(function(){try{' +
    `var L=${data},h=document.documentElement,q=new URLSearchParams(location.search);` +
    'for(var n=0;n<L.r.length;n++){var k=L.r[n],v=L.i[k],d=L.d[k];' +
    'if(d){if(d.keep){try{var s=(d.keep==="device"?localStorage:sessionStorage).getItem("morgana:"+L.p+":"+k);if(s!==null)v=JSON.parse(s);}catch(e){}}' +
    'if(d.address&&q.has(d.address)){var a=q.get(d.address);v=typeof L.i[k]==="boolean"?a==="true":typeof L.i[k]==="number"?Number(a):a;}}' +
    'if(v===undefined||v===null)continue;' +
    'h.setAttribute("data-s-"+k.replace(/[^a-zA-Z0-9-]/g,"-"),String(v));' +
    'if(k==="theme.mode"&&(v==="light"||v==="dark"||v==="system"))document.body.setAttribute("data-mode",v);}' +
    '}catch(e){}})();</script>'
  )
}
