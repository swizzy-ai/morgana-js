import { WizardEngine, Signal, createWizardConfig } from './index'

const request = process.argv[2] || 'create a wizard that writes poems based on user requests'

async function main() {
  console.log(`\n  Wizard Generation`)
  console.log(`  Request: "${request}"\n`)

  const cfg = createWizardConfig()
  const w = new WizardEngine(cfg)

  w.on(e => {
    switch (e.type) {
      case 'step:start':
        console.log(`  → [${e.step.id}] ${e.step.type} step`)
        break
      case 'step:complete':
        if (e.step.type === 'compute') {
          console.log(`    ← ${e.signal.type}${e.signal.type === 'goto' ? ` → ${e.signal.stepId}` : ''}`)
        } else {
          const preview = (e.result ?? '').slice(0, 80).replace(/\n/g, '\\n')
          console.log(`    ← "${preview}..."`)
          console.log(`    → ${e.signal.type}${e.signal.type === 'goto' ? ` → ${e.signal.stepId}` : ''}`)
        }
        break
      case 'done':
        console.log(`\n  ✓ Wizard complete.`)
        break
      case 'error':
        console.error(`  ✗ Error: ${e.error.message}`)
        break
    }
  })

  try {
    await w.run({ _request: request })
    const state = w.getState()

    console.log(`\n${'='.repeat(60)}`)
    console.log(`  WIZARD SPEC`)
    console.log(`${'='.repeat(60)}`)
    console.log()
    console.log(`  Name:        ${state.name}`)
    console.log(`  Purpose:     ${state.purpose}`)
    console.log(`  Personality: ${state.personality}`)
    console.log()
    console.log(`  Abilities (${state.abilities?.length ?? 0}):`)
    for (const a of (state.abilities ?? [])) {
      console.log(`    - ${a.name}: ${a.description}`)
      if (a.needsState && a.stateFields?.length) {
        console.log(`      state: [${a.stateFields.map((f: any) => f.name).join(', ')}]`)
      }
      if (a.needsOperation && a.operation) {
        console.log(`      op: ${a.operation.type} → ${a.operation.target}`)
      }
    }
    console.log()
    console.log(`  Dispatch commands:`)
    for (const cmd of (state.spec?.dispatch ?? [])) {
      console.log(`    ${cmd.type} ${cmd.entityType ?? ''} ${cmd.name ?? ''}`)
    }
    console.log()
    console.log(`  Event subscriptions:`)
    for (const sub of (state.spec?.subscriptions ?? [])) {
      console.log(`    on ${sub.trigger?.event ?? '?'}`)
    }
    console.log()

    console.log(`${'='.repeat(60)}`)
    console.log(`  RAW SPEC JSON`)
    console.log(`${'='.repeat(60)}`)
    console.log(JSON.stringify(state.spec, null, 2))

    console.log(`\n  ✅ Done\n`)
  } catch (err: any) {
    console.error(`\n  ❌ Wizard failed: ${err.message}\n`)
    process.exit(1)
  }
}

main()
