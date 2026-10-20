import { defineClientAction, type ObjectHandle } from '@studiomorgana/sdk'
import { helpers, theme } from '@studiomorgana/helpers'

const look = theme('water')
  .background({ dark: '#07090c', light: '#07090c' })
  .card({ dark: '#0e1218', light: '#0e1218' })
  .border({ dark: '#232a33', light: '#232a33' })
  .text({ dark: '#eef2f6', light: '#eef2f6' })
  .mutedText({ dark: '#8a96a3', light: '#8a96a3' })
  .primary({ dark: '#eef2f6', light: '#eef2f6' })
  .primaryText({ dark: '#07090c', light: '#07090c' })
  .appearance('side', (make) => make.column().spaced(3).padding(5).width(95).minWidth(0).background('card').borderRight('border'))
  .appearance('title', (make) => make.size(18).semibold().textColor('text'))
  .appearance('lead', (make) => make.size(13).lineHeight(1.5).textColor('mutedText'))
  .appearance('cap', (make) => make.size(11).semibold().letterSpacing(0.08).uppercase().textColor('mutedText'))
  .appearance('box', (make) => make.full().minHeight('150px').padding(3).background('background').textColor('text').border('border').rounded('small').size(13).lineHeight(1.5))
  .appearance('key', (make) => make.padding('8px 14px').background('transparent').textColor('text').border('border').rounded('small').size(13).semibold().pointer())
  .appearance('keyMain', (make) => make.background('primary').textColor('primaryText'))
  .appearance('row', (make) => make.row().spread().spaced(2).padding('3px 0').size(12).textColor('mutedText').borderBottom('border'))
  .appearance('rowAsked', (make) => make.textColor('text'))

/**
 * The water-world page: words on the left, the world live on the right, and
 * every handle the words (or the seed) set, listed under the box.
 */
export const worldPage = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const { create, place, make, set, fill } = helpers(ctx, look)
    const state = ctx.ui.state as typeof ctx.ui.state & { define(key: string, opts?: Record<string, unknown>): void }
    state.define('words', { initial: 'a choppy ocean at golden hour, with two rocky islands to the north. low mist.', keep: 'device' })
    state.define('seed', { initial: '', address: 'seed' })
    ctx.ui.setState({ shown: '', note: '', rows: [] })

    create.page('home').at('/').in('world').titled('Water world · Morgana').mode('dark')
    const frame = create.box('frame')
    make(frame).row().full().height('100vh').background('background')
    frame.setProps({ overflow: 'hidden' } as never)
    place(frame).on('home')

    const side = create.box('side')
    make(side).appearance('side')
    // The handle list is long: the side scrolls on its own; the world stays on screen.
    side.setProps({ height: '100vh', overflow: 'scroll' } as never)
    const title = create.text('title', 'Water world')
    make(title).appearance('title')
    place(title).in(side)
    const lead = create.text('lead', 'Say a world. Every word sets a range; the seed draws the rest, so no two are alike. Lines like island-1.cliffs.height = 0.9 set a handle exactly.')
    make(lead).appearance('lead')
    place(lead).in(side)
    const box = create.textarea('words-box')
    make(box).appearance('box')
    set(box).valueFrom('words')
    place(box).in(side)

    const keys = create.box('keys')
    make(keys).row().spaced(2).wrap()
    const again = create.button('again', 'New world')
    make(again).appearance('key', 'keyMain')
    const keep = create.button('keep', 'Keep this one')
    make(keep).appearance('key')
    place(again).in(keys)
    place(keep).in(keys)
    place(keys).in(side)
    const shown = create.text('shown', '')
    make(shown).appearance('cap')
    set(shown).textFrom('shown')
    place(shown).in(side)
    const note = create.text('note', '')
    make(note).appearance('lead')
    set(note).textFrom('note')
    place(note).in(side)

    const capRows = create.text('cap-rows', 'Every handle (bright: what you asked for)')
    make(capRows).appearance('cap')
    place(capRows).in(side)
    const row = create.box('handle-row')
    make(row).appearance('row')
    make(row).while('*asked', true).appearance('rowAsked')
    place(create.text('handle-id', '*id')).in(row)
    place(create.text('handle-value', '*value')).in(row)
    const list = create.list('handles')
    make(list).column().full()
    place(row).in(list)
    fill(list).from('rows', 'id')
    place(list).in(side)
    place(side).in(frame)

    const view = (ctx.ui as unknown as Record<string, (p: Record<string, unknown>) => ObjectHandle<any>>).worldView({ id: 'world' })
    place(view).in(frame)
    return { ok: true }
  },
})
