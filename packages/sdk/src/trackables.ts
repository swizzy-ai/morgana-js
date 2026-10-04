/**
 * Trackable Events Catalog & Metadata for WSC (World-State-Canvas) Environment.
 *
 * Provides typed definitions, constants, metadata, and accessor utilities for
 * every trackable event across all object handle elements (Button, Input, Page,
 * List, Chart, Link, Text, Box) as well as the Backend system/store lane.
 *
 * In the Morgana / WSC architecture:
 *   - Object elements declare tracked activities via `obj.track(event, opts)`
 *   - Page / UI context declares page-level tracked sources via `ui.track(event, opts)`
 *   - Backend exposes trackable store, cron, and system lifecycles
 *   - Every trackable is strongly typed and documented with payload schemas,
 *     environmental origin, lane, description, and session propagation capability.
 */

// ── Per-Handle Trackable Event Enums & Tuples ────────────────────────────────

export const BUTTON_TRACKABLE_EVENTS = [
  'click',
  'clicked',
  'hover',
  'focus',
  'blur',
  'disabled',
  'enabled',
] as const
export type ButtonTrackableEvent = (typeof BUTTON_TRACKABLE_EVENTS)[number]

export const INPUT_TRACKABLE_EVENTS = [
  'input',
  'change',
  'changed',
  'focus',
  'blur',
  'clear',
  'validate',
  'error',
  'submit',
  'submitted',
] as const
export type InputTrackableEvent = (typeof INPUT_TRACKABLE_EVENTS)[number]

export const PAGE_TRACKABLE_EVENTS = [
  'scroll',
  'loaded',
  'navigate',
  'params:changed',
  'app:attached',
  'child_page:added',
  'resize',
  'visibilitychange',
] as const
export type PageTrackableEvent = (typeof PAGE_TRACKABLE_EVENTS)[number]

export const LIST_TRACKABLE_EVENTS = [
  'item:appended',
  'item:patched',
  'item:removed',
  'selected',
  'picked',
  'locked',
  'unlocked',
  'subscribe',
] as const
export type ListTrackableEvent = (typeof LIST_TRACKABLE_EVENTS)[number]

export const CHART_TRACKABLE_EVENTS = [
  'selected',
  'hover',
  'series:changed',
  'rendered',
  'download',
] as const
export type ChartTrackableEvent = (typeof CHART_TRACKABLE_EVENTS)[number]

export const LINK_TRACKABLE_EVENTS = [
  'click',
  'clicked',
  'navigate',
  'hover',
] as const
export type LinkTrackableEvent = (typeof LINK_TRACKABLE_EVENTS)[number]

export const TEXT_TRACKABLE_EVENTS = [
  'content:changed',
  'click',
  'clicked',
] as const
export type TextTrackableEvent = (typeof TEXT_TRACKABLE_EVENTS)[number]

export const BOX_TRACKABLE_EVENTS = [
  'click',
  'clicked',
  'hover',
  'moved',
  'removed',
  'child:placed',
  'child:removed',
  'collided',
] as const
export type BoxTrackableEvent = (typeof BOX_TRACKABLE_EVENTS)[number]

export const TABLE_TRACKABLE_EVENTS = [
  'row:click',
  'row:select',
  'row:deselect',
  'select:all',
  'select:clear',
  'sort:changed',
  'page:changed',
  'pageSize:changed',
  'search:changed',
  'filter:changed',
  'cell:click',
  'density:changed',
  'variant:changed',
] as const
export type TableTrackableEvent = (typeof TABLE_TRACKABLE_EVENTS)[number]

export const DIALOG_TRACKABLE_EVENTS = [
  'opened',
  'closed',
  'dismissed',
  'confirm',
  'cancel',
] as const
export type DialogTrackableEvent = (typeof DIALOG_TRACKABLE_EVENTS)[number]

export const SELECT_TRACKABLE_EVENTS = [
  'change',
  'select',
  'deselect',
  'open',
  'close',
  'clear',
] as const
export type SelectTrackableEvent = (typeof SELECT_TRACKABLE_EVENTS)[number]

export const TABS_TRACKABLE_EVENTS = [
  'tab:change',
  'tab:click',
] as const
export type TabsTrackableEvent = (typeof TABS_TRACKABLE_EVENTS)[number]

