import { describe, it, expect } from 'vitest'
import { channelInstance, validateObjectMeta, type ObjectMeta } from '../server-host/objects'
import { metaFromDefinition } from '../objects-compile'

const base: ObjectMeta = { name: 'deck', state: {}, collections: {}, methods: ['receive', 'start'], streaming: [], jobs: [], computed: [], access: {}, hasOnCreate: false }

describe('server object channels', () => {
  it('maps a channel to the instance it belongs to', () => {
    expect(channelInstance('task-{name}', 'task-ts-abc')).toBe('ts-abc')
    expect(channelInstance('task-{name}', 'tasks-abc')).toBe(null)
    expect(channelInstance('task-{name}', 'task-')).toBe(null)
    expect(channelInstance('room:{name}:live', 'room:42:live')).toBe('42')
    expect(channelInstance('room:{name}:live', 'room:42:dead')).toBe(null)
    expect(channelInstance('no-placeholder', 'no-placeholder')).toBe(null)
  })

  it('reads `channel` from a definition into the meta', () => {
    const meta = metaFromDefinition({ name: 'deck', methods: { receive: () => {}, start: () => {} }, channel: { name: 'task-{name}', receive: 'receive' } }, 'deck.ts')
    expect(meta.channel).toEqual({ name: 'task-{name}', receive: 'receive' })
  })

  it('refuses a channel with no {name}, odd characters, or a receive that is not a method', () => {
    expect(validateObjectMeta({ ...base, channel: { name: 'task-{name}', receive: 'receive' } })).toEqual([])
    expect(validateObjectMeta({ ...base, channel: { name: 'task', receive: 'receive' } })[0]).toMatch(/must contain \{name\}/)
    expect(validateObjectMeta({ ...base, channel: { name: 'task {name}', receive: 'receive' } })[0]).toMatch(/must contain \{name\}/)
    expect(validateObjectMeta({ ...base, channel: { name: 'task-{name}', receive: 'nope' } })[0]).toMatch(/not one of its methods/)
  })
})
