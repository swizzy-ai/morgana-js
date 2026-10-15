/**
 * Input handle methods: button, input/textarea, toggle/checkbox/radio,
 * select, label, form.
 *
 * Form and select are the substantial ones — they are what make input capture
 * possible at all, and they read values back from the real DOM rather than
 * tracking a parallel copy.
 */
import { extend, setText, type HandleCtx } from './shared'

// ── Button ──────────────────────────────────────────────────────────────────

export function buttonMethods(ctx: HandleCtx): Record<string, unknown> {
  const setDisabled = (on: boolean): void => {
    ctx.setProp('disabled', on)
    if (ctx.el) {
      if (on) ctx.el.setAttribute('disabled', '')
      else ctx.el.removeAttribute('disabled')
    }
  }
  return {
    disable: () => setDisabled(true),
    enable: () => setDisabled(false),
    setLoading: (loading: boolean) => {
      ctx.setProp('loading', loading)
      setDisabled(loading)
      if (!ctx.el) return
      const label = ctx.el.querySelector('[data-part="spinner"]')
      if (loading && !label) {
        const span = document.createElement('span')
        span.setAttribute('data-part', 'spinner')
        span.setAttribute('aria-hidden', 'true')
        span.textContent = '…'
        ctx.el.prepend(span)
      } else if (!loading && label) {
        label.remove()
      }
    },
    click: () => ctx.el?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
  }
}

// ── Input / textarea ────────────────────────────────────────────────────────

export function inputMethods(ctx: HandleCtx): Record<string, unknown> {
  const field = (): HTMLInputElement | HTMLTextAreaElement | null =>
    (ctx.el as unknown as HTMLInputElement | HTMLTextAreaElement) ?? null
  return {
    get value() {
      const f = field()
      return f ? String(f.value ?? '') : String(ctx.getProp('value') ?? '')
    },
    set value(v: unknown) {
      const f = field()
      if (f) f.value = v === null || v === undefined ? '' : String(v)
      else ctx.setProp('value', v)
    },
    clear: () => {
      const f = field()
      if (f) f.value = ''
      ctx.setProp('value', '')
    },
    focus: () => field()?.focus(),
    blur: () => field()?.blur(),
    setError: (error: string | null) => {
      ctx.setProp('error', error)
      if (!ctx.el) return
      const existing = ctx.el.querySelector('[data-part="error"]')
      if (error) {
        ctx.el.setAttribute('aria-invalid', 'true')
        if (existing) existing.textContent = error
        else {
          const div = document.createElement('div')
          div.setAttribute('data-part', 'error')
          div.setAttribute('role', 'alert')
          div.textContent = error
          ctx.el.parentElement?.appendChild(div)
        }
      } else {
        ctx.el.removeAttribute('aria-invalid')
        existing?.remove()
      }
    },
    getError: () => ctx.el?.querySelector('[data-part="error"]')?.textContent ?? null,
    /**
     * Validates against the field's own `rules` prop, mirroring the form-level
     * rules the submit handler applies, and marks the field on failure.
     */
    validate: (): boolean => {
      const rules = ctx.getProp('rules')
      const f = field()
      const v = f ? String(f.value ?? '') : String(ctx.getProp('value') ?? '')
      const rule = typeof rules === 'string' ? { required: rules === 'required' } : (rules as Record<string, unknown> | undefined)
      if (!rule) return true
      const empty = v === ''
      if (rule['required'] === true && empty) {
        const msg = (rule['message'] as string) ?? 'This field is required'
        ;(inputMethods(ctx)['setError'] as (e: string) => void)(msg)
        return false
      }
      if (empty) return true
      const min = rule['minLength'] as number | undefined
      const max = rule['maxLength'] as number | undefined
      const email = rule['email'] as boolean | undefined
      if (min !== undefined && v.length < min) {
        ;(inputMethods(ctx)['setError'] as (e: string) => void)((rule['message'] as string) ?? `Must be at least ${min} characters`)
        return false
      }
      if (max !== undefined && v.length > max) {
        ;(inputMethods(ctx)['setError'] as (e: string) => void)((rule['message'] as string) ?? `Must be at most ${max} characters`)
        return false
      }
      if (email === true && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
        ;(inputMethods(ctx)['setError'] as (e: string) => void)((rule['message'] as string) ?? 'Must be a valid email')
        return false
      }
      ;(inputMethods(ctx)['setError'] as (e: string | null) => void)(null)
      return true
    },
  }
}

