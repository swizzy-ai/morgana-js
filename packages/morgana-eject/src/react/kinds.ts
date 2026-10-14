/**
 * Control specs — which rendered element gets which React wiring.
 *
 * Structure comes from renderNode (never hand-written here); this table says,
 * per kind, how the element is CONTROLLED: the value prop, the change event,
 * and any region semantics (lists collect items, toasts collect toasts, media
 * needs a ref, tables read rows from state).
 *
 * valueProp: the JSX prop bound to state (null = uncontrolled, onEvent only).
 * event: the React event prop the action handlers attach to.
 * region: how children compose — 'items' appends state items after static
 *   children (lists, logs, toast regions), 'rows' renders state rows (tables),
 *   'toasts' renders state toasts (toast regions).
 * media: element needs a ref entry for play()/pause().
 */

export interface ControlSpec {
  valueProp: string | null;
  event: string | null;
  region?: 'items' | 'rows' | 'toasts';
  media?: boolean;
}

const VALUE_CHANGE: ControlSpec = { valueProp: 'value', event: 'onChange' };
const CHECK_CHANGE: ControlSpec = { valueProp: 'checked', event: 'onChange' };
const CLICK: ControlSpec = { valueProp: null, event: 'onClick' };

export const CONTROL_SPECS: Record<string, ControlSpec> = {
  input: VALUE_CHANGE,
  textarea: VALUE_CHANGE,
  select: VALUE_CHANGE,
  numberInput: VALUE_CHANGE,
  pinInput: VALUE_CHANGE,
  combobox: VALUE_CHANGE,
  editable: VALUE_CHANGE,
  checkbox: CHECK_CHANGE,
  radio: CHECK_CHANGE,
  switch: CHECK_CHANGE,
  toggle: CHECK_CHANGE,
  button: CLICK,
  menu: CLICK,
  dropdown: CLICK,
  tag: CLICK,
  rating: { valueProp: 'value', event: 'onRate' },
  slider: { valueProp: 'value', event: 'onChange' },
  tabs: { valueProp: 'activeKey', event: 'onTab' },
  accordion: { valueProp: null, event: 'onToggle' },
  list: { valueProp: null, event: null, region: 'items' },
  lister: { valueProp: null, event: null, region: 'items' },
  table: { valueProp: null, event: null, region: 'rows' },
  toast: { valueProp: null, event: null, region: 'toasts' },
  video: { valueProp: null, event: null, media: true },
  audio: { valueProp: null, event: null, media: true },
};

/** Props that always read from state (controlled), per kind family. */
export const DYNAMIC_PROPS: Record<string, string[]> = {
  text: ['content'],
  badge: ['label'],
  alert: ['title', 'description'],
  progress: ['value'],
  progressCircle: ['value'],
  stat: ['value'],
  status: ['value', 'status'],
  spinner: ['label'],
  skeleton: ['width', 'animate'],
  image: ['src'],
  link: ['href'],
  table: ['rows', 'sort', 'filter', 'selection'],
  list: ['items'],
  lister: ['items'],
  toast: ['items'],
  tabs: ['activeKey'],
  input: ['value'],
  textarea: ['value'],
  select: ['value'],
  checkbox: ['checked'],
  radio: ['checked'],
  switch: ['checked'],
  toggle: ['checked'],
  slider: ['value'],
  rating: ['value'],
  combobox: ['value'],
  editable: ['value'],
  numberInput: ['value'],
  pinInput: ['value'],
  dialog: ['open'],
  drawer: ['open'],
  popover: ['open'],
  dropdown: ['open'],
  tooltip: ['open'],
  accordion: ['expanded'],
};