export const FORM_TRACKABLE_EVENTS = [
  'submit',
  'reset',
  'field:change',
  'error',
  'validated',
] as const
export type FormTrackableEvent = (typeof FORM_TRACKABLE_EVENTS)[number]

export const BACKEND_TRACKABLE_EVENTS = [
  'store:created',
  'store:updated',
  'store:deleted',
  'store:changed',
  'cron:tick',
  'action:start',
  'action:success',
  'action:error',
  'deploy',
  'channel:publish',
  'channel:subscribe',
] as const
export type BackendTrackableEvent = (typeof BACKEND_TRACKABLE_EVENTS)[number]

// ── Generic Object Trackable Event Union ────────────────────────────────────

export const COMMON_OBJECT_TRACKABLE_EVENTS = [
  'prop:changed',
  'moved',
  'removed',
  'animated',
  'visibility:changed',
] as const
export type CommonObjectTrackableEvent = (typeof COMMON_OBJECT_TRACKABLE_EVENTS)[number]

/** Universal union of all handle-level trackable events in Morgana. */
export type ElementTrackableEvent =
  | ButtonTrackableEvent
  | InputTrackableEvent
  | PageTrackableEvent
  | ListTrackableEvent
  | ChartTrackableEvent
  | LinkTrackableEvent
  | TextTrackableEvent
  | BoxTrackableEvent
  | TableTrackableEvent
  | DialogTrackableEvent
  | SelectTrackableEvent
  | TabsTrackableEvent
  | FormTrackableEvent
  | CommonObjectTrackableEvent

/** Map of handle element types to their supported trackable events. */
export interface HandleTrackableEventMap {
  button: ButtonTrackableEvent
  input: InputTrackableEvent
  page: PageTrackableEvent
  list: ListTrackableEvent
  chart: ChartTrackableEvent
  link: LinkTrackableEvent
  text: TextTrackableEvent
  box: BoxTrackableEvent
  table: TableTrackableEvent
  dialog: DialogTrackableEvent
  select: SelectTrackableEvent
  tabs: TabsTrackableEvent
  form: FormTrackableEvent
  generic: CommonObjectTrackableEvent
}

// ── Trackable Descriptor & Metadata ─────────────────────────────────────────

export type TrackableLane = 'interaction' | 'page' | 'state' | 'action' | 'channel' | 'mutation' | 'backend'

export interface TrackableDescriptor {
  readonly event: string
  readonly lane: TrackableLane
  readonly description: string
  readonly defaultPayloadSchema: string
  readonly supportsSessionSync: boolean
  readonly wscTriggerPattern: string
}

export interface HandleTrackablesGuide {
  readonly type: keyof HandleTrackableEventMap | 'backend'
  readonly label: string
  readonly description: string
  readonly trackables: readonly TrackableDescriptor[]
}

// ── Canonical Trackable Catalog for WSC Environment ─────────────────────────