// ── Toggle / checkbox / radio ───────────────────────────────────────────────

/**
 * Paint a toggle's checked state onto its element — data-checked, aria, and
 * the native input when the kind renders one. Shared by setChecked and the
 * generic set() path (runtime applyProp), so the two can never disagree.
 */
export function paintChecked(el: HTMLElement, on: boolean): void {
  const track = el.querySelector('[data-part="track"]')
  el.setAttribute('data-checked', on ? 'true' : 'false')
  if (track) track.setAttribute('aria-checked', on ? 'true' : 'false')
  const input = el.querySelector('input[type="checkbox"],input[type="radio"]') as HTMLInputElement | null
  if (input) input.checked = on
}

/** Exported for tests — the delegation contract (flip + exactly one `changed`) lives here. */
export function toggleMethods(ctx: HandleCtx): Record<string, unknown> {
  const setChecked = (on: boolean): void => {
    ctx.setProp('checked', on)
    if (ctx.el) paintChecked(ctx.el, on)
    // A programmatic write announces itself directly. It must NOT simulate a
    // click on the track: the document delegation reads that synthetic click
    // as a user gesture and flips the attribute straight back (check() stuck
    // every target at false, silently). User clicks still travel the
    // delegation path, which emits its own `changed`.
    ctx.emit('changed', { checked: on, value: on })
  }
  const isChecked = (): boolean => {
    if (ctx.el?.getAttribute('data-checked') === 'true') return true
    const input = ctx.el?.querySelector('input[type="checkbox"],input[type="radio"]') as HTMLInputElement | null
    return input ? input.checked : ctx.getProp('checked') === true
  }
  return {
    toggle: () => setChecked(!isChecked()),
    check: () => setChecked(true),
    uncheck: () => setChecked(false),
    isChecked,
    setDisabled: (on: boolean) => {
      ctx.setProp('disabled', on)
      if (!ctx.el) return
      if (on) ctx.el.setAttribute('data-disabled', 'true')
      else ctx.el.removeAttribute('data-disabled')
      const input = ctx.el.querySelector('input') as HTMLInputElement | null
      if (input) input.disabled = on
    },
    setLabel: (label: string) => {
      ctx.setProp('label', label)
      const node = ctx.el?.querySelector('[data-part="label"]')
      if (node) node.textContent = String(label ?? '')
    },
  }
}

// ── Number input ──────────────────────────────────────────────────────────

export function numberInputMethods(ctx: HandleCtx): Record<string, unknown> {
  const bounds = (): { min: number; max: number; step: number } => {
    const rawMin = ctx.getProp('min')
    const rawMax = ctx.getProp('max')
    return {
      min: rawMin === undefined ? -Infinity : Number(rawMin),
      max: rawMax === undefined ? Infinity : Number(rawMax),
      step: Number(ctx.getProp('step') ?? 1) || 1,
    }
  }
  const clamp = (v: number): number => {
    const { min, max, step } = bounds()
    const c = Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0))
    return Math.round((c / step)) * step
  }
  const paint = (v: number): void => {
    ctx.setProp('value', v)
    if (!ctx.el) return
    ctx.el.setAttribute('data-value', String(v))
    const input = ctx.el.querySelector('input[type="number"]') as HTMLInputElement | null
    if (input && input.value !== String(v)) input.value = String(v)
  }
  const current = (): number => {
    const attr = ctx.el?.getAttribute('data-value')
    if (attr !== null && attr !== undefined && attr !== '') return Number(attr)
    return Number(ctx.getProp('value') ?? 0)
  }
  const stepBy = (dir: 1 | -1, delta?: number): number => {
    const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : bounds().step
    const next = clamp(current() + dir * d)
    paint(next)
    ctx.emit('changed', { value: next })
    return next
  }
  return {
    getValue: () => current(),
    setValue: (v: number) => {
      const next = clamp(Number(v))
      paint(next)
      ctx.emit('changed', { value: next })
    },
    increment: (delta?: number) => stepBy(1, delta),
    decrement: (delta?: number) => stepBy(-1, delta),
    setStep: (step: number) => {
      ctx.setProp('step', step)
      const input = ctx.el?.querySelector('input[type="number"]') as HTMLInputElement | null
      if (input) input.setAttribute('step', String(step))
    },
  }
}

