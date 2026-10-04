/**
 * Object prop types — the airtight surface for `ctx.objects.<type>({...})` and
 * `obj.set('prop', ...)` (FRAMEWORK.md §3).
 *
 * Each interface is the typed prop vocabulary for one object family.
 */

// ── Token vocabularies ───────────────────────────────────────────────────────
//
// The lists below are the single source of truth for these tokens: the type, the
// CSS resolver and the runtime template all read them, so a token cannot be
// declared in one place and missing from another.

import type { Dim, GridSpec, OverflowToken } from './layout'

/** StyleResolver layout tokens (container direction). */
export const LAYOUT_TOKENS = ['col', 'row', 'grid', 'stacked', 'none', 'horizontal', 'vertical', 'h', 'v'] as const
export type LayoutToken = (typeof LAYOUT_TOKENS)[number]
/** StyleResolver align tokens (cross-axis). */
export const ALIGN_TOKENS = ['start', 'center', 'end', 'stretch', 'baseline', 'left', 'right'] as const
export type AlignToken = (typeof ALIGN_TOKENS)[number]
/** StyleResolver justify tokens (main-axis). */
export const JUSTIFY_TOKENS = ['start', 'center', 'end', 'between', 'around', 'evenly'] as const
export type JustifyToken = (typeof JUSTIFY_TOKENS)[number]
/** StyleResolver surfaceTokens keys. */
export const SURFACE_TOKENS = [
  'base', 'neutral', 'card', 'panel', 'muted', 'danger', 'success', 'brand', 'accent',
  'primary', 'secondary', 'dark', 'glass', 'glass-card', 'panel-elevated', 'card-interactive', 'hero-gradient', 'dark-glass',
] as const
export type SurfaceToken = (typeof SURFACE_TOKENS)[number]
/** StyleResolver radiusScale keys. */
export const RADIUS_TOKENS = ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'] as const
export type RadiusToken = (typeof RADIUS_TOKENS)[number]
/** InputObject input types. */
export const INPUT_TYPES = ['text', 'password', 'email', 'number', 'search', 'tel', 'url', 'date', 'time', 'color', 'range', 'hidden'] as const
export type InputTypeToken = (typeof INPUT_TYPES)[number]
/** ButtonObject visual variants. */
export const BUTTON_VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'success'] as const
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]
/** LinkObject target values. */
export const LINK_TARGETS = ['_self', '_blank', '_parent', '_top'] as const
export type LinkTarget = (typeof LINK_TARGETS)[number]
/** PageObject viewport modes. */
export const PAGE_VIEWPORTS = ['fill', 'hug'] as const
export type PageViewport = (typeof PAGE_VIEWPORTS)[number]
/** TextObject align values. */
export const TEXT_ALIGNS = ['start', 'center', 'end', 'left', 'right', 'justify'] as const
export type TextAlignToken = (typeof TEXT_ALIGNS)[number]

/**
 * A breakpoint SHAPE — how a named breakpoint gates the viewport.
 *
 * No hardcoded widths and no raw media-query strings: the shape is declared in
 * the shape phase (`config.on: 'compile'` actions, via `ctx.ui.breakpoints`)
 * using optional `minWidth`/`maxWidth` bounds in px. The breakpoint renderer
 * turns a shape into a media query automatically:
 *
 *   { label: 'tablet', minWidth: 640, maxWidth: 1023 }
 *     → @media (min-width: 640px) and (max-width: 1023px)
 *
 * A shape with no bounds (an empty/omitted shape) is the "base" lane — it
 * applies at every viewport. Transformers and breakpoints are unrelated; this
 * type exists solely for the breakpoint registry consumed by
 * `ObjectHandle.setWithBreakpoint`.
 */
export interface BreakpointShape {
  /** Inclusive lower bound in px. Omitted means no lower bound. */
  minWidth?: number
  /** Inclusive upper bound in px. Omitted means no upper bound. */
  maxWidth?: number
  /** Human-readable label. */
  label?: string
}

/** Props every rendered object exposes (escape hatches + tags). */
export interface SharedProps {
  style?: string
  class?: string
  tags?: unknown
}

