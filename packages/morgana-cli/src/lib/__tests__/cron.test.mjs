import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { describe, expect, it } from 'vitest'
import { CronScheduler, cronMatchesAt, isValidCronExpression } from '../cron.mjs'

describe('isValidCronExpression', () => {
  it('accepts the grammar the tick evaluates', () => {
    expect(isValidCronExpression('* * * * *')).toBe(true)
    expect(isValidCronExpression('*/15 9-17 * * 1-5')).toBe(true)
    expect(isValidCronExpression('second-30')).toBe(true)
  })

  it('rejects garbage before it reaches disk', () => {
    expect(isValidCronExpression('soon')).toBe(false)
    expect(isValidCronExpression('* * *')).toBe(false)
    expect(isValidCronExpression('second-0')).toBe(false)
    expect(isValidCronExpression(42)).toBe(false)
  })
})

describe('CronScheduler', () => {
  it('schedule/cancel/list round-trip with validation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-cron-'))
    try {
      const cron = new CronScheduler({ runAction: async () => null, persistFile: path.join(dir, 'crons.json') })
      await cron.schedule('nightly', { cron: '0 3 * * *', run: 'rollup' })
      await expect(cron.schedule('bad', { cron: 'soon', run: 'x' })).rejects.toThrow(/bad cron/)
      await expect(cron.schedule('nope', { cron: '* * * * *', run: '' })).rejects.toThrow(/needs a deployed action/)
      expect(await cron.list()).toEqual([{ name: 'nightly', cron: '0 3 * * *', run: 'rollup', params: undefined, enabled: true }])
      expect(await cron.cancel('nightly')).toBe(true)
      expect(await cron.cancel('nightly')).toBe(false)
      expect(await cron.list()).toEqual([])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('persists across restarts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-cron-'))
    try {
      const file = path.join(dir, 'crons.json')
      const a = new CronScheduler({ runAction: async () => null, persistFile: file })
      await a.schedule('hourly', { cron: '0 * * * *', run: 'tick' })
      const b = new CronScheduler({ runAction: async () => null, persistFile: file })
      expect((await b.list()).map((s) => s.name)).toEqual(['hourly'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fires once per matching minute even on a hot tick', async () => {
    const fired = []
    const cron = new CronScheduler({ runAction: async (name, params) => void fired.push([name, params]) })
    await cron.schedule('every-minute', { cron: '* * * * *', run: 'tick', params: { n: 1 } })
    const base = new Date('2026-01-01T00:00:10Z')
    await cron.tick(new Date(base.getTime()))
    await cron.tick(new Date(base.getTime() + 500))
    await cron.tick(new Date(base.getTime() + 20_000))
    expect(fired).toEqual([['tick', { n: 1 }]])
  })

  it('second-N fires per second, disabled entries never fire', async () => {
    const fired = []
    const cron = new CronScheduler({ runAction: async (name) => void fired.push(name) })
    await cron.schedule('fast', { cron: 'second-10', run: 'fast' })
    await cron.schedule('off', { cron: '* * * * *', run: 'off', enabled: false })
    await cron.tick(new Date('2026-01-01T00:00:20Z'))
    await cron.tick(new Date('2026-01-01T00:00:30Z'))
    expect(fired).toEqual(['fast', 'fast'])
  })

  it('a failing entry does not take the tick down', async () => {
    const fired = []
    const cron = new CronScheduler({
      runAction: async (name) => {
        if (name === 'boom') throw new Error('kaput')
        fired.push(name)
      },
    })
    await cron.schedule('boom', { cron: '* * * * *', run: 'boom' })
    await cron.schedule('ok', { cron: '* * * * *', run: 'ok' })
    await cron.tick(new Date('2026-01-01T00:00:00Z'))
    expect(fired).toEqual(['ok'])
  })

  it('cronMatchesAt agrees with the validator', () => {
    expect(cronMatchesAt('* * * * *', new Date('2026-06-15T12:34:00Z'))).toBe(true)
    expect(cronMatchesAt('30 12 * * *', new Date('2026-06-15T12:34:00Z'))).toBe(false)
    expect(cronMatchesAt('30 12 * * *', new Date('2026-06-15T12:30:00Z'))).toBe(true)
    expect(cronMatchesAt('garbage', new Date())).toBe(false)
  })
})
