import { defineServerObject } from '@morgana/sdk'

/**
 * A chat room: durable state, its own message table, a streaming "AI" method,
 * a scheduled reminder and a background job — every server-object feature the
 * e2e suite checks, on both hosts.
 */
export default defineServerObject({
  name: 'chat-room',
  state: { title: '', count: 0, closed: false, reminders: 0, summaries: 0 },
  collections: {
    messages: { columns: [{ name: 'text', type: 'string' }, { name: 'user', type: 'string' }] },
  },
  computed: {
    label: (s) => `${s.title} (${s.count})`,
  },
  access: {
    create: 'public',
    read: 'public',
    subscribe: 'public',
    list: 'public',
    post: 'member',
    history: 'public',
    answer: 'public',
    bump: 'public',
    close: { role: 'admin' },
  },
  onCreate: async (self, init) => {
    self.emit('created', { title: init.title ?? '' })
  },
  methods: {
    post: async (self, p: { text: string }) => {
      if (self.state.closed) throw new Error('room is closed')
      const msg = self.db.messages.add({ text: p.text, user: self.caller?.email ?? 'server' })
      self.set({ count: self.state.count + 1 })
      self.emit('message', msg)
      return msg
    },
    history: async (self, p: { limit?: number } = {}) => {
      return self.db.messages.query({ sort: { field: 'createdAt', dir: 'asc' }, limit: p.limit ?? 50 }).items
    },
    /** Concurrency probe: read, yield the event loop, write. */
    bump: async (self) => {
      const before = self.state.count
      await new Promise((r) => setTimeout(r, 2))
      self.set({ count: before + 1 })
      return before + 1
    },
    /** Streams an answer word by word, then saves it as one message. */
    answer: async function* (self, p: { prompt: string }) {
      const words = `you asked: ${p.prompt}`.split(' ')
      for (const w of words) {
        await new Promise((r) => setTimeout(r, 150))
        yield `${w} `
      }
      const msg = self.db.messages.add({ text: words.join(' '), user: 'ai' })
      self.set({ count: self.state.count + 1 })
      self.emit('message', msg)
      return { saved: msg.id }
    },
    close: async (self) => {
      self.set({ closed: true })
      return true
    },
    remindSoon: async (self, p: { ms: number }) => {
      self.schedule(p.ms, 'remind', {})
      return true
    },
    remind: async (self) => {
      self.set({ reminders: self.state.reminders + 1 })
      self.emit('reminder', { at: Date.now() })
    },
    summarizeLater: async (self) => {
      self.defer('summarize', { upTo: self.state.count })
      return true
    },
    saveSummary: async (self, p: { text: string }) => {
      self.set({ summaries: self.state.summaries + 1 })
      self.db.messages.add({ text: p.text, user: 'summary' })
    },
  },
  jobs: {
    summarize: async (self, p: { upTo: number }) => {
      const n = self.db.messages.count()
      await self.call('saveSummary', { text: `summary of ${n} messages (up to ${p.upTo})` })
    },
  },
})
