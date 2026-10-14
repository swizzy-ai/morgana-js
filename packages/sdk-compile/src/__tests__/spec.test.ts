/**
 * `morgana spec` is generated from the SDK — these check it stays truthful:
 * every topic builds, the types it names exist, and every `on` pattern it
 * documents is one the compiler actually accepts.
 */
import { describe, expect, it } from 'vitest'

import { classifyOn, reservedPath } from '../routes'
import { buildSpec, ON_GRAMMAR, renderAllSpecs, specTopics, uiKinds } from '../spec'

describe('morgana spec', () => {
  it('builds every listed topic', () => {
    for (const { topic } of specTopics()) {
      const t = topic === 'ui <kind>' ? 'ui button' : topic
      const doc = buildSpec(t)
      expect(doc.sections.length, t).toBeGreaterThan(0)
    }
    expect(renderAllSpecs().length).toBeGreaterThan(5000)
  })

  it('reads members and their docs from the SDK source', () => {
    const so = buildSpec('server-object').sections.find((s) => s.title === 'ServerObjectSpec')!
    const methods = so.members.find((m) => m.name === 'methods')!
    expect(methods.optional).toBe(true)
    expect(methods.doc).toMatch(/Transactions/)
    const self = buildSpec('server-object').sections.find((s) => s.title === 'ObjectSelf')!
    // inherited members come through too
    expect(self.members.map((m) => m.name)).toEqual(expect.arrayContaining(['set', 'schedule', 'defer', 'state', 'emit', 'db']))
  })

  it('covers the HTTP surface: request, responses and server rendering', () => {
    const titles = buildSpec('server').sections.map((s) => s.title)
    expect(titles).toEqual(['ServerApi', 'ServerRequest', 'ServerResponseInput', 'ServerUiApi'])
    const api = buildSpec('server').sections[0]!.members.map((m) => m.name)
    expect(api).toEqual(expect.arrayContaining(['request', 'respond', 'response', 'collections']))
  })

  it('lists ui kinds and describes one', () => {
    expect(uiKinds()).toEqual(expect.arrayContaining(['box', 'text', 'button', 'table']))
    const button = buildSpec('ui button')
    expect(button.sections.map((s) => s.title)).toEqual(['ButtonProps', 'ButtonHandle'])
    expect(() => buildSpec('ui nope')).toThrow(/no built-in kind/)
  })

  it('refuses routes the host owns', () => {
    for (const p of ['/', '/api/cards', '/api', '/assets/x.js', '/pages/home', '/apps/a']) expect(reservedPath(p), p).not.toBeNull()
    for (const p of ['/v1/cards', '/cards/:id', '/hooks/test', '/apiary']) expect(reservedPath(p), p).toBeNull()
  })

  it.each(ON_GRAMMAR)('the compiler accepts %s', (_pattern, example, meaning) => {
    const kind = classifyOn(example)
    expect(kind).not.toBe('unknown')
    if (meaning.startsWith('Server')) expect(['http', 'cron', 'backend', 'object']).toContain(kind)
    if (meaning.startsWith('Browser:')) expect(kind).toBe('browser')
  })
})
