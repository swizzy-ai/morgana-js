import { describe, it, expect } from 'vitest'
import { makeObjectsApi, OBJECTS_API_SRC, type ObjectsTransport } from '../objects-api'
import { validateObjectMeta } from '../server-host/objects'

const metas = {
  deck: { name: 'deck', methods: ['start'], streaming: [] },
  adStream: { name: 'ad-stream', methods: ['stop'], streaming: [] },
}

function fakeTransport() {
  const created: string[] = []
  const calls: string[] = []
  const t: ObjectsTransport = {
    create: async (type, name) => void created.push(`${type}/${name}`),
    read: async () => null,
    call: async (type, name, method) => (calls.push(`${type}/${name}.${method}`), 'ok'),
    stream: async () => null,
    list: async () => ({ items: [], total: 0 }),
    remove: async () => true,
  }
  return { t, created, calls }
}

describe('ctx.objects by type', () => {
  it('get(type) is the type; get(type, id) is the instance; create(type, id) makes one', async () => {
    const { t, created, calls } = fakeTransport()
    const api = makeObjectsApi(metas, t) as any
    expect(api.get('deck')).toBe(api.deck)
    const inst = await api.create('deck', 'ts-1', { brief: 'x' })
    expect(created).toEqual(['deck/ts-1'])
    expect(inst.name).toBe('ts-1')
    await api.get('deck', 'ts-1').start({})
    expect(calls).toEqual(['deck/ts-1.start'])
  })

  it('takes the key or the type name, and refuses an unknown type', async () => {
    const { t, calls } = fakeTransport()
    const api = makeObjectsApi(metas, t) as any
    expect(api.get('ad-stream')).toBe(api.adStream)
    await api.get('adStream', 's').stop()
    expect(calls).toEqual(['ad-stream/s.stop'])
    expect(api.has('ad-stream')).toBe(true)
    expect(api.has('nope')).toBe(false)
    expect(() => api.get('nope')).toThrow(/no server object "nope"/)
    expect(() => api.create('nope', 'x')).toThrow(/no server object "nope"/)
  })

  it('works from the sandbox source too', () => {
    const { t } = fakeTransport()
    const build = new Function(`${OBJECTS_API_SRC}\nreturn __mgObjectsApi`)() as typeof makeObjectsApi
    const api = build(metas, t) as any
    expect(api.get('ad-stream', 's').type).toBe('ad-stream')
  })

  it('reserves get, create and has as object names', () => {
    const meta = { name: 'get', state: {}, collections: {}, methods: [], streaming: [], jobs: [], computed: [], access: {}, hasOnCreate: false }
    expect(validateObjectMeta(meta).join()).toMatch(/reserved/)
  })
})
