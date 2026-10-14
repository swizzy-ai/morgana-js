import { describe, expect, it } from 'vitest'
import { defineServerObject, type ObjectInstance } from '../index'

const room = defineServerObject({
  name: 'chat-room',
  state: { title: '', count: 0 },
  collections: { messages: { columns: [{ name: 'text', type: 'string' }] } },
  computed: { label: (s) => `${s.title} (${s.count})` },
  access: { read: 'public', post: 'member' },
  methods: {
    post: async (self, p: { text: string }) => {
      const msg = self.db.messages.add({ text: p.text })
      self.set({ count: self.state.count + 1 })
      return msg
    },
    reset: async (self) => {
      self.set({ count: 0 })
      return true
    },
  },
  streams: {
    tokens: async function* (self, p: { n: number }) {
      for (let i = 0; i < p.n; i++) yield `t${i}`
    },
  },
})

describe('server object types', () => {
  it('infers proxy method params, results, streams and state', () => {
    type R = ObjectInstance<typeof room>
    // Compile-time: these must type-check (and the @ts-expect-error lines must not).
    const use = async (r: R) => {
      const m = await r.post({ text: 'hi' })
      const id: string = m.id
      const ok: boolean = await r.reset()
      for await (const t of r.tokens({ n: 2 })) {
        const s: string = t
        void s
      }
      const st = await r.state()
      const label: string = st.label
      const count: number = st.count
      // @ts-expect-error — wrong param shape
      await r.post({ txt: 'x' })
      void [id, ok, label, count]
    }
    expect(typeof use).toBe('function')
    expect(room.name).toBe('chat-room')
  })
})
