/**
 * Props and handles for datePicker, radioGroup, pagination, collapsible,
 * carousel, colorPicker, contextMenu and commandPalette.
 *
 * Same shape as every other component: a single object with props and a
 * handle; internals are `data-part`s you style through props. Every one takes
 * the full style surface (`SharedProps` → `StyleProps`).
 */
import type { EventSource, ObjectHandle, TrackOptions } from './handles'
import type { SharedProps } from './props'

// ── datePicker ──────────────────────────────────────────────────────────────

export interface DatePickerProps extends SharedProps {
  /** `YYYY-MM-DD`. */
  value?: string
  /** Earliest selectable date, `YYYY-MM-DD`. */
  min?: string
  /** Latest selectable date, `YYYY-MM-DD`. */
  max?: string
  placeholder?: string
  name?: string
  disabled?: boolean
  /** First column of the calendar. */
  weekStart?: 'sunday' | 'monday'
}

/** Events: `changed` `{ value }`, `opened`, `closed`. */
export interface DatePickerHandle extends ObjectHandle<DatePickerProps> {
  getValue(): string
  /** Sets the date (`YYYY-MM-DD`); anything else clears it. Returns the stored value. */
  setValue(value: string): string
  clear(): void
  open(): void
  close(): void
  isOpen(): boolean
  track(event: string, opts?: TrackOptions): EventSource
}

// ── dateRange ───────────────────────────────────────────────────────────────

export interface DateRangeProps extends SharedProps {
  /** `YYYY-MM-DD`. */
  start?: string
  /** `YYYY-MM-DD`; swapped with start if earlier. */
  end?: string
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  weekStart?: 'sunday' | 'monday'
}

/** First click sets the start, second the end. Events: `changed` `{ start, end, value: 'start..end' }`, `opened`, `closed`. */
export interface DateRangeHandle extends ObjectHandle<DateRangeProps> {
  getValue(): { start: string; end: string }
  setValue(start: string, end: string): { start: string; end: string }
  clear(): void
  open(): void
  close(): void
  isOpen(): boolean
  track(event: string, opts?: TrackOptions): EventSource
}

// ── qrCode ──────────────────────────────────────────────────────────────────

export interface QrCodeProps extends SharedProps {
  /** Text or URL to encode (UTF-8, up to ~2,900 bytes at level L). */
  value?: string
  /** Error correction: L 7%, M 15% (default), Q 25%, H 30% — raised automatically when it fits. */
  ecc?: 'L' | 'M' | 'Q' | 'H'
  /** Module colour (default: the object's text colour). */
  codeColor?: string
  /** Background behind the modules (default white — scanners need contrast). */
  codeBackground?: string
  /** Accessible name (default "QR code"). */
  label?: string
}

/** Size it with `width`/`height` props. */
export interface QrCodeHandle extends ObjectHandle<QrCodeProps> {
  getValue(): string
  setValue(text: string): void
  track(event: string, opts?: TrackOptions): EventSource
}

// ── radioGroup ──────────────────────────────────────────────────────────────

export interface RadioOption {
  label: string
  value?: string
  description?: string
  disabled?: boolean
}

export interface RadioGroupProps extends SharedProps {
  options?: RadioOption[]
  value?: string
  /** Form field name (defaults to one derived from the id). */
  name?: string
  orientation?: 'vertical' | 'horizontal'
  disabled?: boolean
}

/** Events: `changed` `{ value }`. */
export interface RadioGroupHandle extends ObjectHandle<RadioGroupProps> {
  getValue(): string
  setValue(value: string): string
  setOptions(options: RadioOption[]): void
  track(event: string, opts?: TrackOptions): EventSource
}

// ── pagination ──────────────────────────────────────────────────────────────

export interface PaginationProps extends SharedProps {
  /** 1-based current page. */
  page?: number
  /** Total item count — pages = ceil(total / pageSize). */
  total?: number
  pageSize?: number
  /** Page count directly, instead of total/pageSize. */
  pages?: number
  /** Page links shown either side of the current one (0–3). */
  siblings?: number
}