// ── Combobox ──────────────────────────────────────────────────────────────

export function comboboxMethods(ctx: HandleCtx): Record<string, unknown> {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const options = (): Array<{ label: string; value: string; disabled?: boolean }> => {
    const raw = ctx.getProp('options')
    return Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>).map((o) => ({
          label: String(o['label'] ?? o['value'] ?? ''),
          value: String(o['value'] ?? o['label'] ?? ''),
          disabled: o['disabled'] === true,
        }))
      : []
  }
  const paint = (value: string | string[]): void => {
    ctx.setProp('value', value)
    if (!ctx.el) return
    const multiple = ctx.el.getAttribute('data-multiple') === 'true'
    const vals = Array.isArray(value) ? value.map(String) : [String(value ?? '')]
    ctx.el.setAttribute('data-value', vals.join(','))
    const search = ctx.el.querySelector('input[data-part="search"]') as HTMLInputElement | null
    if (search && !multiple) search.value = options().find((o) => o.value === vals[0])?.label ?? vals[0] ?? ''
    for (const node of Array.from(ctx.el.querySelectorAll('[data-part="option"]'))) {
      const on = vals.includes(node.getAttribute('data-value') ?? '')
      if (on) node.setAttribute('aria-selected', 'true')
      else node.removeAttribute('aria-selected')
    }
  }
  return {
    getValue: () => {
      const v = ctx.getProp('value')
      return Array.isArray(v) ? v : v === undefined || v === null || v === '' ? undefined : String(v)
    },
    setValue: (value: string | string[]) => {
      paint(value)
      ctx.emit('changed', { value })
    },
    setOptions: (next: Array<{ label?: string; value?: string; disabled?: boolean }>) => {
      ctx.setProp('options', next)
      const panel = ctx.el?.querySelector('[data-part="panel"]')
      if (!panel) return
      panel.innerHTML = (Array.isArray(next) ? next : [])
        .map((o) => {
          if (!o || typeof o !== 'object') return ''
          const label = String(o['label'] ?? o['value'] ?? '')
          const val = String(o['value'] ?? label)
          return `<div data-part="option" data-value="${esc(val)}" role="option" aria-selected="false"${o['disabled'] === true ? ' data-disabled="true"' : ''}>${esc(label)}</div>`
        })
        .join('')
    },
    open: () => {
      const panel = ctx.el?.querySelector('[data-part="panel"]')
      if (panel) panel.removeAttribute('hidden')
      ctx.el?.querySelector('input[data-part="search"]')?.setAttribute('aria-expanded', 'true')
    },
    close: () => {
      const panel = ctx.el?.querySelector('[data-part="panel"]')
      if (panel) panel.setAttribute('hidden', '')
      ctx.el?.querySelector('input[data-part="search"]')?.setAttribute('aria-expanded', 'false')
    },
    clear: () => {
      paint(ctx.el?.getAttribute('data-multiple') === 'true' ? [] : '')
      ctx.emit('changed', { value: ctx.getProp('value') })
    },
  }
}

// ── Tags input ────────────────────────────────────────────────────────────

