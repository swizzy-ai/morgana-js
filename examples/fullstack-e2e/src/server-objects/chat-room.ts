import { defineServerObject } from '@studiomorgana/sdk'

/**
 * A chat room: durable state, its own message table, a streaming method,
 * a scheduled reminder, a background job, `on` reactions and object-event
 * triggers — every server-object feature the e2e suite checks, on both hosts.
 */
export default defineServerObject({
  name: 'chat-room',
  state: {
    title: '',
    count: 0,
    closed: false,
    reminders: 0,
    summaries: 0,
    hasUnread: false,
    unread: 0,
    closedNotices: 0,
    triggered: 0,
    lastTriggered: '',
    welcomed: false,
  },
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
    relay: 'public',
    bump: 'public',
    close: { role: 'admin' },
  },
  onCreate: async (self, init) => {
    self.emit('opened', { title: init.title ?? '' })
  },
  // Reactions: run inside the call that caused them, committed with it.
  on: {
    'messages.added': (self) => {
      self.set({ hasUnread: true, unread: self.state.unread + 1 })
    },
    'state.closed': (self, change) => {
      if (change.value) self.set({ closedNotices: self.state.closedNotices + 1 })
    },
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
    /** A streaming method: sends the text word by word, then saves it as one message. */
    relay: async function* (self, p: { text: string }) {
      const words = p.text.split(' ')
      for (const w of words) {
        await new Promise((r) => setTimeout(r, 150))
        yield `${w} `
      }
      const msg = self.db.messages.add({ text: p.text, user: self.caller?.email ?? 'server' })
      self.set({ count: self.state.count + 1 })
      self.emit('message', msg)
      return { saved: msg.id }
    },
    markRead: async (self) => {
      self.set({ hasUnread: false, unread: 0 })
    },
    /** Called by the onRoomMessage action, which a messages.added trigger runs. */
    tally: async (self, p: { id: string }) => {
      self.set({ triggered: self.state.triggered + 1, lastTriggered: p.id })
    },
    /** Called by the onRoomCreated action (an object:chat-room.created trigger). */
    welcome: async (self) => {
      self.set({ welcomed: true })
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
