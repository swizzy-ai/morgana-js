// set(x) — what a thing says, holds or does. `make` is how it looks; `set` is
// everything else. Each word returns the same sentence.
import type { ObjectHandle } from '@studiomorgana/sdk'

type Handle = ObjectHandle<any>

/** The prop `to(value)` sets, per kind. */
const MAIN: Record<string, string> = {
  text: 'content', button: 'label', input: 'value', textarea: 'value', link: 'href',
  image: 'src', list: 'data', table: 'data', progress: 'value', checkbox: 'checked',
  switch: 'checked', toggle: 'checked', select: 'value',
}

export class SetTo {
  constructor(private readonly h: Handle) {}

  private put(prop: string, value: unknown): this {
    this.h.set(prop, value)
    return this
  }

  /** Its main value: a text's words, a button's label, an input's value, a list's items… */
  to(value: unknown): this { return this.put(MAIN[this.h.type] ?? 'content', value) }
  /** Follow a value live: a state path, or a server object's state. */
  follows(source: string): this { this.h.bind(source); return this }
  /** Its words follow a state path. */
  textFrom(path: string): this { this.h.bind(path, { prop: 'content' } as never); return this }
  /** Its label follows a state path. */
  labelFrom(path: string): this { this.h.bind(path, { prop: 'label' } as never); return this }
  /** A field that shows a state path and writes it as you type. */
  valueFrom(path: string): this { this.h.bind(path, { prop: 'value' } as never); return this }
  /** Its placeholder follows a state path. */
  placeholderFrom(path: string): this { this.h.bind(path, { prop: 'placeholder' } as never); return this }
  /** Its image follows a state path. */
  imageFrom(path: string): this { this.h.bind(path, { prop: 'src' } as never); return this }
  /** A progress bar whose value follows a state path. */
  progressFrom(path: string): this { this.h.bind(path, { prop: 'value' } as never); return this }
  /** Disabled while a state path is true. */
  disabledFrom(path: string): this { this.h.bind(path, { prop: 'disabled' } as never); return this }

  // ---- words ----
  text(words: string): this { return this.put('content', words) }
  label(words: string): this { return this.put('label', words) }
  icon(name: string, side: 'left' | 'right' = 'left'): this { this.put('icon', name); return this.put('iconPosition', side) }
  /** A button that sends the form it sits in. */
  submits(): this { return this.put('type', 'submit') }

  // ---- inputs ----
  value(value: unknown): this { return this.put('value', value) }
  placeholder(words: string): this { return this.put('placeholder', words) }
  type(kind: 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url' | 'date' | 'time'): this { return this.put('type', kind) }
  name(name: string): this { return this.put('name', name) }
  required(): this { return this.put('required', true) }
  optional(): this { return this.put('required', false) }
  error(message: string): this { return this.put('error', message) }
  noError(): this { return this.put('error', null) }
  min(value: number | string): this { return this.put('min', value) }
  max(value: number | string): this { return this.put('max', value) }

  // ---- links and images ----
  link(address: string): this { return this.put('href', address) }
  newTab(): this { return this.put('target', '_blank') }
  image(source: string): this { return this.put('src', source) }
  description(words: string): this { return this.put('alt', words) }

  // ---- lists ----
  items(records: unknown[]): this { return this.put('data', records) }
  emptyText(words: string): this { return this.put('emptyText', words) }

  // ---- progress, choices ----
  progress(value: number): this { return this.put('value', value) }
  outOf(max: number): this { return this.put('max', max) }
  checked(): this { return this.put('checked', true) }
  unchecked(): this { return this.put('checked', false) }
  options(options: unknown[]): this { return this.put('options', options) }
  selected(value: unknown): this { return this.put('value', value) }

  // ---- state ----
  disabled(): this { return this.put('disabled', true) }
  enabled(): this { return this.put('disabled', false) }
  hidden(): this { return this.put('hidden', true) }
  visible(): this { return this.put('hidden', false) }
}
