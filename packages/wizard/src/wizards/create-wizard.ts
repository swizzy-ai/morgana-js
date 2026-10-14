import { Signal } from '../Signal'
import type { WizardConfig } from '../types'

function current(state: any) {
  const idx = state.currentAbilityIndex ?? 0
  return state.abilities?.[idx]
}

export function createWizard(): WizardConfig {
  return {
    steps: [
      {
        type: 'object',
        id: 'discover',
        instruction: `You are designing a wizard for an interactive environment.

Request: {{request}}

Return a JSON object with:
- "name": short kebab-case name for the wizard
- "purpose": one sentence describing what it does
- "abilities": array of abilities this wizard can perform.
  Each ability: { "name": short name, "description": what it does }

Make abilities concrete and actionable. 2-4 abilities is good.`,
        context: s => ({ request: s._request }),
        handler: ctx => {
          const { name, purpose, abilities } = ctx.json
          if (!abilities || !Array.isArray(abilities) || abilities.length === 0) {
            return Signal.retry()
          }
          ctx.setState(prev => ({
            ...prev,
            name: name || 'wizard',
            purpose: purpose || '',
            abilities: abilities.map((a: any) => ({
              name: a.name,
              description: a.description,
              needsState: false,
              stateFields: null,
              needsOperation: false,
              operation: null,
              trigger: null,
              closeInstruction: null,
            })),
            currentAbilityIndex: 0,
          }))
          return Signal.goto('loop-check')
        },
      },

      {
        type: 'compute',
        id: 'loop-check',
        handler: ctx => {
          const idx = ctx.state.currentAbilityIndex ?? 0
          if (idx >= (ctx.state.abilities?.length ?? 0)) {
            return Signal.goto('personality')
          }
          return Signal.goto('state-needed')
        },
      },

      {
        type: 'select',
        id: 'state-needed',
        instruction: `Ability "{{ability_name}}": {{ability_description}}

Does this ability need to track any dedicated state?

State is data the ability remembers while working:
- current status
- temporary data
- flags and counters
- references to other objects`,
        context: s => {
          const a = current(s)
          return { ability_name: a?.name, ability_description: a?.description }
        },
        options: [
          { id: 'yes', label: 'Yes — needs state fields' },
          { id: 'no', label: 'No — no dedicated state needed' },
        ],
        handler: ctx => {
          const idx = ctx.state.currentAbilityIndex ?? 0
          ctx.setState(prev => {
            const abilities = [...prev.abilities]
            abilities[idx] = { ...abilities[idx], needsState: ctx.option === 'yes' }
            return { ...prev, abilities }
          })
          if (ctx.option === 'yes') return Signal.goto('design-state')
          return Signal.goto('operation-needed')
        },
      },

      {
        type: 'object',
        id: 'design-state',
        instruction: `Design the state fields for ability "{{ability_name}}".

Return JSON with a "fields" array. Each field:
{ "name": string, "type": "string" | "number" | "boolean", "default": any, "description": string }

Keep it minimal — only fields this ability truly needs to remember.`,
        context: s => {
          const a = current(s)
          return { ability_name: a?.name }
        },
        handler: ctx => {
          const idx = ctx.state.currentAbilityIndex ?? 0
          ctx.setState(prev => {
            const abilities = [...prev.abilities]
            abilities[idx] = {
              ...abilities[idx],
              stateFields: ctx.json?.fields ?? [],
            }
            return { ...prev, abilities }
          })
          return Signal.goto('operation-needed')
        },
      },

      {
        type: 'select',
        id: 'operation-needed',
        instruction: `Ability "{{ability_name}}": {{ability_description}}

Does this ability perform an action in the world?

An operation is a dispatch command like:
- create — make a new object
- set — update state/property
- generate — call the LLM
- update — modify a record
- close — close a queue item
- send — send a message`,
        context: s => {
          const a = current(s)
          return { ability_name: a?.name, ability_description: a?.description }
        },
        options: [
          { id: 'yes', label: 'Yes — performs an action' },
          { id: 'no', label: 'No — internal / passive' },
        ],
        handler: ctx => {
          const idx = ctx.state.currentAbilityIndex ?? 0
          ctx.setState(prev => {
            const abilities = [...prev.abilities]
            abilities[idx] = { ...abilities[idx], needsOperation: ctx.option === 'yes' }
            return { ...prev, abilities }
          })
          if (ctx.option === 'yes') return Signal.goto('design-operation')
          return Signal.goto('trigger')
        },
      },

      {
        type: 'object',
        id: 'design-operation',
        instruction: `Design the operation for ability "{{ability_name}}".

Return JSON with:
- "type": command type (create, set, generate, update, close, send, etc.)
- "target": what it targets (object name or pattern)
- "property": optional property path
- "value": optional value, template, or description
- "description": what this operation does in one line`,
        context: s => {
          const a = current(s)
          return { ability_name: a?.name }
        },
        handler: ctx => {
          const idx = ctx.state.currentAbilityIndex ?? 0
          ctx.setState(prev => {
            const abilities = [...prev.abilities]
            abilities[idx] = { ...abilities[idx], operation: ctx.json }
            return { ...prev, abilities }
          })
          return Signal.goto('trigger')
        },
      },

      {
        type: 'text',
        id: 'trigger',
        instruction: `For ability "{{ability_name}}": {{ability_description}}

What event or condition triggers this ability?

Be specific. Examples:
- "When a new item appears on the queue"
- "When a user sends a message to the wizard"
- "When the state.status changes to ready"
- "When another ability completes its work"`,
        context: s => {
          const a = current(s)
          return { ability_name: a?.name, ability_description: a?.description }
        },
        handler: ctx => {
          const idx = ctx.state.currentAbilityIndex ?? 0
          ctx.setState(prev => {
            const abilities = [...prev.abilities]
            abilities[idx] = { ...abilities[idx], trigger: ctx.result }
            return { ...prev, abilities }
          })
          return Signal.goto('close')
        },
      },

      {
        type: 'text',
        id: 'close',
        instruction: `For ability "{{ability_name}}": {{ability_description}}

What instruction template should the LLM use when processing a task for this ability?

Write a clear prompt template explaining:
- What the LLM should do
- What context it has access to
- What format the output should be in

Use {{placeholders}} for values that come from state or context.`,
        context: s => {
          const a = current(s)
          return { ability_name: a?.name, ability_description: a?.description }
        },
        handler: ctx => {
          const idx = ctx.state.currentAbilityIndex ?? 0
          ctx.setState(prev => {
            const abilities = [...prev.abilities]
            abilities[idx] = { ...abilities[idx], closeInstruction: ctx.result }
            const nextIdx = idx + 1
            return { ...prev, abilities, currentAbilityIndex: nextIdx }
          })
          return Signal.goto('loop-check')
        },
      },

      {
        type: 'select',
        id: 'personality',
        instruction: `What conversational personality should "{{name}}" have?`,
        context: s => ({ name: s.name }),
        options: [
          { id: 'professional', label: 'Professional — clear, direct, business-like' },
          { id: 'friendly', label: 'Friendly — warm, helpful, approachable' },
          { id: 'poetic', label: 'Poetic — creative, expressive, artistic' },
          { id: 'technical', label: 'Technical — precise, detailed, thorough' },
          { id: 'concise', label: 'Concise — brief, to-the-point, minimal' },
        ],
        handler: ctx => {
          ctx.setState(prev => ({ ...prev, personality: ctx.option }))
          return Signal.goto('assemble')
        },
      },

      {
        type: 'compute',
        id: 'assemble',
        handler: ctx => {
          const state = ctx.state

          const objects: any[] = []
          const subscriptions: any[] = []

          objects.push({
            type: 'create',
            entityType: 'queue',
            name: `${state.name}_queue`,
            args: { persist: true },
          })

          const initialVals: Record<string, any> = {
            status: 'idle',
            personality: state.personality,
          }
          for (const a of (state.abilities ?? [])) {
            if (a.stateFields?.length) {
              for (const f of a.stateFields) {
                initialVals[`${a.name}_${f.name}`] = f.default ?? null
              }
            }
          }
          objects.push({
            type: 'create',
            entityType: 'state',
            name: `${state.name}_state`,
            args: { value: initialVals },
          })

          objects.push({
            type: 'create',
            entityType: 'store',
            name: `${state.name}_instructions`,
            args: { persist: true },
          })

          for (const ability of (state.abilities ?? [])) {
            if (ability.trigger) {
              subscriptions.push({
                trigger: { type: 'event', event: ability.trigger },
                operations: [{
                  type: 'generate',
                  target: `${state.name}_queue`,
                  instruction: ability.closeInstruction || `Perform ${ability.name}`,
                }],
              })
            }
          }

          const spec = {
            name: state.name,
            purpose: state.purpose,
            personality: state.personality,
            abilities: state.abilities.map((a: any) => ({
              name: a.name,
              description: a.description,
              state: a.needsState ? (a.stateFields ?? []) : null,
              operation: a.needsOperation ? a.operation : null,
              trigger: a.trigger,
              instruction: a.closeInstruction,
            })),
            dispatch: objects,
            subscriptions,
          }

          ctx.setState(prev => ({ ...prev, spec }))
          return Signal.stop
        },
      },
    ],
  }
}
