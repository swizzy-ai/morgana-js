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

function buttonMethods(ctx: HandleCtx): Record<string, unknown> {
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

function inputMethods(ctx: HandleCtx): Record<string, unknown> {
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

function toggleMethods(ctx: HandleCtx): Record<string, unknown> {
  const setChecked = (on: boolean): void => {
    ctx.setProp('checked', on)
    if (!ctx.el) return
    const track = ctx.el.querySelector('[data-part="track"]')
    ctx.el.setAttribute('data-checked', on ? 'true' : 'false')
    if (track) {
      track.setAttribute('aria-checked', on ? 'true' : 'false')
      track.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
    const input = ctx.el.querySelector('input[type="checkbox"],input[type="radio"]') as HTMLInputElement | null
    if (input) input.checked = on
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

// ── Select ──────────────────────────────────────────────────────────────────

function selectMethods(ctx: HandleCtx): Record<string, unknown> {
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

function formMethods(ctx: HandleCtx): Record<string, unknown> {
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

function labelMethods(ctx: HandleCtx): Record<string, unknown> {
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
  form: formMethods,
  login: formMethods,
  signup: formMethods,
  label: labelMethods,
}

export function extendInputs(ctx: HandleCtx): void {
  const build = BY_KIND[ctx.kind]
  if (build) extend(ctx, build(ctx))
}