export function tagsMethods(ctx: HandleCtx): Record<string, unknown> {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const max = (): number => {
    const m = Number(ctx.getProp('max') ?? Infinity)
    return Number.isFinite(m) && m > 0 ? Math.floor(m) : Infinity
  }
  const paint = (tags: string[]): void => {
    ctx.setProp('value', tags)
    if (!ctx.el) return
    ctx.el.setAttribute('data-value', tags.join(','))
    const entry = ctx.el.querySelector('input[data-part="entry"]')
    for (const node of Array.from(ctx.el.querySelectorAll('[data-part="tag"]'))) node.remove()
    for (const tag of tags) {
      const span = document.createElement('span')
      span.setAttribute('data-part', 'tag')
      span.setAttribute('data-tag', tag)
      span.innerHTML = `${esc(tag)}<button type="button" data-part="tag-remove" aria-label="Remove">×</button>`
      if (entry) ctx.el.insertBefore(span, entry)
      else ctx.el.appendChild(span)
    }
  }
  return {
    getValue: () => {
      const v = ctx.getProp('value')
      return Array.isArray(v) ? v.map(String) : []
    },
    setValue: (tags: string[]) => {
      const next = (Array.isArray(tags) ? tags : []).map(String).filter((t) => t !== '').slice(0, max())
      paint(next)
      ctx.emit('changed', { value: next })
    },
    add: (tag: string) => {
      const cur = (ctx.getProp('value') as string[] | undefined) ?? []
      const clean = String(tag ?? '').trim()
      if (clean === '' || cur.length >= max() || cur.includes(clean)) return false
      const next = [...cur, clean]
      paint(next)
      ctx.emit('changed', { value: next })
      return true
    },
    removeAt: (indexOrTag: number | string) => {
      const cur = ((ctx.getProp('value') as string[] | undefined) ?? []).map(String)
      const next =
        typeof indexOrTag === 'number' ? cur.filter((_, i) => i !== indexOrTag) : cur.filter((t) => t !== String(indexOrTag))
      paint(next)
      ctx.emit('changed', { value: next })
    },
    clear: () => {
      paint([])
      ctx.emit('changed', { value: [] })
    },
  }
}

// ── Rating ────────────────────────────────────────────────────────────────

export function ratingMethods(ctx: HandleCtx): Record<string, unknown> {
  const max = (): number => {
    const m = Number(ctx.getProp('max') ?? 5)
    return Number.isFinite(m) && m >= 1 ? Math.min(10, Math.floor(m)) : 5
  }
  const paint = (value: number): void => {
    const v = Math.max(0, Math.min(max(), Math.floor(Number(value) || 0)))
    ctx.setProp('value', v)
    if (!ctx.el) return
    ctx.el.setAttribute('data-value', String(v))
    for (const star of Array.from(ctx.el.querySelectorAll('[data-part="star"]'))) {
      const i = Number(star.getAttribute('data-star') ?? 0)
      const on = i <= v
      star.setAttribute('data-on', on ? 'true' : 'false')
      star.setAttribute('aria-checked', on ? 'true' : 'false')
    }
  }
  return {
    getValue: () => Number(ctx.getProp('value') ?? 0),
    setValue: (value: number) => {
      paint(Number(value))
      ctx.emit('changed', { value: Number(ctx.getProp('value') ?? 0) })
    },
    clear: () => {
      paint(0)
      ctx.emit('changed', { value: 0 })
    },
  }
}

// ── Editable ──────────────────────────────────────────────────────────────

export function editableMethods(ctx: HandleCtx): Record<string, unknown> {
  const paint = (editing: boolean, draft?: string): void => {
    ctx.setProp('editing', editing)
    if (!ctx.el) return
    ctx.el.setAttribute('data-editing', editing ? 'true' : 'false')
    const preview = ctx.el.querySelector('[data-part="preview"]')
    const editor = ctx.el.querySelector('input[data-part="editor"]') as HTMLInputElement | null
    if (preview) {
      if (editing) preview.setAttribute('hidden', '')
      else preview.removeAttribute('hidden')
    }
    if (editor) {
      if (editing) {
        editor.removeAttribute('hidden')
        if (draft !== undefined) editor.value = draft
        editor.focus?.()
        editor.select?.()
      } else {
        editor.setAttribute('hidden', '')
      }
    }
  }
  const commit = (value: string): void => {
    ctx.setProp('value', value)
    if (ctx.el) {
      ctx.el.setAttribute('data-value', value)
      const preview = ctx.el.querySelector('[data-part="preview"]')
      if (preview) preview.textContent = value
    }
    paint(false)
    ctx.emit('changed', { value })
    ctx.emit('submitted', { value })
  }
  return {
    getValue: () => String(ctx.getProp('value') ?? ''),
    setValue: (value: string) => commit(String(value ?? '')),
    edit: () => paint(true, String(ctx.getProp('value') ?? '')),
    submit: () => {
      const editor = ctx.el?.querySelector('input[data-part="editor"]') as HTMLInputElement | null
      commit(editor ? editor.value : String(ctx.getProp('value') ?? ''))
    },
    cancel: () => {
      paint(false)
      ctx.emit('cancelled', {})
    },
    isEditing: () => ctx.el?.getAttribute('data-editing') === 'true',
  }
}

