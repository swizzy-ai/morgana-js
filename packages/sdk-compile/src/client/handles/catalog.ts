/**
 * Which code each kind needs in the browser — read by the compiler, which
 * generates the page runtime's entry to import only the builders and
 * painters for the kinds a project actually uses (bundle.ts).
 *
 * Kept in step with the BY_KIND tables in each handles module; the
 * catalogue test checks that every entry names the same function.
 */
export type HandleModule = 'data' | 'feedback' | 'inputs' | 'overlay' | 'wave3'

/** kind → the module and exported builder that layers its methods on a handle. */
export const HANDLE_BUILDERS: Record<string, { module: HandleModule; name: string }> = {
  table: { module: 'data', name: 'tableMethods' },
  list: { module: 'data', name: 'listMethods' },
  lister: { module: 'data', name: 'listMethods' },
  chart: { module: 'data', name: 'chartMethods' },
  video: { module: 'data', name: 'mediaMethods' },
  audio: { module: 'data', name: 'mediaMethods' },
  breadcrumbs: { module: 'data', name: 'breadcrumbsMethods' },
  steps: { module: 'data', name: 'stepsMethods' },
  timeline: { module: 'data', name: 'timelineMethods' },
  stat: { module: 'data', name: 'statMethods' },
  tag: { module: 'data', name: 'tagMethods' },
  treeView: { module: 'data', name: 'treeMethods' },
  status: { module: 'data', name: 'statusMethods' },
  dataList: { module: 'data', name: 'dataListMethods' },
  avatarGroup: { module: 'data', name: 'avatarGroupMethods' },
  progressCircle: { module: 'data', name: 'progressCircleMethods' },
  codeBlock: { module: 'data', name: 'codeBlockMethods' },
  badge: { module: 'feedback', name: 'badgeMethods' },
  alert: { module: 'feedback', name: 'alertMethods' },
  progress: { module: 'feedback', name: 'progressMethods' },
  avatar: { module: 'feedback', name: 'avatarMethods' },
  separator: { module: 'feedback', name: 'separatorMethods' },
  skeleton: { module: 'feedback', name: 'skeletonMethods' },
  toast: { module: 'feedback', name: 'toastMethods' },
  button: { module: 'inputs', name: 'buttonMethods' },
  input: { module: 'inputs', name: 'inputMethods' },
  textarea: { module: 'inputs', name: 'inputMethods' },
  select: { module: 'inputs', name: 'selectMethods' },
  toggle: { module: 'inputs', name: 'toggleMethods' },
  switch: { module: 'inputs', name: 'toggleMethods' },
  checkbox: { module: 'inputs', name: 'toggleMethods' },
  radio: { module: 'inputs', name: 'toggleMethods' },
  numberInput: { module: 'inputs', name: 'numberInputMethods' },
  pinInput: { module: 'inputs', name: 'pinInputMethods' },
  combobox: { module: 'inputs', name: 'comboboxMethods' },
  tagsInput: { module: 'inputs', name: 'tagsMethods' },
  rating: { module: 'inputs', name: 'ratingMethods' },
  editable: { module: 'inputs', name: 'editableMethods' },
  fileUpload: { module: 'inputs', name: 'fileMethods' },
  slider: { module: 'inputs', name: 'sliderMethods' },
  form: { module: 'inputs', name: 'formMethods' },
  login: { module: 'inputs', name: 'formMethods' },
  signup: { module: 'inputs', name: 'formMethods' },
  label: { module: 'inputs', name: 'labelMethods' },
  dialog: { module: 'overlay', name: 'dialogMethods' },
  drawer: { module: 'overlay', name: 'drawerMethods' },
  dropdown: { module: 'overlay', name: 'dropdownMethods' },
  popover: { module: 'overlay', name: 'popoverMethods' },
  tooltip: { module: 'overlay', name: 'tooltipMethods' },
  menu: { module: 'overlay', name: 'menuMethods' },
  accordion: { module: 'overlay', name: 'accordionMethods' },
  tabs: { module: 'overlay', name: 'tabsMethods' },
  datePicker: { module: 'wave3', name: 'datePicker' },
  dateRange: { module: 'wave3', name: 'dateRange' },
  radioGroup: { module: 'wave3', name: 'radioGroup' },
  pagination: { module: 'wave3', name: 'pagination' },
  collapsible: { module: 'wave3', name: 'collapsible' },
  carousel: { module: 'wave3', name: 'carousel' },
  colorPicker: { module: 'wave3', name: 'colorPicker' },
  qrCode: { module: 'wave3', name: 'qrCode' },
  contextMenu: { module: 'wave3', name: 'contextMenu' },
  commandPalette: { module: 'wave3', name: 'commandPalette' },
}

/** Painters the prop writer calls for a kind's semantic props. */
export const PAINTERS: Record<string, { from: string; name: string; kinds: string[] }> = {
  checked: { from: './handles/inputs', name: 'paintChecked', kinds: ['toggle', 'switch', 'checkbox', 'radio'] },
  progress: { from: './handles/feedback', name: 'paintProgressValue', kinds: ['progress'] },
  chart: { from: './handles/data', name: 'repaintChartEl', kinds: ['chart'] },
  qr: { from: '../qr', name: 'qrMarkup', kinds: ['qrCode'] },
}
