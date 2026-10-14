/**
 * `on: 'object:<type>[/<name>].<event>'` — how an object selector leaves
 * `deriveRoutes`.
 *
 * A server action becomes a durable trigger the instance delivers; a client
 * action becomes a page binding on one live instance. A selector that names
 * nothing real is a build error, not a trigger that silently never fires.
 */
import { describe, expect, it } from 'vitest'
import { deriveRoutes, EMITTABLE } from '../routes'
import type { BindingGraph } from '../bindings'
import type { SdkActionMeta } from '../extract'
import type { ObjectMeta } from '../server-host'

const GRAPH: BindingGraph = {
  objectIds: new Set(),
  children: new Map(),
  componentNames: new Set(),
  componentEvents: new Set(),
  componentOf: new Map(),
  emittable: EMITTABLE,
}

const CHAT_ROOM: ObjectMeta = {
  name: 'chat-room',
  state: { count: 0 },
  collections: { messages: { columns: [{ name: 'text', type: 'string' }] } },
  methods: ['post'],
  streaming: [],
  jobs: [],
  computed: [],
  access: {},
  hasOnCreate: false,
}

function action(name: string, lane: 'client' | 'server', on: string[]): SdkActionMeta {
  return { name, file: `${name}.ts`, lane, factory: lane, on, enabled: true, handlerSrc: '() => {}', handlerAsync: false }
}

function run(actions: SdkActionMeta[], objects: ObjectMeta[] = [CHAT_ROOM]) {
  const errors: string[] = []
  const objectErrors: string[] = []
  const out = deriveRoutes(actions, [], GRAPH, errors, { objects, errors: objectErrors })
  return { ...out, errors, objectErrors }
}

describe('object selectors: server action → durable trigger', () => {
  it('a type-wide record event becomes a trigger the instance delivers', () => {
    const { triggers, bindings, objectErrors } = run([action('onMessage', 'server', ['object:chat-room.messages.added'])])
    expect(objectErrors).toEqual([])
    expect(bindings).toEqual([])
    expect(triggers).toEqual([
      { name: 'onMessage:object:chat-room.messages.added', event: 'object:chat-room.messages.added', run: 'onMessage', when: undefined, enabled: true },
    ])
  })

  it('carries `when` and `enabled` onto the trigger', () => {
    const a = { ...action('onMessage', 'server', ['object:chat-room.messages.added']), when: { text: 'x' } }
    const { triggers } = run([a])
    expect(triggers[0]).toMatchObject({ run: 'onMessage', when: { text: 'x' } })
  })

  it('a lifecycle event is a valid selector', () => {
    const { triggers, objectErrors } = run([action('onCreated', 'server', ['object:chat-room.created'])])
    expect(objectErrors).toEqual([])
    expect(triggers[0]).toMatchObject({ event: 'object:chat-room.created', run: 'onCreated' })
  })

  it('a per-instance selector is still a trigger for server actions', () => {
    const { triggers, bindings } = run([action('onLobby', 'server', ['object:chat-room/lobby.messages.added'])])
    expect(bindings).toEqual([])
    expect(triggers[0]).toMatchObject({ event: 'object:chat-room/lobby.messages.added' })
  })
})

describe('object selectors: client action → one live binding', () => {
  it('a client action on a named instance binds on the page, not the server', () => {
    const { triggers, bindings, objectErrors } = run([action('roomFeed', 'client', ['object:chat-room/lobby.messages.added'])])
    expect(objectErrors).toEqual([])
    expect(triggers).toEqual([])
    expect(bindings).toEqual([{ event: 'object:chat-room/lobby.messages.added', action: 'roomFeed' }])
  })

  it('a client action must name the instance it listens to', () => {
    const { bindings, triggers, objectErrors } = run([action('roomFeed', 'client', ['object:chat-room.messages.added'])])
    expect(bindings).toEqual([])
    expect(triggers).toEqual([])
    expect(objectErrors[0]).toContain('listens to one instance')
    expect(objectErrors[0]).toContain('object:chat-room/<name>.messages.added')
  })
})

describe('object selectors that name nothing real are build errors', () => {
  it('an unknown object type', () => {
    const { triggers, objectErrors } = run([action('onX', 'server', ['object:nope.messages.added'])])
    expect(triggers).toEqual([])
    expect(objectErrors[0]).toContain('there is no server object "nope"')
    expect(objectErrors[0]).toContain('chat-room') // names what does exist
  })

  it('a collection event that cannot fire', () => {
    const { triggers, objectErrors } = run([action('onX', 'server', ['object:chat-room.messages.shouted'])])
    expect(triggers).toEqual([])
    expect(objectErrors[0]).toContain('messages.added, messages.updated or messages.removed')
  })

  it('a collection the object does not have', () => {
    const { objectErrors } = run([action('onX', 'server', ['object:chat-room.notes.added'])])
    expect(objectErrors[0]).toContain('no collection "notes"')
  })

  it('the error names the action, so it points at the file', () => {
    const { objectErrors } = run([action('checkout', 'server', ['object:nope.created'])])
    expect(objectErrors[0]).toContain('checkout')
  })

  it('a malformed selector', () => {
    const { objectErrors } = run([action('onX', 'server', ['object:chat-room'])])
    expect(objectErrors[0]).toContain('write object:<type>.<event>')
  })

  it('with no objects compiled at all, every object selector is an error', () => {
    const { triggers, objectErrors } = run([action('onX', 'server', ['object:chat-room.messages.added'])], [])
    expect(triggers).toEqual([])
    expect(objectErrors[0]).toContain('there is no server object "chat-room"')
  })
})

describe('object selectors dedupe and disable cleanly', () => {
  it('the same action/selector pair is not added twice', () => {
    const { triggers } = run([action('onMessage', 'server', ['object:chat-room.messages.added', 'object:chat-room.messages.added'])])
    expect(triggers).toHaveLength(1)
  })

  it('a disabled action is skipped before selectors are checked', () => {
    const a = { ...action('onMessage', 'server', ['object:nope.messages.added']), enabled: false }
    const { triggers, objectErrors } = run([a])
    expect(triggers).toEqual([])
    expect(objectErrors).toEqual([])
  })
})
