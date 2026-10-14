/**
 * Node dispatch + generic renderer + kind tag map.
 */
import { baseAttrs, escAttr, escHtml, STRUCTURAL_PROPS, type RenderNode } from './html';
import { iconFor, withIcon } from './icons';
import { renderButton, renderCombobox, renderEditable, renderField, renderFileUpload, renderNumberInput, renderPinInput, renderRating, renderSelect, renderSlider, renderTagsInput, renderToggle } from './templates/form';
import { renderChart, renderDataList, renderList, renderProgress, renderProgressCircle, renderStat, renderSteps, renderTable, renderTag, renderTimeline, renderTreeView } from './templates/data';
import { renderAlert, renderBadge, renderDialog, renderTabs } from './templates/overlay';
import { renderImage } from './templates/media';
import { renderForm, renderLabel } from './templates/form-surface';
import { renderAccordion, renderDrawer, renderDropdown, renderPopover, renderToast, renderTooltip } from './templates/surfaces';
import {
  renderAspectRatio,
  renderAvatar,
  renderAvatarGroup,
  renderBlockquote,
  renderBreadcrumbs,
  renderEmptyState,
  renderKbd,
  renderMenu,
  renderSeparator,
  renderSkeleton,
  renderSlot,
  renderSpinner,
  renderStatus,
} from './templates/nav-leaf';
import { renderAudio, renderVideo } from './templates/media-surface';
import { renderCode, renderCodeBlock } from './templates/code';
import { renderMarkdown } from './markdown';
import { renderCarousel, renderCollapsible, renderColorPicker, renderCommandPalette, renderContextMenu, renderDatePicker, renderPagination, renderRadioGroup } from './templates/wave3';
import type { ProjectIR } from '../ir';

export const TAG_FOR_KIND: Record<string, string> = {
  page: 'div',
  box: 'div',
  container: 'div',
  vstack: 'div',
  hstack: 'div',
  grid: 'div',
  card: 'div',
  group: 'div',
  stage: 'div',
  header: 'header',
  main: 'main',
  footer: 'footer',
  nav: 'nav',
  section: 'section',
  article: 'article',
  text: 'p',
  markdown: 'div',
  code: 'pre',
  label: 'label',
  button: 'button',
  input: 'input',
  textarea: 'textarea',
  numberInput: 'div',
  pinInput: 'div',
  select: 'select',
  checkbox: 'input',
  radio: 'input',
  switch: 'input',
  list: 'ul',
  lister: 'ul',
  table: 'table',
  chart: 'div',
  badge: 'span',
  avatar: 'span',
  alert: 'div',
  progress: 'progress',
  skeleton: 'div',
  separator: 'div',
  image: 'img',
  video: 'video',
  audio: 'audio',
  link: 'a',
  menu: 'nav',
  breadcrumbs: 'nav',
  tabs: 'div',
  accordion: 'div',
  dialog: 'div',
  dropdown: 'div',
  tooltip: 'span',
  popover: 'div',
  drawer: 'div',
  toast: 'div',
  slider: 'div',
  steps: 'div',
  timeline: 'div',
  stat: 'div',
  tag: 'span',
  combobox: 'div',
  tagsInput: 'div',
  rating: 'div',
  editable: 'div',
  fileUpload: 'div',
  treeView: 'div',
  blockquote: 'blockquote',
  kbd: 'span',
  status: 'span',
  spinner: 'span',
  emptyState: 'div',
  aspectRatio: 'div',
  avatarGroup: 'div',
  dataList: 'div',
  progressCircle: 'div',
  codeBlock: 'div',
  datePicker: 'div',
  radioGroup: 'div',
  pagination: 'nav',
  collapsible: 'div',
  carousel: 'div',
  colorPicker: 'div',
  contextMenu: 'div',
  commandPalette: 'div',
  toggle: 'input',
  form: 'form',
  login: 'form',
  signup: 'form',
  slot: 'div',
}

