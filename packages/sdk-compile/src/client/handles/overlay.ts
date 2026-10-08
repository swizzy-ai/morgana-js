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

function popoverMethods(ctx: HandleCtx): Record<string, unknown> {
  const panel = (): Element | null => ctx.el?.querySelector('[data-part="popover-panel"]') ?? null
  const paint = (open: boolean): void => {
    ctx.setProp('open', open)
    if (!ctx.el) return
    ctx.el.setAttribute('data-open', open ? 'true' : 'false')
    const trigger = ctx.el.querySelector('[data-part="popover-trigger"]')
    trigger?.setAttribute('aria-expanded', open ? 'true' : 'false')
    const p = panel()
    if (p) {
      if (open) p.removeAttribute('hidden')
      else p.setAttribute('hidden', '')
    }
  }
  return {
    open: () => {
      paint(true)
      ctx.emit('changed', { open: true })
    },
    close: () => {
      paint(false)
      ctx.emit('changed', { open: false })
    },
    toggle: () => {
      const opening = !isOpen(ctx)
      paint(opening)
      ctx.emit('changed', { open: opening })
    },
    isOpen: () => isOpen(ctx),
    setTitle: (title: string) => {
      ctx.setProp('title', title)
      const node = ctx.el?.querySelector('[data-part="popover-title"]')
      if (node) node.textContent = String(title ?? '')
    },
    setContent: (content: string) => {
      ctx.setProp('content', content)
      const node = ctx.el?.querySelector('[data-part="popover-content"]')
      if (node) node.textContent = String(content ?? '')
    },
    setPlacement: (placement: string) => {
      ctx.setProp('placement', placement)
      ctx.el?.setAttribute('data-placement', String(placement))
    },
    setSize: (size: string) => {
      ctx.setProp('size', size)
      ctx.el?.setAttribute('data-prop-size', String(size))
    },
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
  const multiple = (): boolean => ctx.getProp('multiple') === true
  const collapsible = (): boolean => ctx.getProp('collapsible') !== false
  const openKeys = (): string[] =>
    triggers()
      .filter((t) => t.getAttribute('data-open') === 'true')
      .map(keyOf)
  const syncValue = (): void => {
    ctx.setProp('value', multiple() ? openKeys() : (openKeys()[0] ?? ''))
  }
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
        // Open-all is only meaningful with multiple; otherwise open the first.
        if (multiple()) for (const t of all) setItemOpen(t, true)
        else if (all[0]) {
          for (const t of all) setItemOpen(t, false)
          setItemOpen(all[0], true)
        }
      } else {
        if (!multiple()) for (const t of all) setItemOpen(t, false)
        for (const t of all) if (keyOf(t) === String(key)) setItemOpen(t, true)
      }
      syncValue()
      ctx.emit('changed', { value: multiple() ? openKeys() : (openKeys()[0] ?? '') })
    },
    close: (key?: string) => {
      const all = triggers()
      if (key === undefined) {
        if (!collapsible() && openKeys().length > 0) return
        for (const t of all) setItemOpen(t, false)
      } else {
        const target = all.find((t) => keyOf(t) === String(key))
        if (!target) return
        if (!collapsible() && target.getAttribute('data-open') === 'true' && openKeys().length <= 1) return
        setItemOpen(target, false)
      }
      syncValue()
      ctx.emit('changed', { value: multiple() ? openKeys() : (openKeys()[0] ?? '') })
    },
    toggle: (key: string) => {
      const target = triggers().find((t) => keyOf(t) === String(key))
      if (!target) return
      const opening = target.getAttribute('data-open') !== 'true'
      if (opening && !multiple()) {
        for (const t of triggers()) setItemOpen(t, false)
      }
      if (!opening && !collapsible() && openKeys().length <= 1) return
      setItemOpen(target, opening)
      syncValue()
      ctx.emit('changed', { key: String(key), open: opening, value: multiple() ? openKeys() : (openKeys()[0] ?? '') })
    },
    isOpen: (key: string) => triggers().find((t) => keyOf(t) === String(key))?.getAttribute('data-open') === 'true',
    getOpenKeys: () => openKeys(),
    keys: () => triggers().map(keyOf),
    // Structural props live on attributes the delegation reads (data-multiple,
    // data-collapsible, data-prop-variant) — generic set() updates meta only,
    // so these writers keep both in sync. Same rule as toggle check()/progress
    // setValue(): handle-semantic props go through methods.
    setMultiple: (on: boolean) => {
      ctx.setProp('multiple', on)
      ctx.el?.setAttribute('data-multiple', on ? 'true' : 'false')
    },
    setCollapsible: (on: boolean) => {
      ctx.setProp('collapsible', on)
      if (!ctx.el) return
      if (on) ctx.el.removeAttribute('data-collapsible')
      else ctx.el.setAttribute('data-collapsible', 'false')
    },
    setVariant: (variant: string) => {
      ctx.setProp('variant', variant)
      ctx.el?.setAttribute('data-prop-variant', String(variant))
    },
    setSize: (size: string) => {
      ctx.setProp('size', size)
      ctx.el?.setAttribute('data-prop-size', String(size))
    },
    setItems: (items: Array<{ key: string; title?: string; label?: string; content?: string; disabled?: boolean; defaultOpen?: boolean }>) => {
      ctx.setProp('items', items)
      if (!ctx.el) return
      const esc = (s: string): string =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      ctx.el.innerHTML = (items ?? [])
        .map((it) => {
          const key = esc(String(it.key ?? it.title ?? ''))
          const open = it.defaultOpen === true
          return (
            '<div data-part="accordion-item">' +
            `<button type="button" data-part="accordion-trigger" data-item-key="${key}" data-open="${open ? 'true' : 'false'}"` +
            `${it.disabled === true ? ' data-disabled="true"' : ''} aria-expanded="${open ? 'true' : 'false'}">` +
            `<span data-part="accordion-title">${esc(String(it.title ?? it.label ?? key))}</span>` +
            '<span data-part="chevron">&#x2304;</span></button>' +
            `<div data-part="accordion-panel"${open ? '' : ' hidden'}>${esc(String(it.content ?? ''))}</div></div>`
          )
        })
        .join('')
      syncValue()
    },
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
  popover: popoverMethods,
  menu: menuMethods,
  accordion: accordionMethods,
  tabs: tabsMethods,
}

export function extendOverlay(ctx: HandleCtx): void {
  const build = BY_KIND[ctx.kind]
  if (build) extend(ctx, build(ctx))
}