export const TRACKABLES_BY_HANDLE: Record<keyof HandleTrackableEventMap, readonly TrackableDescriptor[]> = {
  button: [
    {
      event: 'click',
      lane: 'interaction',
      description: 'Primary button trigger activated by user click or programmatically via .click()',
      defaultPayloadSchema: '{ button: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'button#<name>.click or <name>.click',
    },
    {
      event: 'clicked',
      lane: 'interaction',
      description: 'Declarative framework alias for button click interaction',
      defaultPayloadSchema: '{ button: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'button#<name>.clicked or <name>.clicked',
    },
    {
      event: 'hover',
      lane: 'interaction',
      description: 'Cursor enters or hovers over the button surface',
      defaultPayloadSchema: '{ button: string; entered: boolean }',
      supportsSessionSync: true,
      wscTriggerPattern: 'button#<name>.hover',
    },
    {
      event: 'focus',
      lane: 'interaction',
      description: 'Button element receives browser keyboard or pointer focus',
      defaultPayloadSchema: '{ button: string }',
      supportsSessionSync: false,
      wscTriggerPattern: 'button#<name>.focus',
    },
    {
      event: 'blur',
      lane: 'interaction',
      description: 'Button element loses browser focus',
      defaultPayloadSchema: '{ button: string }',
      supportsSessionSync: false,
      wscTriggerPattern: 'button#<name>.blur',
    },
    {
      event: 'disabled',
      lane: 'mutation',
      description: 'Button disabled state transitioned to true (.disable())',
      defaultPayloadSchema: '{ disabled: true }',
      supportsSessionSync: true,
      wscTriggerPattern: 'button#<name>.disabled',
    },
    {
      event: 'enabled',
      lane: 'mutation',
      description: 'Button disabled state transitioned to false (.enable())',
      defaultPayloadSchema: '{ disabled: false }',
      supportsSessionSync: true,
      wscTriggerPattern: 'button#<name>.enabled',
    },
  ],

  input: [
    {
      event: 'input',
      lane: 'interaction',
      description: 'Continuous keystroke character input or value changes in the text field',
      defaultPayloadSchema: '{ value: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'input#<name>.input or <name>.input',
    },
    {
      event: 'change',
      lane: 'interaction',
      description: 'Committed input change emitted on enter key or input blur',
      defaultPayloadSchema: '{ value: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'input#<name>.change or <name>.change',
    },
    {
      event: 'changed',
      lane: 'interaction',
      description: 'Declarative framework alias for input change event',
      defaultPayloadSchema: '{ value: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'input#<name>.changed',
    },
    {
      event: 'focus',
      lane: 'interaction',
      description: 'Input field gains user focus',
      defaultPayloadSchema: '{}',
      supportsSessionSync: false,
      wscTriggerPattern: 'input#<name>.focus',
    },
    {
      event: 'blur',
      lane: 'interaction',
      description: 'Input field loses user focus',
      defaultPayloadSchema: '{}',
      supportsSessionSync: false,
      wscTriggerPattern: 'input#<name>.blur',
    },
    {
      event: 'clear',
      lane: 'interaction',
      description: 'Input value cleared via .clear() method',
      defaultPayloadSchema: '{}',
      supportsSessionSync: true,
      wscTriggerPattern: 'input#<name>.clear',
    },
    {
      event: 'validate',
      lane: 'interaction',
      description: 'Input validation executed via .validate()',
      defaultPayloadSchema: '{ valid: boolean; error?: string | null }',
      supportsSessionSync: true,
      wscTriggerPattern: 'input#<name>.validate',
    },
    {
      event: 'error',
      lane: 'interaction',
      description: 'Input error message set or updated via .setError()',
      defaultPayloadSchema: '{ error: string | null }',
      supportsSessionSync: true,
      wscTriggerPattern: 'input#<name>.error',
    },
    {
      event: 'submit',
      lane: 'interaction',
      description: 'Form or input submitted via Enter key',
      defaultPayloadSchema: '{ value: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'input#<name>.submit',
    },
    {
      event: 'submitted',
      lane: 'interaction',
      description: 'Declarative framework alias for submitted form/input',
      defaultPayloadSchema: '{ value: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'input#<name>.submitted',
    },
  ],

  page: [
    {
      event: 'scroll',
      lane: 'page',
      description: 'Page scroll progression, vertical position and direction detection',
      defaultPayloadSchema: '{ y: number; progress: number; direction: "up" | "down" }',
      supportsSessionSync: true,
      wscTriggerPattern: 'page.scroll or <pageName>.scroll',
    },
    {
      event: 'loaded',
      lane: 'page',
      description: 'Page rendered and mounted onto the DOM with initialized objects',
      defaultPayloadSchema: '{ page: string; address: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'page.loaded or <pageName>.loaded',
    },
    {
      event: 'navigate',
      lane: 'page',
      description: 'Page navigation invoked via .navigate(path)',
      defaultPayloadSchema: '{ path: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'page.navigate',
    },
    {
      event: 'params:changed',
      lane: 'page',
      description: 'URL parameters or query string updated on the active page router',
      defaultPayloadSchema: '{ params: Record<string, string> }',
      supportsSessionSync: true,
      wscTriggerPattern: 'page.params:changed',
    },
    {
      event: 'app:attached',
      lane: 'page',
      description: 'Page attached to parent application container via .app(name)',
      defaultPayloadSchema: '{ app: string }',
      supportsSessionSync: false,
      wscTriggerPattern: 'page.app:attached',
    },
    {
      event: 'child_page:added',
      lane: 'page',
      description: 'Nested child page registered on SPA router shell via .page(path, page)',
      defaultPayloadSchema: '{ path: string; page: string }',
      supportsSessionSync: false,
      wscTriggerPattern: 'page.child_page:added',
    },
    {
      event: 'resize',
      lane: 'page',
      description: 'Viewport dimensions changed within browser window or canvas container',
      defaultPayloadSchema: '{ width: number; height: number }',
      supportsSessionSync: false,
      wscTriggerPattern: 'page.resize',
    },
    {
      event: 'visibilitychange',
      lane: 'page',
      description: 'Browser tab or canvas document transitioned between visible and hidden',
      defaultPayloadSchema: '{ state: "visible" | "hidden" }',
      supportsSessionSync: true,
      wscTriggerPattern: 'page.visibilitychange',
    },
  ],

  list: [
    {
      event: 'item:appended',
      lane: 'interaction',
      description: 'New item added to the list view via .append(record)',
      defaultPayloadSchema: '{ record: Record<string, unknown>; total: number }',
      supportsSessionSync: true,
      wscTriggerPattern: 'list#<name>.item:appended',
    },
    {
      event: 'item:patched',
      lane: 'interaction',
      description: 'Last or matched item in list patched via .patch(record)',
      defaultPayloadSchema: '{ record: Record<string, unknown> }',
      supportsSessionSync: true,
      wscTriggerPattern: 'list#<name>.item:patched',
    },
    {
      event: 'item:removed',
      lane: 'interaction',
      description: 'Item removed from list feed by index or id',
      defaultPayloadSchema: '{ id?: string; index?: number }',
      supportsSessionSync: true,
      wscTriggerPattern: 'list#<name>.item:removed',
    },
    {
      event: 'selected',
      lane: 'interaction',
      description: 'User clicked or picked an item row in the list',
      defaultPayloadSchema: '{ item: unknown; index: number }',
      supportsSessionSync: true,
      wscTriggerPattern: 'list#<name>.selected',
    },
    {
      event: 'picked',
      lane: 'interaction',
      description: 'Declarative selection event alias for feed item picking',
      defaultPayloadSchema: '{ item: unknown; index: number }',
      supportsSessionSync: true,
      wscTriggerPattern: 'list#<name>.picked',
    },
    {
      event: 'locked',
      lane: 'interaction',
      description: 'List feed locked to suppress state restamps (e.g. streaming mode)',
      defaultPayloadSchema: '{}',
      supportsSessionSync: false,
      wscTriggerPattern: 'list#<name>.locked',
    },
    {
      event: 'unlocked',
      lane: 'interaction',
      description: 'List feed unlocked to resume normal reactive rendering',
      defaultPayloadSchema: '{}',
      supportsSessionSync: false,
      wscTriggerPattern: 'list#<name>.unlocked',
    },
    {
      event: 'subscribe',
      lane: 'interaction',
      description: 'List subscribed to a backend collection or store via .subscribe()',
      defaultPayloadSchema: '{ store: string; opts?: unknown }',
      supportsSessionSync: true,
      wscTriggerPattern: 'list#<name>.subscribe',
    },
  ],

  chart: [
    {
      event: 'selected',
      lane: 'interaction',
      description: 'Data mark, bar, pie slice or line point selected in chart',
      defaultPayloadSchema: '{ seriesIndex: number; dataIndex: number; value: number; label?: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'chart#<name>.selected',
    },
    {
      event: 'hover',
      lane: 'interaction',
      description: 'Cursor hovered over a specific data point or chart coordinate',
      defaultPayloadSchema: '{ dataIndex: number; value: number }',
      supportsSessionSync: false,
      wscTriggerPattern: 'chart#<name>.hover',
    },
    {
      event: 'series:changed',
      lane: 'mutation',
      description: 'Chart series data or labels updated dynamically',
      defaultPayloadSchema: '{ series: number[][]; labels: string[] }',
      supportsSessionSync: true,
      wscTriggerPattern: 'chart#<name>.series:changed',
    },
    {
      event: 'rendered',
      lane: 'interaction',
      description: 'Chart rendering complete on SVG or Canvas renderer engine',
      defaultPayloadSchema: '{ renderer: "svg" | "chartjs" | "canvas" }',
      supportsSessionSync: false,
      wscTriggerPattern: 'chart#<name>.rendered',
    },
    {
      event: 'download',
      lane: 'interaction',
      description: 'Chart exported to image format (.download("svg" | "png"))',
      defaultPayloadSchema: '{ format: "svg" | "png" }',
      supportsSessionSync: false,
      wscTriggerPattern: 'chart#<name>.download',
    },
  ],

  link: [
    {
      event: 'click',
      lane: 'interaction',
      description: 'Link element activated by user click',
      defaultPayloadSchema: '{ href: string; target: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'link#<name>.click',
    },
    {
      event: 'clicked',
      lane: 'interaction',
      description: 'Declarative framework alias for link click',
      defaultPayloadSchema: '{ href: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'link#<name>.clicked',
    },
    {
      event: 'navigate',
      lane: 'interaction',
      description: 'Client route navigation triggered via .navigate()',
      defaultPayloadSchema: '{ href: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'link#<name>.navigate',
    },
    {
      event: 'hover',
      lane: 'interaction',
      description: 'Cursor entered or exited the link element',
      defaultPayloadSchema: '{ entered: boolean }',
      supportsSessionSync: false,
      wscTriggerPattern: 'link#<name>.hover',
    },
  ],

  text: [
    {
      event: 'content:changed',
      lane: 'mutation',
      description: 'Text object content property modified via .set("content", val)',
      defaultPayloadSchema: '{ prop: "content"; value: string; oldValue: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'text#<name>.content:changed',
    },
    {
      event: 'click',
      lane: 'interaction',
      description: 'Text element clicked by user',
      defaultPayloadSchema: '{ name: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'text#<name>.click',
    },
    {
      event: 'clicked',
      lane: 'interaction',
      description: 'Declarative framework alias for text click',
      defaultPayloadSchema: '{ name: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'text#<name>.clicked',
    },
  ],

  box: [
    {
      event: 'click',
      lane: 'interaction',
      description: 'Box container or surface clicked by user',
      defaultPayloadSchema: '{ name: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'box#<name>.click',
    },
    {
      event: 'clicked',
      lane: 'interaction',
      description: 'Declarative framework alias for box click',
      defaultPayloadSchema: '{ name: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'box#<name>.clicked',
    },
    {
      event: 'hover',
      lane: 'interaction',
      description: 'Cursor hovered over box surface',
      defaultPayloadSchema: '{ entered: boolean }',
      supportsSessionSync: false,
      wscTriggerPattern: 'box#<name>.hover',
    },
    {
      event: 'moved',
      lane: 'interaction',
      description: 'Box coordinates or slot placement shifted via .move()',
      defaultPayloadSchema: '{ to: string | [number, number]; placement: Record<string, unknown> }',
      supportsSessionSync: true,
      wscTriggerPattern: 'box#<name>.moved',
    },
    {
      event: 'removed',
      lane: 'interaction',
      description: 'Box removed from layout hierarchy via .remove()',
      defaultPayloadSchema: '{ name: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'box#<name>.removed',
    },
    {
      event: 'child:placed',
      lane: 'mutation',
      description: 'Child object placed into container via .place(child, placement)',
      defaultPayloadSchema: '{ child: string; placement?: Record<string, unknown> }',
      supportsSessionSync: true,
      wscTriggerPattern: 'box#<name>.child:placed',
    },
    {
      event: 'child:removed',
      lane: 'mutation',
      description: 'Child object removed from container children list',
      defaultPayloadSchema: '{ child: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'box#<name>.child:removed',
    },
    {
      event: 'collided',
      lane: 'interaction',
      description: 'Spatial or boundary collision detected in canvas canvas layer',
      defaultPayloadSchema: '{ target: string; normal?: [number, number] }',
      supportsSessionSync: true,
      wscTriggerPattern: 'box#<name>.collided',
    },
  ],

  table: [
    {
      event: 'row:click',
      lane: 'interaction',
      description: 'Table row clicked by user',
      defaultPayloadSchema: '{ row: Record<string, unknown>; index: number; key: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.row:click',
    },
    {
      event: 'row:select',
      lane: 'interaction',
      description: 'Table row checkbox/selection toggled on',
      defaultPayloadSchema: '{ key: string; row: Record<string, unknown>; selectedKeys: string[] }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.row:select',
    },
    {
      event: 'row:deselect',
      lane: 'interaction',
      description: 'Table row checkbox/selection toggled off',
      defaultPayloadSchema: '{ key: string; row: Record<string, unknown>; selectedKeys: string[] }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.row:deselect',
    },
    {
      event: 'select:all',
      lane: 'interaction',
      description: 'All table rows selected via header checkbox',
      defaultPayloadSchema: '{ selectedKeys: string[]; count: number }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.select:all',
    },
    {
      event: 'select:clear',
      lane: 'interaction',
      description: 'Table row selection cleared',
      defaultPayloadSchema: '{}',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.select:clear',
    },
    {
      event: 'sort:changed',
      lane: 'interaction',
      description: 'Column header clicked to change sorting direction or key',
      defaultPayloadSchema: '{ key: string; direction: "asc" | "desc" }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.sort:changed',
    },
    {
      event: 'page:changed',
      lane: 'interaction',
      description: 'Pagination active page navigated via pagination controls',
      defaultPayloadSchema: '{ page: number; pageSize: number }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.page:changed',
    },
    {
      event: 'pageSize:changed',
      lane: 'interaction',
      description: 'Pagination page size option changed',
      defaultPayloadSchema: '{ pageSize: number; page: number }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.pageSize:changed',
    },
    {
      event: 'search:changed',
      lane: 'interaction',
      description: 'Table search query input updated',
      defaultPayloadSchema: '{ search: string; matchedCount: number }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.search:changed',
    },
    {
      event: 'filter:changed',
      lane: 'interaction',
      description: 'Table column filter updated',
      defaultPayloadSchema: '{ column: string; value: unknown }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.filter:changed',
    },
    {
      event: 'cell:click',
      lane: 'interaction',
      description: 'Individual table cell clicked',
      defaultPayloadSchema: '{ row: Record<string, unknown>; columnKey: string; value: unknown }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.cell:click',
    },
    {
      event: 'density:changed',
      lane: 'mutation',
      description: 'Table row density style toggled (compact, normal, relaxed)',
      defaultPayloadSchema: '{ density: "compact" | "normal" | "relaxed" }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.density:changed',
    },
    {
      event: 'variant:changed',
      lane: 'mutation',
      description: 'Table visual variant changed (striped, bordered, cards, etc.)',
      defaultPayloadSchema: '{ variant: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'table#<name>.variant:changed',
    },
  ],

  dialog: [
    {
      event: 'opened',
      lane: 'interaction',
      description: 'Modal or dialog displayed on screen',
      defaultPayloadSchema: '{ title?: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'dialog#<name>.opened',
    },
    {
      event: 'closed',
      lane: 'interaction',
      description: 'Modal or dialog closed',
      defaultPayloadSchema: '{}',
      supportsSessionSync: true,
      wscTriggerPattern: 'dialog#<name>.closed',
    },
    {
      event: 'dismissed',
      lane: 'interaction',
      description: 'Modal dismissed via escape or backdrop click',
      defaultPayloadSchema: '{}',
      supportsSessionSync: true,
      wscTriggerPattern: 'dialog#<name>.dismissed',
    },
    {
      event: 'confirm',
      lane: 'action',
      description: 'Dialog primary confirm button clicked',
      defaultPayloadSchema: '{}',
      supportsSessionSync: true,
      wscTriggerPattern: 'dialog#<name>.confirm',
    },
    {
      event: 'cancel',
      lane: 'action',
      description: 'Dialog cancel button clicked',
      defaultPayloadSchema: '{}',
      supportsSessionSync: true,
      wscTriggerPattern: 'dialog#<name>.cancel',
    },
  ],

  select: [
    {
      event: 'change',
      lane: 'interaction',
      description: 'Option selected or selection changed',
      defaultPayloadSchema: '{ value: string | string[]; option?: Record<string, unknown> }',
      supportsSessionSync: true,
      wscTriggerPattern: 'select#<name>.change',
    },
    {
      event: 'select',
      lane: 'interaction',
      description: 'Individual option chosen',
      defaultPayloadSchema: '{ value: string; option: Record<string, unknown> }',
      supportsSessionSync: true,
      wscTriggerPattern: 'select#<name>.select',
    },
    {
      event: 'deselect',
      lane: 'interaction',
      description: 'Individual option deselected in multi-select',
      defaultPayloadSchema: '{ value: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'select#<name>.deselect',
    },
    {
      event: 'open',
      lane: 'interaction',
      description: 'Dropdown options menu opened',
      defaultPayloadSchema: '{}',
      supportsSessionSync: false,
      wscTriggerPattern: 'select#<name>.open',
    },
    {
      event: 'close',
      lane: 'interaction',
      description: 'Dropdown options menu closed',
      defaultPayloadSchema: '{}',
      supportsSessionSync: false,
      wscTriggerPattern: 'select#<name>.close',
    },
    {
      event: 'clear',
      lane: 'interaction',
      description: 'Selection cleared',
      defaultPayloadSchema: '{}',
      supportsSessionSync: true,
      wscTriggerPattern: 'select#<name>.clear',
    },
  ],

  tabs: [
    {
      event: 'tab:change',
      lane: 'interaction',
      description: 'Active tab switched',
      defaultPayloadSchema: '{ activeKey: string; previousKey?: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'tabs#<name>.tab:change',
    },
    {
      event: 'tab:click',
      lane: 'interaction',
      description: 'Tab item clicked',
      defaultPayloadSchema: '{ key: string }',
      supportsSessionSync: true,
      wscTriggerPattern: 'tabs#<name>.tab:click',
    },
  ],

  form: [
    {
      event: 'submit',
      lane: 'action',
      description: 'Form submission triggered with serialized values',
      defaultPayloadSchema: '{ values: Record<string, unknown> }',
      supportsSessionSync: true,
      wscTriggerPattern: 'form#<name>.submit',
    },
    {
      event: 'reset',
      lane: 'action',
      description: 'Form values reset to initial state',
      defaultPayloadSchema: '{}',
      supportsSessionSync: true,
      wscTriggerPattern: 'form#<name>.reset',
    },
    {
      event: 'field:change',
      lane: 'interaction',
      description: 'Individual form field value changed',
      defaultPayloadSchema: '{ field: string; value: unknown }',
      supportsSessionSync: true,
      wscTriggerPattern: 'form#<name>.field:change',
    },
    {
      event: 'error',
      lane: 'action',
      description: 'Validation errors detected during form submission',
      defaultPayloadSchema: '{ errors: Record<string, string> }',
      supportsSessionSync: true,
      wscTriggerPattern: 'form#<name>.error',
    },
    {
      event: 'validated',
      lane: 'action',
      description: 'Form validation passed successfully',
      defaultPayloadSchema: '{ values: Record<string, unknown> }',
      supportsSessionSync: true,
      wscTriggerPattern: 'form#<name>.validated',
    },
  ],

  generic: [
    {
      event: 'prop:changed',
      lane: 'mutation',
      description: 'Property mutation recorded on object via .set() or .make()',
      defaultPayloadSchema: '{ prop: string; value: unknown; oldValue: unknown }',
      supportsSessionSync: true,
      wscTriggerPattern: '<type>#<name>.prop:changed',
    },
    {
      event: 'moved',
      lane: 'interaction',
      description: 'Object relocated in layout space or slot structure',
      defaultPayloadSchema: '{ to: string | [number, number]; placement: Record<string, unknown> }',
      supportsSessionSync: true,
      wscTriggerPattern: '<name>.moved',
    },
    {
      event: 'removed',
      lane: 'interaction',
      description: 'Object removed from parent surface and object graph',
      defaultPayloadSchema: '{ name: string }',
      supportsSessionSync: true,
      wscTriggerPattern: '<name>.removed',
    },
    {
      event: 'animated',
      lane: 'interaction',
      description: 'Animation cycle completed via .animate(name, opts)',
      defaultPayloadSchema: '{ animation: string }',
      supportsSessionSync: false,
      wscTriggerPattern: '<name>.animated',
    },
    {
      event: 'visibility:changed',
      lane: 'mutation',
      description: 'Object toggled between visible and hidden via .show() / .hide() / .toggle()',
      defaultPayloadSchema: '{ hidden: boolean }',
      supportsSessionSync: true,
      wscTriggerPattern: '<name>.visibility:changed',
    },
  ],
}