/**
 * Layout primitives — the kinds that legitimately render through
 * `renderGeneric` because a `<div>`/`<p>` plus `resolvePropsToCss` is the
 * whole implementation. Everything else must have a dedicated renderer; the
 * `kinds.test.ts` guard fails the build if one is added without one.
 */
export const LAYOUT_PRIMITIVES = new Set([
  'page', 'box', 'container', 'vstack', 'hstack', 'grid', 'card', 'group',
  'stage', 'header', 'main', 'footer', 'nav', 'section', 'article', 'text', 'link',
])

/**
 * Every kind with a dedicated renderer. Kept adjacent to the dispatch switch
 * and asserted against `CREATABLE_KINDS` so the two can never drift.
 */
export const TEMPLATED_KINDS = new Set([
  'button', 'input', 'textarea', 'numberInput', 'pinInput', 'combobox', 'tagsInput', 'rating', 'editable', 'fileUpload', 'select', 'checkbox', 'radio', 'switch', 'toggle',
  'steps', 'timeline', 'stat', 'tag', 'treeView', 'dataList', 'progressCircle',
  'blockquote', 'kbd', 'status', 'spinner', 'emptyState', 'aspectRatio', 'avatarGroup', 'codeBlock',
  'table', 'tabs', 'dialog', 'badge', 'alert', 'image', 'list', 'lister', 'chart', 'progress',
  'form', 'login', 'signup', 'label',
  'accordion', 'dropdown', 'menu', 'tooltip', 'popover', 'drawer', 'toast',
  'slider',
  'breadcrumbs',
  'avatar', 'separator', 'skeleton', 'slot',
  'video', 'audio',
  'markdown', 'code',
  'datePicker', 'radioGroup', 'pagination', 'collapsible', 'carousel', 'colorPicker', 'contextMenu', 'commandPalette',
])
export function renderNode(ir: ProjectIR, id: string): string {  const node = ir.objects.get(id)
  if (!node) return ''
  const view: RenderNode = {
    id: node.id,
    kind: node.kind,
    customObject: node.customObject,
    props: node.props as Record<string, unknown>,
    children: node.children,
    bindings: node.bindings,
    breakpointProps: node.breakpointProps as Record<string, unknown>,
  }
  switch (node.kind) {
    case 'button':
      return renderButton(ir, view)
    case 'input':
    case 'textarea':
      return renderField(ir, view)
    case 'numberInput':
      return renderNumberInput(ir, view)
    case 'pinInput':
      return renderPinInput(ir, view)
    case 'combobox':
      return renderCombobox(ir, view)
    case 'tagsInput':
      return renderTagsInput(ir, view)
    case 'rating':
      return renderRating(ir, view)
    case 'editable':
      return renderEditable(ir, view)
    case 'fileUpload':
      return renderFileUpload(ir, view)
    case 'select':
      return renderSelect(ir, view)
    case 'table':
      return renderTable(ir, view)
    case 'tabs':
      return renderTabs(ir, view)
    case 'dialog':
      return renderDialog(ir, view)
    case 'badge':
      return renderBadge(ir, view)
    case 'alert':
      return renderAlert(ir, view)
    case 'image':
      return renderImage(ir, view)
    case 'toggle':
    case 'switch':
    case 'checkbox':
    case 'radio':
      return renderToggle(ir, view)
    case 'slider':
      return renderSlider(ir, view)
    case 'list':
    case 'lister':
      return renderList(ir, view)
    case 'chart':
      return renderChart(ir, view)
    case 'progress':
      return renderProgress(ir, view)
    case 'steps':
      return renderSteps(ir, view)
    case 'timeline':
      return renderTimeline(ir, view)
    case 'stat':
      return renderStat(ir, view)
    case 'tag':
      return renderTag(ir, view)
    case 'treeView':
      return renderTreeView(ir, view)
    case 'datePicker':
      return renderDatePicker(ir, view)
    case 'radioGroup':
      return renderRadioGroup(ir, view)
    case 'pagination':
      return renderPagination(ir, view)
    case 'collapsible':
      return renderCollapsible(ir, view)
    case 'carousel':
      return renderCarousel(ir, view)
    case 'colorPicker':
      return renderColorPicker(ir, view)
    case 'contextMenu':
      return renderContextMenu(ir, view)
    case 'commandPalette':
      return renderCommandPalette(ir, view)
    // ── Forms ──
    case 'form':
    case 'login':
    case 'signup':
      return renderForm(ir, view)
    case 'label':
      return renderLabel(ir, view)
    // ── Overlay surfaces (open/close contract shared with dialog) ──
    case 'accordion':
      return renderAccordion(ir, view)
    case 'dropdown':
      return renderDropdown(ir, view)
    case 'menu':
      return renderMenu(ir, view)
    case 'tooltip':
      return renderTooltip(ir, view)
    case 'popover':
      return renderPopover(ir, view)
    case 'drawer':
      return renderDrawer(ir, view)
    case 'toast':
      return renderToast(ir, view)
    // ── Navigation ──
    case 'breadcrumbs':
      return renderBreadcrumbs(ir, view)
    // ── Leaf primitives ──
    case 'avatar':
      return renderAvatar(ir, view)
    case 'separator':
      return renderSeparator(ir, view)
    case 'skeleton':
      return renderSkeleton(ir, view)
    case 'slot':
      return renderSlot(ir, view)
    // ── Media ──
    case 'video':
      return renderVideo(ir, view)
    case 'audio':
      return renderAudio(ir, view)
    // ── Content ──
    case 'markdown':
      return renderMarkdownNode(ir, view)
    case 'code':
      return renderCode(ir, view)
    case 'codeBlock':
      return renderCodeBlock(ir, view)
    case 'blockquote':
      return renderBlockquote(ir, view)
    case 'kbd':
      return renderKbd(ir, view)
    case 'status':
      return renderStatus(ir, view)
    case 'spinner':
      return renderSpinner(ir, view)
    case 'emptyState':
      return renderEmptyState(ir, view)
    case 'aspectRatio':
      return renderAspectRatio(ir, view)
    case 'avatarGroup':
      return renderAvatarGroup(ir, view)
    case 'dataList':
      return renderDataList(ir, view)
    case 'progressCircle':
      return renderProgressCircle(ir, view)
    default:
      return renderGeneric(ir, view)
  }
}

