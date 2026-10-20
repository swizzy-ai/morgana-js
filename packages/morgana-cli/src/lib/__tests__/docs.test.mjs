// `morgana docs`: what it reads from a project's build and source, and the site it writes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectDocs } from '../docs-model.mjs'
import { framesOf } from '../docs-shots.mjs'
import { renderDocs } from '../docs-site.mjs'

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-docs-'))
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) }
  put('package.json', JSON.stringify({ name: 'notes', version: '1.2.0' }))
  put('README.md', '# Notes\n\nA place to keep notes.\n\n## Commands\n\nignored')
  put('dist/manifest.json', JSON.stringify({
    pages: [{ name: 'home', address: '/', app: 'main', render: 'static' }],
    apps: [{ name: 'main', displayName: 'Notes', pages: ['home'] }],
    vars: { siteName: 'Notes' },
    customObjects: [{ name: 'note-card', defaultProps: { title: '' }, events: [] }],
  }))
  put('dist/pages/home.html', '<script>(function(){try{var L={"p":"home","r":["view"],"i":{"view":"list"},"d":{"view":{"address":"view"}}},h=document.documentElement;}catch(e){}})();</script>')
  put('dist/assets/style.css', '[data-s-view="list"] .a{} [data-s-view="edit"] .b{}')
  put('dist/server/apis.json', JSON.stringify([{ path: '/v1/notes', method: 'GET', action: 'listNotes', auth: 'public' }]))
  put('dist/server/triggers.json', JSON.stringify([{ name: 'tidy', event: 'object:notebook.saved', run: 'tidyNotes', enabled: true }]))
  put('dist/server/stores.json', JSON.stringify([{ name: 'notes', shape: { columns: [{ name: 'text', type: 'string' }] } }]))
  put('dist/server/objects.json', JSON.stringify([{ name: 'notebook', state: { count: 0 }, methods: ['save'], jobs: [], access: { subscribe: 'member' }, channel: { name: 'book-{name}', receive: 'save' } }]))
  put('src/actions/server/save-note.ts', `import { defineServerAction } from '@studiomorgana/sdk'
export interface Contract {
  input: {
    /** The note's words. */
    text: string
    pinned?: boolean
  }
  output: { id: string }
}
/** Save a note and tell the notebook. */
export const saveNote = defineServerAction({
  handler: async (ctx) => ({ id: '1' }),
})
`)
  put('src/actions/server/list-notes.ts', `import { defineServerAction } from '@studiomorgana/sdk'
/** Every note, newest first. */
export const listNotes = defineServerAction({ config: { on: 'http.get /v1/notes', auth: 'public' }, handler: async () => [] })
`)
  put('src/actions/client/home.ts', `import { defineClientAction } from '@studiomorgana/sdk'
/** Open the editor. */
export const openEditor = defineClientAction({ config: { on: ['new.clicked', 'key:Mod+N'] }, handler: (ctx) => { ctx.events.publish('book-1', { t: 'hello' }) } })
`)
  put('src/server-objects/notebook.ts', `import { defineServerObject } from '@studiomorgana/sdk'
interface State {
  /** How many notes. */
  count: number
}
/** One notebook per person. */
export default defineServerObject({
  name: 'notebook',
  state: { count: 0 },
  methods: {
    /** Add one note. */
    save: async (self, p: { text: string }) => { self.set({ count: self.state.count + 1 }); self.emit('saved', {}); await self.ctx.events.publish('book-1', { t: 'saved', count: 1 }) },
  },
})
`)
  return dir
}

describe('morgana docs', () => {
  it('reads contracts, doc comments, events and frames', () => {
    const m = collectDocs(project())
    expect(m.name).toBe('Notes')
    expect(m.overview).toBe('A place to keep notes.')
    const save = m.serverActions.find((a) => a.name === 'saveNote')
    expect(save.doc).toBe('Save a note and tell the notebook.')
    expect(save.input.fields).toEqual([
      { name: 'text', type: 'string', optional: false, doc: "The note's words." },
      { name: 'pinned', type: 'boolean', optional: true, doc: '' },
    ])
    expect(m.serverActions.find((a) => a.name === 'listNotes').route.path).toBe('/v1/notes')
    expect(m.clientActions[0].on).toEqual(['new.clicked', 'key:Mod+N'])
    const book = m.objects[0]
    expect(book.doc).toBe('One notebook per person.')
    expect(book.methods[0]).toMatchObject({ name: 'save', doc: 'Add one note.', params: '{ text: string }' })
    expect(book.state).toEqual([{ name: 'count', type: 'number', optional: false, doc: 'How many notes.' }])
    expect(book.emits).toEqual(['saved'])
    expect(m.frames.map((f) => `${f.from}:${f.t}`)).toEqual(['page:hello', 'server:saved'])
    expect(m.pages[0].states).toEqual([{ key: 'view', param: 'view', initial: 'list', values: ['list', 'edit'] }])
  })

  it('makes one storyboard frame per screen, plus the project’s own', () => {
    const m = collectDocs(project())
    const frames = framesOf(m, [{ title: 'Editing a long note', state: { view: 'edit', text: '…' } }])
    expect(frames.map((f) => [f.title, f.state])).toEqual([
      ['List', { view: 'list' }],
      ['Edit', { view: 'edit' }],
      ['Editing a long note', { view: 'edit', text: '…' }],
    ])
    expect(frames[0].id).toBe('01-home-list')
  })

  it('writes one page with the three columns and every entry', () => {
    const m = collectDocs(project())
    m.storyboard = framesOf(m)
    const html = renderDocs(m)
    for (const part of ['class="side"', 'class="toc"', 'id="api/saveNote"', 'id="objects/notebook"', 'id="data-notes"', 'new.clicked', 'object:notebook.saved', '/v1/notes']) {
      expect(html).toContain(part)
    }
    expect(html).toContain("ctx.actions.run('saveNote', { text: '…' })")
  })
})
