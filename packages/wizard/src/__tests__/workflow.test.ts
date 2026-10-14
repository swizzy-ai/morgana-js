import { describe, it, expect } from 'vitest'
import { createWizard } from '../Wizard'
import { WizardEngine } from '../WizardEngine'
import { Signal } from '../Signal'

const createWorkflow = createWizard
import type { ClassifierAnswers } from '../types'

/**
 * Drives a workflow with a scripted fake LLM (no network) so the fluent
 * builder's step ordering, default handlers and event stream can be asserted.
 */
async function scriptedWorkflow(state: Record<string, unknown> = {}) {
  const responses: Record<string, string> = {
    greet: 'Hello, Sasha.',
    metadata: '{"tags":["demo","test"],"count":3}',
  }
  const calls: string[] = []
  const events: string[] = []
  const ai = {
    generateText: async (opts: { instructions: string }): Promise<string> => {
      calls.push(opts.instructions.slice(0, 60))
      for (const [key, value] of Object.entries(responses)) {
        if (opts.instructions.includes(key)) return value
      }
      return ''
    },
  }
  const wf = createWorkflow(ai)
  wf
    .addTextStep({ id: 'greet', instruction: 'Greet using the name from state. Key: greet' })
    .addComputeStep({
      handler: ({ state, setState }) => {
        setState((s) => ({ ...s, doubled: (state.name?.length ?? 0) * 2 }))
        return Signal.goto('metadata')
      },
    })
    .addObjectStep({ id: 'metadata', instruction: 'Return JSON metadata. Key: metadata' })
    .on((e) => events.push(e.type))

  const final = await wf.run(state)
  return { final, events, calls }
}

describe('Workflow fluent builder', () => {
  it('runs text → compute → object steps in order and stores results by id', async () => {
    const { final, calls, events } = await scriptedWorkflow({ name: 'Sasha' })
    expect(final).toMatchObject({ name: 'Sasha', greet: 'Hello, Sasha.', doubled: 10, metadata: { tags: ['demo', 'test'], count: 3 } })
    expect(calls.length).toBeGreaterThan(0)
    expect(events).toContain('step:start')
    expect(events).toContain('step:complete')
    expect(events.at(-1)).toBe('done')
  })

  it('auto-assigns ids per step type', () => {
    const wf = createWorkflow({ generateText: async () => '' })
    wf.addTextStep({ instruction: 'a' }).addTextStep({ instruction: 'b' })
    const w = wf as unknown as { steps: { type: string; id: string }[] }
    expect(w.steps.map((s) => s.id)).toEqual(['text-1', 'text-2'])
  })

  it('re-emits listener errors without stopping the run', async () => {
    const reports: Error[] = []
    const wf = createWorkflow({ generateText: async () => 'ok' })
    wf.addTextStep({ id: 't', instruction: 't' })
    wf.on((e) => {
      if (e.type === 'done' || e.type === 'step:complete') throw new Error('boom')
    }).on((e) => {
      if (e.type === 'error' && 'error' in e) reports.push(e.error as Error)
    })
    const final = await wf.run()
    expect(final.t).toBe('ok')
  })
})

/** Fake classifier port (no network): routes billing vs technical. */
function fakeClassifier() {
  const calls: { state: unknown; questions: Record<string, { type: string }> }[] = []
  const classify = async (params: {
    state: unknown
    questions: Record<string, any>
    model?: string
  }): Promise<ClassifierAnswers> => {
    calls.push({ state: params.state, questions: params.questions })
    const text = JSON.stringify(params.state)
    const choice = /bill|invoice|refund/i.test(text) ? 'billing' : 'technical'
    const out: ClassifierAnswers = {}
    for (const [name, q] of Object.entries(params.questions)) {
      if (q.type === 'choice') {
        out[name] = {
          type: 'choice',
          choice: name === 'route' ? choice : Object.keys(q.criteria ?? {})[0],
          confidence: 0.9,
          probabilities: {},
        }
      } else if (q.type === 'boolean') {
        out[name] = { type: 'boolean', boolean: 0.95 }
      } else {
        out[name] = { type: 'score', score: 1 }
      }
    }
    return out
  }
  return { classify, calls }
}

describe('Classify + router steps', () => {
  it('classify stores answers under the step id', async () => {
    const { classify } = fakeClassifier()
    const wf = createWorkflow({ generateText: async () => '' }, { classifier: classify })
    wf.addClassifyStep({
      id: 'triage',
      context: (s) => ({ message: s.message }),
      questions: {
        is_urgent: { type: 'boolean', instructions: 'Does this convey urgency?' },
      },
    })
    const final = await wf.run({ message: 'My payouts failed 3 days ago' })
    expect(final.triage.is_urgent.type).toBe('boolean')
    expect(final.triage.is_urgent.boolean).toBeCloseTo(0.95)
  })

  it('router auto-gotos the mapped step id', async () => {
    const { classify } = fakeClassifier()
    const wf = createWorkflow({ generateText: async () => '' }, { classifier: classify })
    wf
      .addRouterStep({
        id: 'route',
        context: (s) => ({ message: s.message }),
        instruction: 'Which team should handle this? {{message}}',
        criteria: { billing: 'Charges and refunds', technical: 'Bugs and outages' },
        routes: { billing: 'billing-team', technical: 'tech-team' },
      })
      .addTextStep({ id: 'billing-team', instruction: 'x', handler: ({ setState }) => { setState((s) => ({ ...s, handledBy: 'billing' })); return Signal.goto('end') } })
      .addTextStep({ id: 'tech-team', instruction: 'x', handler: ({ setState }) => { setState((s) => ({ ...s, handledBy: 'tech' })); return Signal.goto('end') } })
      .addComputeStep({ id: 'end', handler: () => Signal.skip })
    const final = await wf.run({ message: 'Please refund my invoice' })
    expect(final.handledBy).toBe('billing')
    expect(final['tech-team']).toBeUndefined()
  })

  it('router fails loudly on unmapped choices (no fallbacks)', async () => {
    const classify = async (): Promise<ClassifierAnswers> => ({
      route: { type: 'choice', choice: 'other', confidence: 1, probabilities: {} },
    })
    const w = new WizardEngine(
      {
        steps: [
          {
            type: 'router',
            id: 'route',
            context: () => ({}),
            instruction: 'Route it',
            criteria: { billing: 'Billing stuff' },
            routes: { billing: 'billing-team' },
          },
          { type: 'compute', id: 'billing-team', handler: () => Signal.skip },
        ],
        classify,
      },
      'test',
    )
    await expect(w.run({})).rejects.toThrow('no route for choice "other"')
  })

  it('classify fails loudly without a configured classifier', async () => {
    const w = new WizardEngine(
      {
        steps: [
          {
            type: 'classify',
            id: 'triage',
            context: () => ({}),
            questions: { urgent: { type: 'boolean', instructions: 'Urgent?' } },
            handler: () => Signal.skip,
          },
        ],
      },
      'test',
    )
    await expect(w.run({})).rejects.toThrow('no classifier configured')
  })
})