/** markdown: parse the declared source into real HTML, never literal text. */
function renderMarkdownNode(ir: ProjectIR, node: RenderNode): string {
  const source = node.props['content'] ?? node.props['text'] ?? ''
  const body = typeof source === 'string' && source !== ''
    ? renderMarkdown(source)
    : node.children.map((c) => renderNode(ir, c)).join('\n')
  return `<div ${baseAttrs(node).join(' ')} data-part="markdown">${body}</div>`
}

/** Shared attribute line: identity + bindings + breakpoints. */
function renderGeneric(ir: ProjectIR, node: RenderNode): string {
  const tag = TAG_FOR_KIND[node.kind] ?? 'div'
  const props = node.props
  const attrList = baseAttrs(node)

  let textContent: string | null = null
  const icon = iconFor(ir, props)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue
    if (STRUCTURAL_PROPS.has(k)) continue
    if ((node.kind === 'text' || node.kind === 'label' || node.kind === 'button') && (k === 'content' || k === 'label' || k === 'text')) {
      textContent = String(v)
      continue
    }
    if (k === 'icon' || k === 'iconPosition') continue
    if (k === 'src' || k === 'href' || k === 'alt' || k === 'value' || k === 'type' || k === 'placeholder' || k === 'target') {
      attrList.push(`${k}="${escAttr(String(v))}"`)
      continue
    }
    attrList.push(`data-prop-${escAttr(k)}="${escAttr(String(v))}"`)
  }

  const selfClosing = tag === 'input' || tag === 'img' || tag === 'hr'
  const childrenHtml = node.children.map((c) => renderNode(ir, c)).join('')
  const inner = withIcon(textContent !== null ? escHtml(textContent) : childrenHtml, icon)
  if (selfClosing) return `<${tag} ${attrList.join(' ')} />`
  return `<${tag} ${attrList.join(' ')}>${inner}</${tag}>`
}