// ── Per-object prop maps ────────────────────────────────────────────────────

/** Layout + chrome props shared by all containers (BoxObject, Section, Link…). */
export interface BoxProps extends SharedProps {
  layout?: LayoutToken
  align?: AlignToken
  justify?: JustifyToken
  gap?: Dim
  pad?: Dim
  width?: Dim
  height?: Dim
  /** Minimum / maximum sizes (units or named measures — never raw CSS). */
  minW?: Dim
  minH?: Dim
  maxW?: Dim
  maxH?: Dim
  /** Allow flex wrapping for `row` layouts. */
  wrap?: boolean
  /** Overflow behavior of the surface. */
  overflow?: OverflowToken
  grow?: number
  surface?: SurfaceToken
  radius?: string | number // token | px number | raw CSS
  border?: boolean | string
  /** Per-side borders — each side accepts a width in units (number) or raw CSS. */
  borderTop?: boolean | string | number
  borderBottom?: boolean | string | number
  borderLeft?: boolean | string | number
  borderRight?: boolean | string | number
  /** Border color + width applied to every declared border side. */
  borderColor?: string
  borderWidth?: Dim
  bg?: string
  color?: string
  boxShadow?: string
  /** Stack layer inside the parent surface — base is 0, minus below, plus above. */
  layer?: number
  /** Declarative grid — turns the surface into a CSS-grid container. */
  grid?: GridSpec
}

export interface TextProps extends SharedProps {
  content?: string
  font?: string
  align?: TextAlignToken
  surface?: SurfaceToken
  radius?: string | number
  border?: boolean | string
  borderTop?: boolean | string | number
  borderBottom?: boolean | string | number
  borderLeft?: boolean | string | number
  borderRight?: boolean | string | number
  borderColor?: string
  borderWidth?: Dim
  bg?: string
  color?: string
}

export interface ButtonProps extends SharedProps {
  label?: string
  content?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  variant?: ButtonVariant
  provider?: string
  icon?: string
  iconPosition?: 'left' | 'right'
}

export interface InputProps extends SharedProps {
  value?: string
  placeholder?: string
  type?: InputTypeToken
  name?: string
  min?: string
  max?: string
  step?: string
  disabled?: boolean
  error?: string | null
  icon?: string
  iconPosition?: 'left' | 'right'
}

export interface ImageProps extends SharedProps {
  src?: string
  alt?: string
  width?: string
  height?: string
  fallback?: string
  aspectRatio?: string
  fit?: 'cover' | 'contain' | 'fill' | 'none'
}

export interface LinkProps extends BoxProps {
  href?: string
  target?: LinkTarget
  textDecoration?: string
  icon?: string
  iconPosition?: 'left' | 'right'
}

export interface PageProps extends SharedProps {
  /** The path this page is served at (defaults to `/{name}`). */
  address?: string
  title?: string
  meta?: string
  favicon?: string
  headCSS?: string
  headScript?: string
  isSpa?: boolean
  spaRoute?: string
  spaParent?: string
  spaNested?: boolean
  app?: string
  viewport?: PageViewport
  layer?: number
  theme?: 'light' | 'dark'
  layout?: LayoutToken
}

// ── Table Props & Configuration ─────────────────────────────────────────────

export interface TableColumn {
  key: string
  label: string
  width?: string | number
  sortable?: boolean
  filterable?: boolean
  align?: 'left' | 'center' | 'right'
  variant?: string
  format?: 'text' | 'number' | 'currency' | 'badge' | 'date' | 'progress' | 'boolean' | ((value: any, row: any) => any)
}

export type TablePaginationStyle = 'simple' | 'full' | 'minimal' | 'pills' | 'bordered'

export interface TablePaginationConfig {
  enabled?: boolean
  page: number
  pageSize: number
  total?: number
  pageSizeOptions?: number[]
  style?: TablePaginationStyle
  position?: 'bottom' | 'top' | 'both'
  showTotal?: boolean
}

export interface TableSortConfig {
  key?: string
  direction?: 'asc' | 'desc'
}