export const BACKEND_TRACKABLES: readonly TrackableDescriptor[] = [
  {
    event: 'store:created',
    lane: 'backend',
    description: 'A record was added to a collection (e.g. store.<collection>.record.created)',
    defaultPayloadSchema: '{ table: string; record: Record<string, unknown> }',
    supportsSessionSync: true,
    wscTriggerPattern: 'store.<name>.record.created or store.*.record.created',
  },
  {
    event: 'store:updated',
    lane: 'backend',
    description: 'A record was updated in a collection (store.<collection>.record.updated)',
    defaultPayloadSchema: '{ table: string; record: Record<string, unknown>; previous: Record<string, unknown> }',
    supportsSessionSync: true,
    wscTriggerPattern: 'store.<name>.record.updated or store.*.record.updated',
  },
  {
    event: 'store:deleted',
    lane: 'backend',
    description: 'A record was deleted from a collection (store.<collection>.record.deleted)',
    defaultPayloadSchema: '{ table: string; id: string; record: Record<string, unknown> }',
    supportsSessionSync: true,
    wscTriggerPattern: 'store.<name>.record.deleted',
  },
  {
    event: 'store:changed',
    lane: 'backend',
    description: 'General data lane frame notification across any store modification',
    defaultPayloadSchema: '{ store: string; action: "created" | "updated" | "deleted" }',
    supportsSessionSync: true,
    wscTriggerPattern: 'store:changed',
  },
  {
    event: 'cron:tick',
    lane: 'backend',
    description: 'Scheduled recurring background job fired by CronScheduler',
    defaultPayloadSchema: '{ schedule: string; timestamp: number }',
    supportsSessionSync: false,
    wscTriggerPattern: 'cron(every 1h) or cron(every 5m)',
  },
  {
    event: 'action:start',
    lane: 'action',
    description: 'Action execution initialized on server runner',
    defaultPayloadSchema: '{ action: string; input: unknown }',
    supportsSessionSync: true,
    wscTriggerPattern: 'action:start',
  },
  {
    event: 'action:success',
    lane: 'action',
    description: 'Action successfully completed and returned result',
    defaultPayloadSchema: '{ action: string; output: unknown }',
    supportsSessionSync: true,
    wscTriggerPattern: 'action:success',
  },
  {
    event: 'action:error',
    lane: 'action',
    description: 'Action execution failed with an uncaught error',
    defaultPayloadSchema: '{ action: string; error: string }',
    supportsSessionSync: true,
    wscTriggerPattern: 'action:error',
  },
  {
    event: 'deploy',
    lane: 'backend',
    description: 'Build compilation or container deployment lifecycle event',
    defaultPayloadSchema: '{ version: string; timestamp: number }',
    supportsSessionSync: false,
    wscTriggerPattern: 'deploy',
  },
  {
    event: 'channel:publish',
    lane: 'channel',
    description: 'Message published to a named real-time event channel',
    defaultPayloadSchema: '{ channel: string; payload: unknown }',
    supportsSessionSync: true,
    wscTriggerPattern: 'channel:<name>',
  },
  {
    event: 'channel:subscribe',
    lane: 'channel',
    description: 'Client or server listener attached to a real-time event channel',
    defaultPayloadSchema: '{ channel: string; scope: "public" | "private" | "system" }',
    supportsSessionSync: false,
    wscTriggerPattern: 'channel:<name>:subscribe',
  },
]