// ── File upload ───────────────────────────────────────────────────────────

export function fileMethods(ctx: HandleCtx): Record<string, unknown> {
  const entry = (): HTMLInputElement | null => ctx.el?.querySelector('input[data-part="file-input"]') as HTMLInputElement | null
  const snapshot = (): Array<{ name: string; size: number; type: string }> => {
    const input = entry()
    const files = input?.files ? Array.from(input.files) : []
    return files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
  }
  const paint = (): void => {
    if (!ctx.el) return
    const list = ctx.el.querySelector('[data-part="file-list"]')
    if (!list) return
    const files = snapshot()
    list.innerHTML = files
      .map(
        (f) =>
          `<div data-part="file" data-name="${f.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}">` +
          `<span data-part="file-name">${f.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>` +
          `<span data-part="file-size">${f.size} B</span></div>`,
      )
      .join('')
  }
  return {
    getFiles: () => snapshot(),
    clear: () => {
      const input = entry()
      if (input) input.value = ''
      paint()
      ctx.emit('changed', { files: [] })
    },
    browse: () => entry()?.click?.(),
    refresh: () => {
      paint()
      ctx.emit('changed', { files: snapshot() })
    },
  }
}

// ── Pin input ─────────────────────────────────────────────────────────────

export function pinInputMethods(ctx: HandleCtx): Record<string, unknown> {
  const cells = (): HTMLInputElement[] =>
    Array.from(ctx.el?.querySelectorAll('input[data-part="cell"]') ?? []) as HTMLInputElement[]
  const read = (): string => cells().map((c) => c.value).join('')
  const paint = (value: string): void => {
    ctx.setProp('value', value)
    if (!ctx.el) return
    ctx.el.setAttribute('data-value', value)
    const list = cells()
    list.forEach((c, i) => {
      const ch = value[i] ?? ''
      if (c.value !== ch) c.value = ch
    })
  }
  return {
    getValue: () => read(),
    setValue: (value: string) => {
      const v = String(value ?? '')
      paint(v)
      ctx.emit('changed', { value: v })
    },
    clear: () => {
      paint('')
      ctx.emit('changed', { value: '' })
    },
    focus: (index?: number) => {
      const list = cells()
      const target = list[typeof index === 'number' ? index : 0]
      target?.focus?.()
    },
  }
}

// ── Slider ────────────────────────────────────────────────────────────────

export function sliderMethods(ctx: HandleCtx): Record<string, unknown> {
  const bounds = (): { min: number; max: number; step: number } => ({
    min: Number(ctx.getProp('min') ?? 0),
    max: Number(ctx.getProp('max') ?? 100),
    step: Number(ctx.getProp('step') ?? 1) || 1,
  })
  const clamp = (v: number): number => {
    const { min, max, step } = bounds()
    const c = Math.max(min, Math.min(max, Number.isFinite(v) ? v : min))
    return Math.max(min, Math.min(max, Math.round((c - min) / step) * step + min))
  }
  const paint = (v: number): void => {
    ctx.setProp('value', v)
    if (!ctx.el) return
    ctx.el.setAttribute('data-value', String(v))
    const { min, max } = bounds()
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0
    const fill = ctx.el.querySelector('[data-part="fill"]')
    if (fill) (fill as HTMLElement).style.width = `${Math.round(pct * 10) / 10}%`
    const out = ctx.el.querySelector('[data-part="value"]')
    if (out) out.textContent = String(v)
    const input = ctx.el.querySelector('input[type="range"]') as HTMLInputElement | null
    if (input && input.value !== String(v)) input.value = String(v)
  }
  const current = (): number => {
    const attr = ctx.el?.getAttribute('data-value')
    if (attr !== null && attr !== undefined && attr !== '') return Number(attr)
    return Number(ctx.getProp('value') ?? ctx.getProp('min') ?? 0)
  }
  return {
    getValue: () => current(),
    setValue: (v: number) => {
      const next = clamp(Number(v))
      paint(next)
      ctx.emit('changed', { value: next })
    },
    increment: (delta?: number) => {
      const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : bounds().step
      const next = clamp(current() + d)
      paint(next)
      ctx.emit('changed', { value: next })
    },
    decrement: (delta?: number) => {
      const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : bounds().step
      const next = clamp(current() - d)
      paint(next)
      ctx.emit('changed', { value: next })
    },
    setStep: (step: number) => {
      ctx.setProp('step', step)
      const next = clamp(current())
      paint(next)
      ctx.emit('changed', { value: next })
    },
    setSize: (size: string) => {
      ctx.setProp('size', size)
      ctx.el?.setAttribute('data-prop-size', String(size))
    },
  }
}

