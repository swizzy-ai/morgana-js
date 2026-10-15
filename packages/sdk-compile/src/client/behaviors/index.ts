/**
 * Behavior assembly.
 *
 * Domain-partitioned so no single file grows without bound. `behaviorsPart()`
 * is what the client bundle calls.
 */
import { tableBehaviors } from './table'
import { overlayBehaviors } from './overlay'
import { inputBehaviors } from './inputs'
import { formBehaviors } from './forms'
import { navBehaviors } from './nav'
import { wave3Behaviors } from './wave3'

/**
 * The kinds each group drives. A project that uses none of a group's kinds
 * doesn't ship that group — most pages use a handful of the ninety kinds.
 */
export const BEHAVIOR_KINDS: Record<string, string[]> = {
  table: ['table'],
  overlay: ['tabs', 'dialog', 'drawer', 'accordion', 'dropdown', 'menu', 'popover', 'tooltip', 'toast', 'codeBlock'],
  inputs: ['alert', 'badge', 'combobox', 'editable', 'fileUpload', 'form', 'numberInput', 'pinInput', 'radioGroup', 'rating', 'slider', 'switch', 'tag', 'tagsInput', 'toggle', 'treeView', 'checkbox', 'select'],
  forms: ['form', 'login', 'signup'],
  nav: ['breadcrumbs'],
  wave3: ['datePicker', 'dateRange', 'radioGroup', 'pagination', 'collapsible', 'carousel', 'colorPicker', 'contextMenu', 'commandPalette'],
}

/** The behaviour scripts for the kinds in use (all of them when `kinds` is not given). */
export function behaviorsPart(kinds?: Set<string>): string[] {
  const on = (group: string) => !kinds || BEHAVIOR_KINDS[group]!.some((k) => kinds.has(k))
  return [
    ...(on('table') ? tableBehaviors() : []),
    ...(on('overlay') ? overlayBehaviors() : []),
    ...(on('inputs') ? inputBehaviors() : []),
    ...(on('forms') ? formBehaviors() : []),
    ...(on('nav') ? navBehaviors() : []),
    ...(on('wave3') ? wave3Behaviors() : []),
  ]
}

export { tableBehaviors, overlayBehaviors, inputBehaviors, formBehaviors, navBehaviors, wave3Behaviors }
