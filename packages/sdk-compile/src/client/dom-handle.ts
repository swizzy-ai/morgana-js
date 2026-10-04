/**
 * DomElementHandle — the wrapper `ctx.ui.dom.wrap()` promised.
 *
 * Previously `wrap` returned its argument unchanged, so the entire 24-method
 * `DomElementHandle` (sdk/contexts/client.ts) was unreachable. This is that
 * implementation: a thin, predictable view over one element. Every method is
 * scoped to the wrapped node — no selectors, no global state.
 */

export interface DomApiDeps {
  logEvent(entry: Record<string, unknown>): unknown
}

interface Listener {
  event: string
  fn: EventListener
  capture: boolean
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

export function wrapElement(el: Element, deps: DomApiDeps): Record<string, unknown> {
  if (!el) throw new Error('[Morgana] dom.wrap() got a null element')
  const html = el as HTMLElement

  const setText = (v: unknown): void => {
    html.textContent = v === null || v === undefined ? '' : String(v)
  }
  const setAttr = (k: string, v: unknown): void => {
    if (v === null || v === undefined) el.removeAttribute(k)
    else el.setAttribute(k, String(v))
  }
  const setStyle = (k: string, v: unknown): void => {
    if (v === null || v === undefined || v === '') html.style.removeProperty(kebab(k))
    else html.style.setProperty(kebab(k), String(v))
  }

  /** Listeners registered through on(), so off() can remove them by handle. */
  const listeners: Listener[] = []

  const handle: Record<string, unknown> = {
    element: el,
    tag: el.tagName.toLowerCase(),
    get text(): string {
      return html.textContent ?? ''
    },
    set text(v: unknown) {
      setText(v)
    },
    get html(): string {
      return html.innerHTML
    },
    set html(v: unknown) {
      html.innerHTML = String(v ?? '')
    },
    get val(): string {
      const v = (el as unknown as { value?: unknown }).value
      return v === undefined || v === null ? '' : String(v)
    },
    set val(v: unknown) {
      const input = el as unknown as { value?: unknown }
      if ('value' in input) input.value = v === null || v === undefined ? '' : String(v)
    },
    attr: (name: string) => el.getAttribute(name),
    setAttr: (name: string, v: unknown) => setAttr(name, v),
    removeAttr: (name: string) => el.removeAttribute(name),
    hasAttr: (name: string) => el.hasAttribute(name),
    attrs: () => {
      const out: Record<string, string> = {}
      for (const a of Array.from(el.attributes)) out[a.name] = a.value
      return out
    },
    css: (name: string) => html.style.getPropertyValue(kebab(name)) || null,
    setCss: (name: string, v: unknown) => setStyle(name, v),
    removeCss: (name: string) => html.style.removeProperty(kebab(name)),
    addClass: (...names: string[]) => html.classList.add(...names.filter(Boolean)),
    removeClass: (...names: string[]) => html.classList.remove(...names.filter(Boolean)),
    toggleClass: (name: string, on?: boolean) => html.classList.toggle(name, on),
    hasClass: (name: string) => html.classList.contains(name),
    show: () => {
      html.style.removeProperty('display')
      el.removeAttribute('hidden')
    },
    hide: () => {
      html.style.setProperty('display', 'none')
    },
    toggle: (on?: boolean) => {
      const next = on === undefined ? html.style.display === 'none' : on
      if (next) {
        html.style.setProperty('display', 'none')
      } else {
        html.style.removeProperty('display')
        el.removeAttribute('hidden')
      }
      return next
    },
    focus: () => html.focus(),
    blur: () => html.blur(),
    click: () => html.click(),
    rect: () => {
      const r = html.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom }
    },
    children: () => Array.from(el.children),
    parent: () => (el.parentElement ? wrapElement(el.parentElement, deps) : null),
    find: (selector: string) => {
      const found = el.querySelector(selector)
      return found ? wrapElement(found, deps) : null
    },
    findAll: (selector: string) => Array.from(el.querySelectorAll(selector)).map((n) => wrapElement(n, deps)),
    append: (child: Element | string) => {
      el.append(typeof child === 'string' ? document.createTextNode(child) : child)
      return handle
    },
    remove: () => {
      el.remove()
      return handle
    },
    on: (event: string, fn: EventListener) => {
      const capture = false
      el.addEventListener(event, fn, capture)
      const entry: Listener = { event, fn, capture }
      listeners.push(entry)
      return () => {
        el.removeEventListener(entry.event, entry.fn, entry.capture)
        const i = listeners.indexOf(entry)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
    off: (entry: Listener) => {
      el.removeEventListener(entry.event, entry.fn, entry.capture)
      const i = listeners.indexOf(entry)
      if (i >= 0) listeners.splice(i, 1)
      return handle
    },
    onAll: (event: string, fn: EventListener) => {
      const capture = true
      el.addEventListener(event, fn, capture)
      listeners.push({ event, fn, capture })
      return () => {
        el.removeEventListener(event, fn, capture)
      }
    },
    /** Unwrap back to the raw node. */
    unwrap: () => el,
  }

  return handle
}
