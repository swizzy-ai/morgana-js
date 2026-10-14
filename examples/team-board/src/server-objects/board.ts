import { defineServerObject } from '@studiomorgana/sdk'

/**
 * A board: durable state, its own `cards` table, and methods that are
 * transactions. Every browser watching the board sees changes live.
 */
export default defineServerObject({
  name: 'board',
  state: { title: 'Untitled board', cardCount: 0 },
  collections: {
    cards: {
      columns: [
        { name: 'text', type: 'string' },
        { name: 'column', type: 'string' },
        { name: 'author', type: 'string' },
      ],
    },
  },
  computed: {
    label: (s) => `${s.title} · ${s.cardCount} cards`,
  },
  // What a browser may do. Anything not listed is server-only — creating a
  // board is, so only server code (open-board.ts) makes one.
  access: {
    read: 'public',
    subscribe: 'public',
    cards: 'public',
    addCard: 'member',
    moveCard: 'member',
  },
  // Reactions commit with the call that caused them.
  on: {
    'cards.added': (self) => self.set({ cardCount: self.state.cardCount + 1 }),
    'cards.removed': (self) => self.set({ cardCount: self.state.cardCount - 1 }),
  },
  methods: {
    cards: async (self, p: { column?: string } = {}) =>
      self.db.cards.query({ where: p.column ? { column: p.column } : undefined, sort: { field: 'createdAt' } }).items,

    addCard: async (self, p: { text: string; column?: string }) => {
      if (!p.text.trim()) throw new Error('a card needs text')
      const card = self.db.cards.add({ text: p.text.trim(), column: p.column ?? 'todo', author: self.caller?.email ?? 'server' })
      self.emit('card', card)
      return card
    },

    moveCard: async (self, p: { id: string; column: string }) => {
      const card = self.db.cards.update(p.id, { column: p.column })
      if (!card) throw new Error(`no card ${p.id}`)
      self.emit('moved', card)
      return card
    },
  },
})
