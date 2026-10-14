import { describe, it, expect } from 'vitest'
import { createWizard } from '../Wizard'
import { buildWizardService, type WizardRunStore } from '../runs'
import { Signal } from '../Signal'

function memoryStore(): WizardRunStore {
  const map = new Map<string, unknown>()
  return {
    async get<T>(key: string): Promise<T | null> {
      return (map.has(key) ? (map.get(key) as T) : null)
    },
    async put(key, value) {
      map.set(key, value)
    },
    async delete(key) {
      map.delete(key)
    },
    async keys(prefix) {
      return [...map.keys()].filter((k) => k.startsWith(prefix))
    },
  }
}

const ai = { generateText: async () => 'ok' }

function service() {
  return buildWizardService({ generateText: async () => 'ok', store: memoryStore(), prefix: 'wizards:test:p1' })
}

describe('ctx.ai.wizard durable runs', () => {
  it('runs a plain wizard to completion', async () => {
    const w = createWizard(ai).addTextStep({ id: 'greet', instruction: 'greet' })
    const svc = service()
    const result = await svc.run('plain', w)
    expect(result.status).toBe('done')
    const meta = await svc.get('plain')
    expect(meta?.status).toBe('done')
    expect(meta?.stepId).toBeNull()
  })

  it('parks at an approval gate, then completes on approve', async () => {
    const w = createWizard(ai)
      .addTextStep({ id: 'greet', instruction: 'greet' })
      .addApprovalStep({ id: 'gate' })
      .addTextStep({ id: 'after', instruction: 'after' })

    const svc = service()
    const parked = await svc.run('run-1', w)
    expect(parked.status).toBe('paused')
    expect(parked.state?._waits?.gate?.status).toBe('awaiting')

    const meta = await svc.get('run-1')
    expect(meta?.status).toBe('paused')
    expect(meta?.stepId).toBe('gate')

    const done = await svc.approve('run-1', w, { comment: 'lgtm' })
    expect(done.status).toBe('done')
    expect(done.state?._waits?.gate?.status).toBe('approved')
    expect(done.state?.after).toBe('ok')
  })

  it('a deny with no catch fails the run', async () => {
    const w = createWizard(ai)
      .addTextStep({ id: 'greet', instruction: 'greet' })
      .addApprovalStep({ id: 'gate' })
      .addTextStep({ id: 'after', instruction: 'after' })

    const svc = service()
    await svc.run('run-2', w)
    const failed = await svc.deny('run-2', w, { comment: 'no' })
    expect(failed.status).toBe('failed')
  })

  it('`run` on a finished id starts over only when no checkpoint exists', async () => {
    const w = createWizard(ai).addTextStep({ id: 'greet', instruction: 'greet' })
    const svc = service()
    await svc.run('run-3', w)
    // Second run finds the checkpoint and resumes; already done, so still done.
    const again = await svc.run('run-3', w)
    expect(again.status).toBe('done')
  })

  it('resume refuses an unknown id', async () => {
    const w = createWizard(ai).addTextStep({ id: 'greet', instruction: 'greet' })
    const svc = service()
    await expect(svc.resume('missing', w)).rejects.toThrow(/no run/)
  })

  it('lists, reports existence, and removes', async () => {
    const w = createWizard(ai).addTextStep({ id: 'greet', instruction: 'greet' })
    const svc = service()
    await svc.run('a', w)
    await svc.run('b', w)
    expect((await svc.list()).map((m) => m.id).sort()).toEqual(['a', 'b'])
    expect(await svc.has('a')).toBe(true)
    expect(await svc.remove('a')).toBe(true)
    expect(await svc.remove('a')).toBe(false)
    expect(await svc.has('a')).toBe(false)
  })

  it('resumes a pauseWhile gate by supplying the awaited state', async () => {
    const w = createWizard(ai).addComputeStep({
      id: 'wait',
      handler: () => Signal.pauseWhile((s: any) => s?.ready !== true),
    })
    const svc = service()
    const parked = await svc.run('pw', w)
    expect(parked.status).toBe('paused')
    const done = await svc.resume('pw', w, { state: { ready: true } })
    expect(done.status).toBe('done')
  })
})
