import { defineClientAction } from '@morgana/sdk'

/**
 * Scoped to ONE object. Before object-scoping existed this was impossible:
 * `on: 'clicked'` fired for a click on *any* object on the page, because the
 * object part of a selector was discarded.
 */
export const onNameButton = defineClientAction({
  config: { on: 'c-buy.clicked' },
  handler: (ctx) => {
    const cta = ctx.ui.get('c-buy')
    cta?.set('variant', 'success')
    cta?.set('label', 'Added ✓')
    return { ok: true, object: cta?.name }
  },
})

/**
 * Scoped to one PROP of one object, and not tied to state. `set()` dispatches
 * this whether or not anything is bound to it, so it is a real change to the
 * object rather than an echo of the state tree.
 */
export const onTitleChanged = defineClientAction({
  config: { on: 'c-heading.label.changed' },
  handler: (ctx) => {
    // The payload carries which prop moved, and to what.
    const prop = (ctx.event.payload as { prop?: string }).prop
    ctx.log(`heading.${prop} changed`)
    return { ok: true, prop }
  },
})

/**
 * A DOM event, scoped to one object, written the DOM way. `hovered` is
 * canonicalized to `hover` — the name the runtime actually dispatches. Before
 * this, `hovered` was accepted by the parser and bound to an event nothing
 * ever emitted, so it compiled, shipped, and never fired.
 */
export const onCardHovered = defineClientAction({
  config: { on: 'c-card.hovered' },
  handler: () => ({ ok: true }),
})

/**
 * Scoped to a CUSTOM OBJECT, and it fires for what is inside it.
 *
 * `c-player` is a `video-player`, which places real `video` and `caption`
 * objects. A click on the video dispatches with the *video's* id, so a binding
 * on `c-player.clicked` alone would never fire. The compiler expands a component
 * scope to the object and everything inside it, so this works without naming the
 * component's internals.
 */
export const onPlayerClicked = defineClientAction({
  config: { on: 'c-player.clicked' },
  handler: (ctx) => ({ ok: true, player: ctx.ui.get('c-player')?.name }),
})

/**
 * A custom object's own declared event. `played` is declared by video-player in
 * `src/objects/video-player.ts`. Before custom events were recognised, this
 * silently became a *server* trigger and could never fire on the page.
 */
export const onPlayed = defineClientAction({
  config: { on: 'c-player.played' },
  handler: () => ({ ok: true }),
})

/** State, still scoped by path — this one always worked. */
export const onCartOpen = defineClientAction({
  config: { on: 'state:cart.open' },
  handler: (ctx) => {
    const open = ctx.getState().cart as { open?: boolean } | undefined
    ctx.ui.get('c-cart-badge')?.set('label', open?.open ? 'In cart' : 'Empty')
    return { ok: true, open: open?.open === true }
  },
})
