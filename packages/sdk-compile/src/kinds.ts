/**
 * Every kind `ctx.ui.<kind>()` can create — the one list. The compile lane
 * builds creators from it and the browser runtime builds its "creation is
 * compile-lane only" guards from it; two hand-kept copies had drifted apart.
 * Dependency-free so the client bundle can import it.
 */
export const CREATABLE_KINDS = [
  'page',
  'box', 'container', 'grid', 'card', 'group', 'stage',
  'vstack', 'hstack',
  'tabs', 'accordion', 'dialog', 'dropdown', 'tooltip', 'popover', 'drawer', 'toast',
  'form', 'login', 'signup', 'slot',
  'header', 'main', 'footer', 'nav', 'section', 'article',
  'text', 'markdown', 'code', 'label',
  'button', 'input', 'textarea', 'select', 'checkbox', 'radio', 'switch', 'toggle',
  'numberInput', 'pinInput', 'combobox', 'tagsInput', 'rating', 'editable', 'fileUpload', 'steps', 'timeline', 'stat', 'tag', 'treeView', 'dataList', 'progressCircle', 'blockquote', 'kbd', 'status', 'spinner', 'emptyState', 'aspectRatio', 'avatarGroup', 'codeBlock',
  'slider',
  'list', 'lister', 'table', 'chart', 'badge', 'avatar',
  'alert', 'progress', 'skeleton', 'separator',
  'image', 'video', 'audio',
  'link', 'menu', 'breadcrumbs',
  'datePicker', 'dateRange', 'radioGroup', 'pagination', 'collapsible', 'carousel', 'colorPicker', 'contextMenu', 'commandPalette',
] as const