/** Events: `changed` `{ page }`. */
export interface PaginationHandle extends ObjectHandle<PaginationProps> {
  getPage(): number
  getPages(): number
  setPage(page: number): number
  next(): number
  prev(): number
  setTotal(total: number, pageSize?: number): void
  track(event: string, opts?: TrackOptions): EventSource
}

// ── collapsible ─────────────────────────────────────────────────────────────

export interface CollapsibleProps extends SharedProps {
  title?: string
  /** Text body; placed children render in the panel too. */
  content?: string
  open?: boolean
  disabled?: boolean
}

/** Events: `opened`, `closed`. */
export interface CollapsibleHandle extends ObjectHandle<CollapsibleProps> {
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
  place(child: ObjectHandle, placement?: unknown): void
  track(event: string, opts?: TrackOptions): EventSource
}

// ── carousel ────────────────────────────────────────────────────────────────

export interface CarouselItem {
  src?: string
  alt?: string
  title?: string
  caption?: string
}

export interface CarouselProps extends SharedProps {
  /** Image slides; placed children are slides too (and win when present). */
  items?: CarouselItem[]
  /** 0-based starting slide. */
  index?: number
  /** Advance every N ms (paused on hover/focus and for reduced motion). */
  autoplay?: number
  /** Wrap from the last slide to the first (default true). */
  loop?: boolean
}

/** Events: `changed` `{ index }`. */
export interface CarouselHandle extends ObjectHandle<CarouselProps> {
  getIndex(): number
  count(): number
  goTo(index: number): number
  next(): number
  prev(): number
  place(child: ObjectHandle, placement?: unknown): void
  track(event: string, opts?: TrackOptions): EventSource
}

// ── colorPicker ─────────────────────────────────────────────────────────────

export interface ColorPickerProps extends SharedProps {
  /** `#rrggbb`. */
  value?: string
  /** Preset colours shown as swatches. */
  swatches?: string[]
  name?: string
  disabled?: boolean
}

/** Events: `changed` `{ value }` (on commit, not while dragging). */
export interface ColorPickerHandle extends ObjectHandle<ColorPickerProps> {
  getValue(): string
  setValue(value: string): string
  track(event: string, opts?: TrackOptions): EventSource
}

// ── menus ───────────────────────────────────────────────────────────────────

export interface MenuItemSpec {
  label?: string
  value?: string
  disabled?: boolean
  separator?: boolean
  /** Shown right-aligned, e.g. `⌘K`. */
  shortcut?: string
  /** Groups items under a heading (command palette). */
  group?: string
}

export interface ContextMenuProps extends SharedProps {
  items?: MenuItemSpec[]
  /** Text for the right-click area when no children are placed. */
  content?: string
}

/** Right-click inside the object opens the menu. Events: `opened`, `selected` `{ value }`, `closed`. */
export interface ContextMenuHandle extends ObjectHandle<ContextMenuProps> {
  /** Open at viewport coordinates (defaults to the object's corner). */
  open(x?: number, y?: number): void
  close(): void
  isOpen(): boolean
  setItems(items: MenuItemSpec[]): void
  place(child: ObjectHandle, placement?: unknown): void
  track(event: string, opts?: TrackOptions): EventSource
}

export interface CommandPaletteProps extends SharedProps {
  items?: MenuItemSpec[]
  placeholder?: string
  /** Keyboard shortcut that toggles it, e.g. `mod+k` (Ctrl or ⌘). Default `mod+k`. */
  hotkey?: string
  open?: boolean
  emptyText?: string
}

/** Type to filter, arrows to move, Enter to pick. Events: `opened`, `selected` `{ value, label }`, `closed`. */
export interface CommandPaletteHandle extends ObjectHandle<CommandPaletteProps> {
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
  setItems(items: MenuItemSpec[]): void
  track(event: string, opts?: TrackOptions): EventSource
}
