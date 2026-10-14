/**
 * Shared page shell for morgana-docs — every page gets the same rail.
 *
 * Compile-lane only: this is a plain module imported by the compile actions,
 * never an action itself. One place to change the nav, every page follows.
 */

export const NAV: Array<{ key: string; label: string; href: string }> = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'basic', label: 'Basic objects', href: '/objects-basic/' },
  { key: 'input', label: 'Inputs & forms', href: '/objects-input/' },
  { key: 'data', label: 'Data objects', href: '/objects-data/' },
  { key: 'display', label: 'Display objects', href: '/objects-display/' },
  { key: 'structure', label: 'Structure', href: '/objects-structure/' },
  { key: 'motion', label: 'Motion lab', href: '/motion/' },
  { key: 'style', label: 'Style lab', href: '/style/' },
  { key: 'lanes', label: 'Lanes', href: '/lanes/' },
  { key: 'backend', label: 'Data + backend', href: '/backend/' },
  { key: 'stream', label: 'Streaming', href: '/stream/' },
  { key: 'srvdemo', label: 'Server-rendered', href: '/srvdemo/' },
]

/**
 * Wrap a page in the docs shell: top rail + title + a content box the caller
 * fills. Returns the content box.
 */
export function placeShell(ctx: any, page: any, active: string, title: string, sub: string): any {
  const wrap = ctx.ui.box({ id: `d-${active}-wrap` })
  wrap.setProps({ layout: 'col', pad: 6, gap: 4, maxW: 1100, bg: '#F1F5F9' })

  const rail = ctx.ui.box({ id: `d-${active}-nav` })
  rail.setProps({ layout: 'row', gap: 2, align: 'center', wrap: true, bg: '#111827', radius: 'lg', pad: 3 })
  // Shell ids are prefixed per page: the IR is project-wide, so a bare
  // `d-nav-home` created by 9 pages is ONE object migrated to the last rail.
  // (Framework gap: duplicate creation should fail fast, not silently move.)
  for (const item of NAV) {
    const link = ctx.ui.link({ id: `d-${active}-nav-${item.key}`, href: item.href })
    const isActive = item.key === active
    const label = isActive ? `● ${item.label}` : item.label
    const t = ctx.ui.text({ id: `d-${active}-nav-${item.key}-t`, content: label, font: 'body-me' })
    t.setProps({ color: isActive ? '#A78BFA' : '#E5E7EB' })
    link.place(t)
    rail.place(link)
  }
  wrap.place(rail)

  const head = ctx.ui.text({ id: `d-${active}-title`, content: title, font: 'h1' })
  head.setProps({ color: '#111827' })
  wrap.place(head)
  const subEl = ctx.ui.text({ id: `d-${active}-sub`, content: sub, font: 'body-lg' })
  subEl.setProps({ color: '#475569' })
  wrap.place(subEl)

  const content = ctx.ui.box({ id: `d-${active}-content` })
  content.setProps({ layout: 'col', gap: 6 })
  wrap.place(content)
  page.place(wrap)
  return content
}

/**
 * One documented view: section title + target stage + knob row + event log.
 * Returns { stage, log } — the caller places the target into stage.
 */
export function placeView(
  ctx: any,
  content: any,
  view: string,
  title: string,
  blurb: string,
  knobs: Array<{ id: string; kind: 'select' | 'input' | 'toggle'; label: string; options?: string[]; value?: string }>,
): { stage: any; log: any } {
  const section = ctx.ui.box({ id: `d-${view}` })
  section.setProps({ layout: 'col', gap: 3, pad: 5, bg: '#FFFFFF' })
  section.make('card')

  section.place(ctx.ui.text({ id: `d-${view}-h`, content: title, font: 'h2' }))
  section.place(ctx.ui.text({ id: `d-${view}-p`, content: blurb, font: 'body' }))

  const stage = ctx.ui.box({ id: `d-${view}-stage` })
  stage.setProps({ layout: 'col', gap: 2, pad: 4 })
  section.place(stage)

  const row = ctx.ui.box({ id: `d-${view}-knobs` })
  row.setProps({ layout: 'row', gap: 3, align: 'center', wrap: true })
  for (const knob of knobs) {
    const cell = ctx.ui.box({ id: `${knob.id}-cell` })
    cell.setProps({ layout: 'col', gap: 1 })
    cell.place(ctx.ui.text({ id: `${knob.id}-label`, content: knob.label, font: 'caption' }))
    if (knob.kind === 'select') {
      cell.place(
        ctx.ui.select({
          id: knob.id,
          options: (knob.options ?? []).map((o) => ({ label: o, value: o })),
          value: knob.value ?? knob.options?.[0] ?? '',
        }),
      )
    } else if (knob.kind === 'toggle') {
      cell.place(ctx.ui.toggle({ id: knob.id, label: knob.label, checked: knob.value === 'true' }))
    } else {
      cell.place(ctx.ui.input({ id: knob.id, value: knob.value ?? '' }))
    }
    row.place(cell)
  }
  section.place(row)

  section.place(ctx.ui.text({ id: `d-${view}-log-h`, content: 'Event log', font: 'caption' }))
  const log = ctx.ui.list({ id: `d-${view}-log` })
  section.place(log)

  content.place(section)
  return { stage, log }
}