export interface TableFilterConfig {
  search?: string
  columns?: Record<string, any>
}

export interface TableSelectionConfig {
  mode?: 'none' | 'single' | 'multiple'
  selectedKeys?: string[]
}

export type TableVariant = 'default' | 'striped' | 'bordered' | 'cards' | 'elevated' | 'glass' | 'compact'
export type TableDensity = 'compact' | 'normal' | 'relaxed'

export interface TableProps extends SharedProps {
  columns?: TableColumn[]
  rows?: Array<Record<string, any>>
  data?: Array<Record<string, any>>
  pagination?: TablePaginationConfig
  sorting?: TableSortConfig
  filtering?: TableFilterConfig
  selection?: TableSelectionConfig
  variant?: TableVariant
  density?: TableDensity
  stickyHeader?: boolean
  emptyText?: string
  loading?: boolean
  caption?: string
}

// ── Dialog / Modal Props ───────────────────────────────────────────────────

export interface DialogProps extends SharedProps {
  open?: boolean
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  variant?: 'default' | 'danger' | 'drawer' | 'confirm'
  dismissible?: boolean
  confirmLabel?: string
  cancelLabel?: string
  showFooter?: boolean
}

// ── Select / Dropdown Props ────────────────────────────────────────────────

export interface SelectOption {
  label: string
  value: string
  icon?: string
  description?: string
  disabled?: boolean
  badge?: string
}

export interface SelectProps extends SharedProps {
  options?: SelectOption[]
  value?: string | string[]
  placeholder?: string
  multiple?: boolean
  searchable?: boolean
  clearable?: boolean
  disabled?: boolean
  variant?: 'default' | 'outline' | 'ghost' | 'pill'
  isOpen?: boolean
}

// ── Tabs Props ─────────────────────────────────────────────────────────────

export interface TabsItem {
  key: string
  label: string
  content?: any
  icon?: string
  badge?: string | number
  disabled?: boolean
}

export type TabsVariant = 'line' | 'pill' | 'enclosed' | 'bordered' | 'pills'
export type TabsOrientation = 'horizontal' | 'vertical'

export interface TabsProps extends SharedProps {
  items?: TabsItem[]
  activeKey?: string
  variant?: TabsVariant
  orientation?: TabsOrientation
}

// ── Badge Props ────────────────────────────────────────────────────────────

export interface BadgeProps extends SharedProps {
  label?: string
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline' | 'pill'
  icon?: string
  removable?: boolean
  dot?: boolean
}

// ── Alert Props ────────────────────────────────────────────────────────────

export interface AlertProps extends SharedProps {
  title?: string
  description?: string
  variant?: 'info' | 'success' | 'warning' | 'danger'
  dismissible?: boolean
  icon?: string
  visible?: boolean
  actionLabel?: string
}

// ── Toggle / Switch Props ──────────────────────────────────────────────────

export interface ToggleProps extends SharedProps {
  checked?: boolean
  label?: string
  description?: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  kind?: 'switch' | 'checkbox'
}

// ── Form Props ─────────────────────────────────────────────────────────────

export interface FormProps extends SharedProps {
  values?: Record<string, any>
  errors?: Record<string, string | null>
  isSubmitting?: boolean
  isValid?: boolean
  layout?: 'vertical' | 'horizontal' | 'inline'
}

// ── Progress Props ─────────────────────────────────────────────────────────

export interface ProgressProps extends SharedProps {
  value?: number
  max?: number
  showLabel?: boolean
  variant?: 'emerald' | 'sky' | 'amber' | 'rose' | 'purple'
  striped?: boolean
  animated?: boolean
}

/** Container inclusion — the concrete typed handle kinds available today. */
export type KnownObjectHandleProps =
  | BoxProps
  | TextProps
  | ButtonProps
  | InputProps
  | ImageProps
  | LinkProps
  | PageProps
  | TableProps
  | DialogProps
  | SelectProps
  | TabsProps
  | BadgeProps
  | AlertProps
  | ToggleProps
  | FormProps
  | ProgressProps