// ── Inspection & Reflection Helpers ─────────────────────────────────────────

/**
 * Returns the complete list of trackable event descriptors for a specific
 * object handle type (e.g. 'button', 'input', 'page', 'list', 'chart', 'link', 'text', 'box').
 */
export function getTrackablesForHandle(type: string): readonly TrackableDescriptor[] {
  const normalized = type.toLowerCase() as keyof HandleTrackableEventMap
  if (normalized in TRACKABLES_BY_HANDLE) {
    return TRACKABLES_BY_HANDLE[normalized]
  }
  return TRACKABLES_BY_HANDLE.generic
}

/**
 * Returns the complete guide with all elements, trackables, descriptions, and backend events.
 */
export function getAllTrackablesGuide(): HandleTrackablesGuide[] {
  const handleTypes: Array<keyof HandleTrackableEventMap> = [
    'button',
    'input',
    'table',
    'dialog',
    'select',
    'tabs',
    'form',
    'page',
    'list',
    'chart',
    'link',
    'text',
    'box',
  ]

  const guides: HandleTrackablesGuide[] = handleTypes.map((type) => ({
    type,
    label: `${type.charAt(0).toUpperCase() + type.slice(1)} Handle`,
    description: `Trackable events emitted by ${type} elements in WSC canvas and UI engine`,
    trackables: TRACKABLES_BY_HANDLE[type],
  }))

  guides.push({
    type: 'backend',
    label: 'Backend & Server Bus',
    description: 'Trackable store frames, scheduled cron tasks, action lifecycles, and channels on the server bus',
    trackables: BACKEND_TRACKABLES,
  })

  return guides
}
