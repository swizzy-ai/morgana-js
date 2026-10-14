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

export function behaviorsPart(): string[] {
  return [
    ...tableBehaviors(),
    ...overlayBehaviors(),
    ...inputBehaviors(),
    ...formBehaviors(),
    ...navBehaviors(),
    ...wave3Behaviors(),
  ]
}

export { tableBehaviors, overlayBehaviors, inputBehaviors, formBehaviors, navBehaviors, wave3Behaviors }
