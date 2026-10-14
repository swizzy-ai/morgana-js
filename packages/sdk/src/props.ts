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
export const LAYOUT_TOKENS = ['col', 'column', 'row', 'grid', 'stacked', 'none', 'horizontal', 'vertical', 'h', 'v'] as const
export type LayoutToken = (typeof LAYOUT_TOKENS)[number]
/**
 * The type scale: each word sets size, weight, line height and tracking.
 * Heading words use the `headings` font and `mono` the `mono` font when
 * `config.text` names them. Words added with `transformers.fonts` work too.
 */
export const FONT_TOKENS = [
  'display-lg', 'display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'headline', 'title', 'subtitle',
  'body-lg', 'body', 'body-me', 'body-sm', 'caption', 'mono',
] as const
export type FontToken = (typeof FONT_TOKENS)[number]

export const FONT_WEIGHTS = {
  thin: 100, extralight: 200, light: 300, regular: 400, normal: 400,
  medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
} as const
export type FontWeightWord = keyof typeof FONT_WEIGHTS

export const TRACKING = { tighter: '-0.05em', tight: '-0.025em', normal: '0em', wide: '0.025em', wider: '0.05em', widest: '0.1em' } as const
export type TrackingWord = keyof typeof TRACKING

/**
 * Fonts the project declares in `config.fonts`. Augmented by the generated
 * `.morgana/fonts.d.ts`, so `family` only accepts a declared name.
 */
export interface FontRegistry {}
export type FontFamilyName = [keyof FontRegistry] extends [never] ? string : keyof FontRegistry & string

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

/** Theme colour names — they follow the object's theme and colour mode. */
export type ThemeColorToken =
  | 'background' | 'foreground' | 'card' | 'card-foreground' | 'muted' | 'muted-foreground' | 'border'
  | 'primary' | 'primary-foreground' | 'accent' | 'accent-foreground' | 'danger' | 'success' | 'warning'

/** A colour: a theme token, a named colour, or any CSS colour. */
export type ColorValue = ThemeColorToken | (string & {})

/**
 * The visual props every object accepts — the whole stylable surface, as
 * props. Values resolve through the same tokens `make()` uses.
 */
export interface VisualProps {
  width?: Dim
  height?: Dim
  minW?: Dim
  minH?: Dim
  maxW?: Dim
  maxH?: Dim
  pad?: Dim
  gap?: Dim
  /** Background: a colour, a theme token, `gradient:<name>`, or CSS. */
  bg?: ColorValue
  color?: ColorValue
  surface?: SurfaceToken
  radius?: string | number
  border?: boolean | string
  borderTop?: boolean | string | number
  borderBottom?: boolean | string | number
  borderLeft?: boolean | string | number
  borderRight?: boolean | string | number
  borderColor?: ColorValue
  borderWidth?: Dim
  boxShadow?: string
  /** Shadow / glow word (`raised`, `floating`, `glow`, …). */
  effect?: string
  opacity?: number | string
  /** A step of the type scale — size, weight, line height and tracking in one word. */
  font?: FontToken | (string & {})
  /** A font declared in `morgana.config.ts` `fonts` (typed by `morgana types`). */
  family?: FontFamilyName
  /** @deprecated Declare the font in `config.fonts` and use `family`. Raw CSS. */
  fontFamily?: string
  fontSize?: Dim
  /** `thin` … `black`, or 100–900. */
  fontWeight?: FontWeightWord | number | (string & {})
  fontStyle?: string
  lineHeight?: string | number
  /** Letter spacing: a word, or em as a number (`0.05`). */
  tracking?: TrackingWord | number
  /** Outlined text: `{ width: 1, color: 'primary' }`. Width in px. */
  stroke?: { width?: number; color?: ColorValue }
  textDecoration?: string
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none'
  cursor?: string
  overflow?: OverflowToken
  /** Smooths state changes: `fast` | `normal` | `slow` | `none` | CSS. */
  transition?: 'fast' | 'normal' | 'slow' | 'none' | (string & {})
}

/** Styles for one interaction state — the same props as the object itself. */
export type StateStyle = VisualProps

