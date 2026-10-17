import { defineServerObject } from '@studiomorgana/sdk'

/**
 * A board is a server object: one durable instance per board, named `main`
 * here. It owns its own `cards` table, and its methods are transactions — two
 * people moving the same card at once cannot corrupt it.
 *
 * Every browser subscribed to the board hears each change live (the page's
 * `object:board/main.cards.*` events, see src/actions/client/board.ts).
 */
export default defineServerObject({
  name: 'board',
  state: { title: 'Kanban', cardCount: 0 },
  collections: {
    cards: {
      columns: [
        { name: 'text', type: 'string' },
        // One of: todo, doing, done. A string on purpose, so a new column is a
        // constant in the page, not a schema migration.
        { name: 'column', type: 'string' },
      ],
    },
  },
  // A value derived from state, read by the page with `bind('object:board/main.label')`.
  computed: {
    label: (s) => `${s.title} · ${s.cardCount} cards`,
  },
  // What a browser may do. Anything not named is server-only.
  // `member` means a signed-in visitor (see the login page in apps.ts).
  access: {
    read: 'public',
    subscribe: 'public',
    cards: 'public',
    addCard: 'member',
    moveCard: 'member',
  },
  // Reactions run in the same transaction as the change that caused them.
  on: {
    'cards.added': (self) => self.set({ cardCount: self.state.cardCount + 1 }),
    'cards.removed': (self) => self.set({ cardCount: self.state.cardCount - 1 }),
  },
  methods: {
    /** The cards, oldest first. `column` narrows it to one column. */
    cards: async (self, p: { column?: string } = {}) =>
      self.db.cards.query({ where: p.column ? { column: p.column } : undefined, sort: { field: 'createdAt' } }).items,

    /** A new card goes to `todo` unless told otherwise. */
    addCard: async (self, p: { text: string; column?: string }) => {
      const text = p.text.trim()
      if (!text) throw new Error('a card needs text')
      return self.db.cards.add({ text: text.slice(0, 280), column: p.column ?? 'todo' })
    },

    /** Move one card to another column. Throws when the card is gone. */
    moveCard: async (self, p: { id: string; column: string }) => {
      const card = self.db.cards.update(p.id, { column: p.column })
      if (!card) throw new Error(`no card ${p.id}`)
      return card
    },
  },
})