// ── Select ──────────────────────────────────────────────────────────────────

export function selectMethods(ctx: HandleCtx): Record<string, unknown> {
  const native = (): HTMLSelectElement | null =>
    ctx.el?.tagName === 'SELECT' ? (ctx.el as HTMLSelectElement) : null
  const composite = (): HTMLElement | null => ctx.el?.querySelector('[data-part="value"]')?.parentElement ?? null

  const values = (): string[] => {
    const n = native()
    if (n) {
      if (n.multiple) return Array.from(n.selectedOptions).map((o) => o.value)
      return n.value ? [n.value] : []
    }
    return Array.from(ctx.el?.querySelectorAll<HTMLElement>('[data-part="option"][aria-selected="true"]') ?? []).map((o) =>
      o.getAttribute('data-value') ?? '',
    )
  }

  const setValue = (value: string | string[]): void => {
    const wanted = new Set(Array.isArray(value) ? value.map(String) : [String(value)])
    ctx.setProp('value', value)
    const n = native()
    if (n) {
      for (const o of Array.from(n.options)) o.selected = wanted.has(o.value)
      ctx.emit('changed', { value: n.value })
      return
    }
    for (const o of Array.from(ctx.el?.querySelectorAll<HTMLElement>('[data-part="option"]') ?? [])) {
      o.setAttribute('aria-selected', wanted.has(o.getAttribute('data-value') ?? '') ? 'true' : 'false')
    }
    const label = ctx.el?.querySelector('[data-part="value"]')
    if (label) {
      const selected = Array.from(ctx.el?.querySelectorAll<HTMLElement>('[data-part="option"][aria-selected="true"]') ?? [])
      label.textContent = selected.map((o) => o.getAttribute('data-value') ?? '').join(', ')
    }
    ctx.emit('changed', { value: Array.from(wanted) })
  }

  const setOpen = (open: boolean): void => {
    ctx.setProp('isOpen', open)
    ctx.el?.setAttribute('data-open', open ? 'true' : 'false')
    const panel = ctx.el?.querySelector('[data-part="options"]')
    if (panel) {
      if (open) panel.removeAttribute('hidden')
      else panel.setAttribute('hidden', '')
    }
    const trigger = ctx.el?.querySelector('[data-part="control"]')
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
  }

  return {
    select: (value: string) => setValue(value),
    deselect: (value: string) => setValue(values().filter((v) => v !== value)),
    clear: () => setValue(''),
    getValue: () => (values().length > 1 ? values() : values()[0]),
    getValues: values,
    isOpen: () => ctx.el?.getAttribute('data-open') === 'true',
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(ctx.el?.getAttribute('data-open') !== 'true'),
    setOptions: (options: Array<{ label: string; value: string; disabled?: boolean }>) => {
      ctx.setProp('options', options)
      const n = native()
      if (n) {
        n.innerHTML = options
          .map((o) => `<option value="${o.value}"${o.disabled ? ' disabled' : ''}>${o.label}</option>`)
          .join('')
        return
      }
      const list = ctx.el?.querySelector('[data-part="options"]')
      if (list) {
        list.innerHTML = options
          .map(
            (o) =>
              `<div data-part="option" data-value="${o.value}" role="option" aria-selected="false"${o.disabled ? ' data-disabled="true"' : ''}><span data-part="option-label">${o.label}</span></div>`,
          )
          .join('')
      }
    },
  }
}