/** Visual props plus interaction states, theme and colour mode. */
export interface StyleProps extends VisualProps {
  hover?: StateStyle
  /** Keyboard focus, and focus inside the object. */
  focus?: StateStyle
  /** While pressed. */
  active?: StateStyle
  /** While disabled (`disabled` attribute or prop). */
  disabled?: StateStyle | boolean
  /** A theme for this object and everything inside it: `light`, `dark`, or one you defined. */
  theme?: string
  /** Colour mode for this subtree: `light`, `dark`, or `system` (follow the OS). */
  mode?: 'light' | 'dark' | 'system'
}

/** Design tokens a theme sets. Every built-in component paints from these. */
export interface ThemeTokens {
  background?: string
  foreground?: string
  card?: string
  cardForeground?: string
  muted?: string
  mutedForeground?: string
  border?: string
  primary?: string
  primaryForeground?: string
  accent?: string
  accentForeground?: string
  danger?: string
  success?: string
  warning?: string
  shadow?: string
  fontFamily?: string
}

/** A theme: light tokens, plus overrides for dark mode (brand colours carry over). */
export interface ThemeSpec extends ThemeTokens {
  dark?: ThemeTokens
}

/** Props every rendered object exposes: the style surface plus tags. */
export interface SharedProps extends StyleProps {
  /** @deprecated Style with props; raw CSS is an escape hatch. */
  style?: string
  /** @deprecated Style with props. */
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
  font?: FontToken | (string & {})
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

export interface SliderProps extends SharedProps {
  value?: number
  min?: number
  max?: number
  step?: number
  orientation?: 'horizontal' | 'vertical'
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'outline' | 'solid'
  showValue?: boolean
}

export interface GradientStop {
  color: string
  /** 0-100, '50%', or omitted (evenly spaced). */
  at?: number | string
}

export interface GradientSpec {
  type: 'linear' | 'radial' | 'conic'
  /** Degrees for linear (default 135), position for radial/conic. */
  angle?: number | string
  stops: GradientStop[]
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
  /**
   * How this page is served. `static` prerenders at build time (default),
   * `spa` serves a client-routed shell, `server` renders per request.
   */
  render?: 'static' | 'spa' | 'server'
  /**
   * Who may load this page: `'public'` (default), `'member'` (any signed-in
   * user) or `{ role }`. The host checks the session before serving any HTML.
   */
  access?: 'public' | 'member' | { role: string | string[] }
  /** Where a visitor who may not see the page is sent, e.g. `'login'`. */
  redirect?: string
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

export interface AccordionItem {
  key: string
  title: string
  content?: string
  disabled?: boolean
  defaultOpen?: boolean
}

export interface AccordionProps extends SharedProps {
  /** Items render as trigger/panel pairs when the object has no placed children. */
  items?: AccordionItem[]
  /** Open item keys (controlled mirror — kept in sync by toggle/open/close). */
  value?: string | string[]
  multiple?: boolean
  /** When false, the last open item refuses to close. Default true. */
  collapsible?: boolean
  variant?: 'outline' | 'subtle' | 'enclosed' | 'plain'
  size?: 'sm' | 'md' | 'lg'
}

export interface PopoverProps extends SharedProps {
  title?: string
  content?: string
  triggerLabel?: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  open?: boolean
  closeOnOutside?: boolean
}

export interface DrawerProps extends SharedProps {
  title?: string
  description?: string
  placement?: 'start' | 'end' | 'top' | 'bottom'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  open?: boolean
  dismissible?: boolean
}

export interface ToastProps extends SharedProps {
  position?: 'top' | 'bottom' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'
  /** Default lifetime per toast in ms. 0 = sticky. Default 4000. */
  duration?: number
  /** Cap stacked toasts; oldest dismissed first. Default 5. */
  max?: number
}

export interface DropdownItem {
  label?: string
  value: string
  href?: string
  disabled?: boolean
  active?: boolean
  separator?: boolean
}

export interface DropdownProps extends SharedProps {
  label?: string
  trigger?: string
  items?: DropdownItem[]
  value?: string
  open?: boolean
  /** Close the panel when an item is picked. Default true. */
  closeOnSelect?: boolean
  placement?: string
  disabled?: boolean
}

export interface MenuProps extends DropdownProps {}

export interface TooltipProps extends SharedProps {
  content?: string
  tip?: string
  label?: string
  placement?: string
  visible?: boolean
}

export interface AvatarProps extends SharedProps {
  src?: string
  alt?: string
  name?: string
  initials?: string
  status?: string
  size?: string
  shape?: 'circle' | 'square' | 'rounded'
  ring?: boolean
}

export interface TextareaProps extends SharedProps {
  value?: string
  placeholder?: string
  name?: string
  rows?: number
  cols?: number
  disabled?: boolean
  error?: string | null
}

export interface LabelProps extends SharedProps {
  content?: string
  label?: string
  text?: string
  for?: string
}

export interface NumberInputProps extends SharedProps {
  value?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  variant?: 'outline' | 'subtle' | 'flushed'
  placeholder?: string
  name?: string
}

export interface PinInputProps extends SharedProps {
  value?: string
  length?: number
  disabled?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  mask?: boolean
  /** One-time-code autocomplete hint. Default true. */
  otp?: boolean
}

export interface ListProps extends SharedProps {
  /** Initial records (stamped at compile when a content template exists). */
  data?: unknown[]
  emptyText?: string
}

export interface ChartProps extends SharedProps {
  kind?: 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter'
  series?: number[][]
  labels?: string[]
  points?: Array<{ x: number; y: number; r?: number; c?: number }>
  palette?: string[]
  orientation?: 'v' | 'h'
  stacked?: boolean
  smooth?: boolean
  markers?: boolean
  legend?: 'none' | 'top' | 'bottom' | 'right'
  gridlines?: 'none' | 'x' | 'y' | 'both'
}

export interface StepsItem {
  key?: string
  title: string
  description?: string
}

export interface StepsProps extends SharedProps {
  items?: StepsItem[]
  current?: number
  orientation?: 'horizontal' | 'vertical'
  variant?: 'solid' | 'subtle'
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

export interface TimelineItem {
  title: string
  time?: string
  content?: string
}

export interface TimelineProps extends SharedProps {
  items?: TimelineItem[]
  variant?: 'subtle' | 'solid' | 'outline' | 'plain'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

export interface StatProps extends SharedProps {
  label?: string
  value?: string
  delta?: string
  trend?: 'up' | 'down' | 'flat'
  helpText?: string
  size?: 'sm' | 'md' | 'lg'
}

export interface TagProps extends SharedProps {
  label?: string
  variant?: 'subtle' | 'solid' | 'outline' | 'surface'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
}

export interface ComboboxProps extends SharedProps {
  options?: SelectOption[]
  value?: string | string[]
  placeholder?: string
  disabled?: boolean
  multiple?: boolean
  clearable?: boolean
}

export interface TagsInputProps extends SharedProps {
  value?: string[]
  placeholder?: string
  disabled?: boolean
  max?: number
}

export interface TreeNode {
  key: string
  label: string
  children?: TreeNode[]
  disabled?: boolean
  defaultExpanded?: boolean
}

export interface TreeViewProps extends SharedProps {
  items?: TreeNode[]
  expandedKeys?: string[]
  selectedKey?: string
}

export interface RatingProps extends SharedProps {
  value?: number
  max?: number
  disabled?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

export interface EditableProps extends SharedProps {
  value?: string
  placeholder?: string
  disabled?: boolean
}

export interface FileUploadProps extends SharedProps {
  accept?: string
  multiple?: boolean
  maxFiles?: number
  disabled?: boolean
}

// ── Layout primitives ───────────────────────────────────────────────────────
// Structural surfaces share the Box prop vocabulary — one interface each so
// intent stays explicit and future divergence has a home. They render through
// renderGeneric (div + per-object CSS), which is the whole implementation.

export interface ContainerProps extends BoxProps {}
export interface GridPrimitiveProps extends BoxProps {}
export interface CardProps extends BoxProps {}
export interface GroupProps extends BoxProps {}
export interface StageProps extends BoxProps {}
export interface VStackProps extends BoxProps {}
export interface HStackProps extends BoxProps {}
export interface HeaderProps extends BoxProps {}
export interface MainProps extends BoxProps {}
export interface FooterProps extends BoxProps {}
export interface NavProps extends BoxProps {}
export interface SectionProps extends BoxProps {}
export interface ArticleProps extends BoxProps {}
export interface SlotProps extends SharedProps {}
export interface LoginProps extends FormProps {}
export interface SignupProps extends FormProps {}
export interface ListerProps extends ListProps {}

export interface BlockquoteProps extends SharedProps {
  content?: string
  text?: string
  cite?: string
}

export interface KbdProps extends SharedProps {
  content?: string
  keys?: string[]
  size?: 'sm' | 'md' | 'lg'
}

export interface StatusProps extends SharedProps {
  label?: string
  value?: 'info' | 'success' | 'warning' | 'error' | 'neutral'
  size?: 'sm' | 'md' | 'lg'
}

export interface SpinnerProps extends SharedProps {
  label?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

export interface EmptyStateProps extends SharedProps {
  title?: string
  description?: string
  icon?: string
}

export interface DataListItem {
  label: string
  value?: string
}

export interface DataListProps extends SharedProps {
  items?: DataListItem[]
  orientation?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md' | 'lg'
}

export interface AspectRatioProps extends SharedProps {
  ratio?: string
}

export interface CodeBlockProps extends SharedProps {
  content?: string
  code?: string
  language?: string
  showLineNumbers?: boolean
}

export interface AvatarGroupMember {
  src?: string
  name?: string
}

export interface AvatarGroupProps extends SharedProps {
  avatars?: AvatarGroupMember[]
  max?: number
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

export interface ProgressCircleProps extends SharedProps {
  value?: number
  max?: number
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  showLabel?: boolean
}

export interface SeparatorProps extends SharedProps {
  orientation?: 'horizontal' | 'vertical'
  variant?: 'solid' | 'dashed' | 'dotted'
}

export interface SkeletonProps extends SharedProps {
  width?: string | number
  height?: string | number
  radius?: string | number
  animate?: boolean
}

export interface BreadcrumbItem {
  label?: string
  value?: string
  href?: string
}

export interface BreadcrumbsProps extends SharedProps {
  items?: BreadcrumbItem[]
  separator?: string
}

export interface VideoProps extends SharedProps {
  src?: string
  poster?: string
  controls?: boolean
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
  variant?: string
}

export interface AudioProps extends SharedProps {
  src?: string
  controls?: boolean
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
  variant?: string
}

export interface MarkdownProps extends SharedProps {
  content?: string
  text?: string
}

export interface CodeProps extends SharedProps {
  content?: string
  code?: string
  text?: string
  language?: string
  variant?: string
  showLineNumbers?: boolean
  highlight?: string
  wrap?: boolean
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
  | SliderProps
  | ImageProps
  | LinkProps
  | PageProps
  | TableProps
  | DialogProps
  | AccordionProps
  | PopoverProps
  | DrawerProps
  | ToastProps
  | DropdownProps
  | MenuProps
  | TooltipProps
  | AvatarProps
  | TextareaProps
  | LabelProps
  | NumberInputProps
  | PinInputProps
  | ListProps
  | ChartProps
  | StepsProps
  | StepsItem
  | TimelineProps
  | TimelineItem
  | StatProps
  | TagProps
  | ComboboxProps
  | TagsInputProps
  | TreeViewProps
  | TreeNode
  | RatingProps
  | EditableProps
  | FileUploadProps
  | ContainerProps
  | GridPrimitiveProps
  | CardProps
  | GroupProps
  | StageProps
  | VStackProps
  | HStackProps
  | HeaderProps
  | MainProps
  | FooterProps
  | NavProps
  | SectionProps
  | ArticleProps
  | SlotProps
  | LoginProps
  | SignupProps
  | ListerProps
  | BlockquoteProps
  | KbdProps
  | StatusProps
  | SpinnerProps
  | EmptyStateProps
  | DataListProps
  | DataListItem
  | AspectRatioProps
  | CodeBlockProps
  | AvatarGroupProps
  | AvatarGroupMember
  | ProgressCircleProps
  | SeparatorProps
  | SkeletonProps
  | BreadcrumbsProps
  | BreadcrumbItem
  | VideoProps
  | AudioProps
  | MarkdownProps
  | CodeProps
  | SelectProps
  | TabsProps
  | BadgeProps
  | AlertProps
  | ToggleProps
  | FormProps
  | ProgressProps