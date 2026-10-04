/**
 * Overlay handle methods: dialog, accordion, dropdown, menu, tabs.
 *
 * All five share one open/close contract, so they share one implementation.
 * A click delegates *to* these methods rather than the methods re-implementing
 * the click — the compiled behavior and the imperative API cannot drift.
 */
import { extend, setPartVisible, type HandleCtx } from './shared'

/** Show/hide an element that is `display:none` while closed. */
function setOpen(ctx: HandleCtx, open: boolean): void {
  ctx.setProp('open', open)
  if (!ctx.el) return
  ctx.el.style.display = open ? 'flex' : 'none'
  ctx.el.setAttribute('data-open', open ? 'true' : 'false')
  setPartVisible(ctx.el, 'dropdown-panel', open)
}

function isOpen(ctx: HandleCtx): boolean {
  const v = ctx.getProp('open')
  if (typeof v === 'boolean') return v
  return ctx.el?.getAttribute('data-open') === 'true'
}

function dialogMethods(ctx: HandleCtx): Record<string, unknown> {
  return {
    open: () => setOpen(ctx, true),
    close: () => setOpen(ctx, false),
    toggle: () => setOpen(ctx, !isOpen(ctx)),
    isOpen: () => isOpen(ctx),
    confirm: () => {
      setOpen(ctx, false)
      ctx.el?.querySelector('[data-part="confirm"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      ctx.emit('submitted', {})
    },
    cancel: () => {
      setOpen(ctx, false)
      ctx.el?.querySelector('[data-part="cancel"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      ctx.emit('cancelled', {})
    },
    dismiss: () => {
      setOpen(ctx, false)
      ctx.el?.querySelector('[data-part="dismiss"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    },
    setTitle: (title: string) => {
      ctx.setProp('title', title)
      const node = ctx.el?.querySelector('[data-part="title"]')
      if (node) node.textContent = String(title ?? '')
    },
    setDescription: (description: string) => {
      ctx.setProp('description', description)
      const node = ctx.el?.querySelector('[data-part="description"]')
      if (node) node.textContent = String(description ?? '')
    },
  }
}

function dropdownMethods(ctx: HandleCtx): Record<string, unknown> {
  return {
    open: () => setOpen(ctx, true),
    close: () => setOpen(ctx, false),
    toggle: () => setOpen(ctx, !isOpen(ctx)),
    isOpen: () => isOpen(ctx),
  }
}

function menuMethods(ctx: HandleCtx): Record<string, unknown> {
  return {
    open: () => setOpen(ctx, true),
    close: () => setOpen(ctx, false),
    toggle: () => setOpen(ctx, !isOpen(ctx)),
    isOpen: () => isOpen(ctx),
    selectItem: (value: string) => {
      const item = ctx.el?.querySelector(`[data-part="dropdown-item"][data-value="${CSS.escape(String(value))}"]`)
      item?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return Boolean(item)
    },
  }
}

function accordionMethods(ctx: HandleCtx): Record<string, unknown> {
  const keyOf = (node: Element): string => node.getAttribute('data-item-key') ?? ''
  const setItemOpen = (trigger: Element, open: boolean): void => {
    trigger.setAttribute('data-open', open ? 'true' : 'false')
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
    const item = trigger.parentElement
    const panel = item?.querySelector('[data-part="accordion-panel"]')
    if (panel) {
      if (open) panel.removeAttribute('hidden')
      else panel.setAttribute('hidden', '')
    }
  }
  const triggers = (): Element[] => Array.from(ctx.el?.querySelectorAll('[data-part="accordion-trigger"]') ?? [])

  return {
    open: (key?: string) => {
      const all = triggers()
      if (key === undefined) {
        for (const t of all) setItemOpen(t, true)
        return
      }
      for (const t of all) if (keyOf(t) === String(key)) setItemOpen(t, true)
    },
    close: (key?: string) => {
      const all = triggers()
      if (key === undefined) {
        for (const t of all) setItemOpen(t, false)
        return
      }
      for (const t of all) if (keyOf(t) === String(key)) setItemOpen(t, false)
    },
    toggle: (key: string) => {
      const target = triggers().find((t) => keyOf(t) === String(key))
      if (!target) return
      const opening = target.getAttribute('data-open') !== 'true'
      if (opening && ctx.getProp('multiple') !== true) {
        for (const t of triggers()) setItemOpen(t, false)
      }
      setItemOpen(target, opening)
    },
    isOpen: (key: string) => triggers().find((t) => keyOf(t) === String(key))?.getAttribute('data-open') === 'true',
    keys: () => triggers().map(keyOf),
  }
}

function tabsMethods(ctx: HandleCtx): Record<string, unknown> {
  const tabs = (): HTMLElement[] => Array.from(ctx.el?.querySelectorAll<HTMLElement>('[data-part="tab"]') ?? [])
  const keyOf = (t: Element): string => t.getAttribute('data-tab-key') ?? ''
  const setActive = (key: string): void => {
    for (const t of tabs()) {
      if (keyOf(t) === key) {
        t.setAttribute('data-active', 'true')
      } else {
        t.removeAttribute('data-active')
      }
    }
    for (const p of Array.from(ctx.el?.querySelectorAll<HTMLElement>('[data-part="panel"]') ?? [])) {
      if (p.getAttribute('data-panel-key') === key) p.removeAttribute('hidden')
      else p.setAttribute('hidden', '')
    }
    ctx.setProp('activeKey', key)
  }
  const active = (): string | undefined => tabs().find((t) => t.getAttribute('data-active') === 'true') && keyOf(tabs().find((t) => t.getAttribute('data-active') === 'true')!)

  return {
    setActive,
    getActive: active,
    getActiveKey: active,
    next: () => {
      const all = tabs()
      if (!all.length) return
      const i = all.findIndex((t) => t.getAttribute('data-active') === 'true')
      setActive(keyOf(all[(i + 1) % all.length]!))
    },
    prev: () => {
      const all = tabs()
      if (!all.length) return
      const i = all.findIndex((t) => t.getAttribute('data-active') === 'true')
      setActive(keyOf(all[(i - 1 + all.length) % all.length]!))
    },
    setItems: (items: Array<{ key: string; label: string }>) => {
      ctx.setProp('items', items)
      const list = ctx.el?.querySelector('[data-part="tab-list"]')
      if (!list) return
      const activeKey = active() ?? items[0]?.key
      list.innerHTML = items
        .map(
          (i) =>
            `<div data-part="tab" data-tab-key="${i.key}" role="tab"${i.key === activeKey ? ' data-active="true"' : ''}>${i.label}</div>`,
        )
        .join('')
    },
  }
}

const BY_KIND: Record<string, (ctx: HandleCtx) => Record<string, unknown>> = {
  dialog: dialogMethods,
  dropdown: dropdownMethods,
  menu: menuMethods,
  accordion: accordionMethods,
  tabs: tabsMethods,
}

export function extendOverlay(ctx: HandleCtx): void {
  const build = BY_KIND[ctx.kind]
  if (build) extend(ctx, build(ctx))
}