// ── Form ────────────────────────────────────────────────────────────────────

export function formMethods(ctx: HandleCtx): Record<string, unknown> {
  const field = (name: string): HTMLElement | null =>
    ctx.el?.querySelector<HTMLElement>(`[name="${CSS.escape(String(name))}"]`) ?? null

  const readValue = (name: string): unknown => {
    const f = field(name) as (HTMLInputElement & { checked?: boolean }) | null
    if (!f) return undefined
    if (f.type === 'checkbox') return f.checked
    if (f.type === 'radio') return f.checked ? f.value : undefined
    if (f.type === 'number') {
      if (f.value === '') return null
      const n = parseFloat(f.value)
      return Number.isNaN(n) ? f.value : n
    }
    return f.value
  }

  const values = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const f of Array.from(ctx.el?.querySelectorAll<HTMLElement>('[name]') ?? [])) {
      const n = f.getAttribute('name')
      if (!n) continue
      const v = readValue(n)
      if (v !== undefined) out[n] = v
    }
    return out
  }

  const setValue = (name: string, value: unknown): void => {
    const f = field(name) as (HTMLInputElement & { checked?: boolean }) | null
    if (!f) return
    if (f.type === 'checkbox' || f.type === 'radio') f.checked = Boolean(value)
    else f.value = value === null || value === undefined ? '' : String(value)
    ctx.setProp('values', { ...values(), [name]: value })
  }

  const setError = (name: string, error: string | null): void => {
    const f = field(name)
    if (!f) return
    f.setAttribute('aria-invalid', error ? 'true' : 'false')
    const existing = f.parentElement?.querySelector('[data-part="error"]')
    if (error) {
      if (existing) existing.textContent = error
      else {
        const div = document.createElement('div')
        div.setAttribute('data-part', 'error')
        div.setAttribute('role', 'alert')
        div.textContent = error
        f.parentElement?.appendChild(div)
      }
    } else {
      existing?.remove()
    }
  }

  const setSubmitting = (on: boolean): void => {
    ctx.setProp('isSubmitting', on)
    ctx.el?.setAttribute('data-submitting', on ? 'true' : 'false')
    for (const b of Array.from(ctx.el?.querySelectorAll<HTMLButtonElement>('button[type="submit"],[data-part="submit"]') ?? [])) {
      b.disabled = on
    }
  }

  return {
    getValue: readValue,
    setValue,
    getValues: values,
    setValues: (next: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(next ?? {})) setValue(k, v)
    },
    // `getField`/`setField` are declared on FormHandle; same as the value pair,
    // returning the field's element so a caller can reach the control itself.
    getField: (name: string) => field(name),
    setField: setValue,
    setError,
    getError: (name: string) => field(name)?.parentElement?.querySelector('[data-part="error"]')?.textContent ?? null,
    clearError: (name: string) => setError(name, null),
    clearAllErrors: () => {
      for (const f of Array.from(ctx.el?.querySelectorAll<HTMLElement>('[name]') ?? [])) setError(f.getAttribute('name') ?? '', null)
    },
    reset: () => {
      for (const f of Array.from(ctx.el?.querySelectorAll<HTMLInputElement>('[name]') ?? [])) {
        if (f.type === 'checkbox' || f.type === 'radio') f.checked = false
        else f.value = ''
      }
      ;(formMethods(ctx)['clearAllErrors'] as () => void)()
      ;(ctx.el as HTMLFormElement | null)?.reset()
    },
    isValid: () => {
      const raw = ctx.el?.getAttribute('data-rules')
      if (!raw) return true
      let rules: Record<string, Record<string, unknown>>
      try {
        rules = JSON.parse(raw)
      } catch {
        return true
      }
      const current = values()
      for (const [name, rule] of Object.entries(rules)) {
        const v = current[name]
        const empty = v === undefined || v === null || v === ''
        if (rule['required'] === true && empty) return false
        if (empty) continue
        const s = String(v)
        if (rule['email'] === true && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return false
        if (typeof rule['minLength'] === 'number' && s.length < rule['minLength']) return false
        if (typeof rule['maxLength'] === 'number' && s.length > rule['maxLength']) return false
        if (typeof rule['min'] === 'number' && parseFloat(s) < rule['min']) return false
        if (typeof rule['max'] === 'number' && parseFloat(s) > rule['max']) return false
      }
      return true
    },
    isSubmitting: () => ctx.el?.getAttribute('data-submitting') === 'true',
    setSubmitting,
    /**
     * Applies the declared rules, marking failures. Returns whether the form
     * is valid — the same contract as `validate(schemaOrRules?)`, which the
     * SDK allows an override schema for.
     */
    validate: (schemaOrRules?: unknown): boolean => {
      const rules = (schemaOrRules as Record<string, Record<string, unknown>> | undefined) ?? (() => {
        const raw = ctx.el?.getAttribute('data-rules')
        if (!raw) return undefined
        try {
          return JSON.parse(raw) as Record<string, Record<string, unknown>>
        } catch {
          return undefined
        }
      })()
      ;(formMethods(ctx)['clearAllErrors'] as () => void)()
      if (!rules) return true
      const current = values()
      let ok = true
      for (const [name, rule] of Object.entries(rules)) {
        const v = current[name]
        const empty = v === undefined || v === null || v === ''
        const fail = (msg: string): void => {
          setError(name, msg)
          ok = false
        }
        if (rule['required'] === true && empty) {
          fail((rule['message'] as string) ?? `${name} is required`)
          continue
        }
        if (empty) continue
        const s = String(v)
        if (typeof rule['minLength'] === 'number' && s.length < rule['minLength']) fail((rule['message'] as string) ?? `${name} must be at least ${rule['minLength']} characters`)
        else if (typeof rule['maxLength'] === 'number' && s.length > rule['maxLength']) fail((rule['message'] as string) ?? `${name} must be at most ${rule['maxLength']} characters`)
        else if (rule['email'] === true && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) fail((rule['message'] as string) ?? `${name} must be a valid email`)
        else if (typeof rule['min'] === 'number' && parseFloat(s) < rule['min']) fail((rule['message'] as string) ?? `${name} must be at least ${rule['min']}`)
        else if (typeof rule['max'] === 'number' && parseFloat(s) > rule['max']) fail((rule['message'] as string) ?? `${name} must be at most ${rule['max']}`)
      }
      ctx.el?.setAttribute('data-valid', ok ? 'true' : 'false')
      return ok
    },
    submit: () => {
      const form = ctx.el as HTMLFormElement | null
      if (!form) return
      if (typeof form.requestSubmit === 'function') form.requestSubmit()
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    },
    focusFirst: () => ctx.el?.querySelector<HTMLElement>('[name]:not([disabled])')?.focus(),
  }
}

// ── Label ───────────────────────────────────────────────────────────────────

export function labelMethods(ctx: HandleCtx): Record<string, unknown> {
  return {
    setLabel: (text: string) => {
      ctx.setProp('label', text)
      setText(ctx, text)
    },
    setFor: (target: string) => {
      ctx.setProp('for', target)
      if (ctx.el) ctx.el.setAttribute('for', String(target))
    },
  }
}

const BY_KIND: Record<string, (ctx: HandleCtx) => Record<string, unknown>> = {
  button: buttonMethods,
  input: inputMethods,
  textarea: inputMethods,
  select: selectMethods,
  toggle: toggleMethods,
  switch: toggleMethods,
  checkbox: toggleMethods,
  radio: toggleMethods,
  numberInput: numberInputMethods,
  pinInput: pinInputMethods,
  combobox: comboboxMethods,
  tagsInput: tagsMethods,
  rating: ratingMethods,
  editable: editableMethods,
  fileUpload: fileMethods,
  slider: sliderMethods,
  form: formMethods,
  login: formMethods,
  signup: formMethods,
  label: labelMethods,
}

export function extendInputs(ctx: HandleCtx): void {
  const build = BY_KIND[ctx.kind]
  if (build) extend(ctx, build(ctx))
}
