/**
 * Store engine — collections on SQLite. The backend's foundation, so it is
 * tested like one: coercion, every operator, paging, persistence, and the
 * error messages an action author will actually hit.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { StoreEngine } from '../lib/store.mjs'

let dir

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'morgana-store-'))
})

function engine() {
  return new StoreEngine({ file: ':memory:' })
}

function seeded() {
  const e = engine()
  e.create('orders', {
    columns: [
      { name: 'total', type: 'number' },
      { name: 'status', type: 'string' },
      { name: 'paid', type: 'boolean' },
    ],
  })
  e.add('orders', { total: 99, status: 'new', paid: 'true' })
  e.add('orders', { total: 10, status: 'new' })
  e.add('orders', { total: 55, status: 'paid' })
  return e
}

describe('shapes', () => {
  it('records a shape and reads it back', () => {
    const e = engine()
    const shape = { columns: [{ name: 'total', type: 'number' }] }
    e.create('orders', shape)
    expect(e.shape('orders')).toEqual(shape)
    expect(e.shape('nope')).toBeNull()
  })

  it('re-declaring without a shape keeps the recorded one', () => {
    const e = engine()
    e.create('orders', { columns: [{ name: 'total', type: 'number' }] })
    expect(e.create('orders')).toEqual({ columns: [{ name: 'total', type: 'number' }] })
  })

  it('accepts a multi-table shape', () => {
    const e = engine()
    const shape = { tables: [{ name: 'lines', columns: [{ name: 'qty', type: 'number' }] }] }
    e.create('orders', shape)
    e.add('orders', { qty: '4' })
    expect(e.get('orders')[0].qty).toBe(4)
  })

  it('rejects a name that is not a safe identifier', () => {
    const e = engine()
    expect(() => e.create('bad name', {})).toThrow(/invalid collection name/)
    expect(() => e.create('drop; table', {})).toThrow(/invalid collection name/)
  })

  it('rejects an unknown column type', () => {
    const e = engine()
    expect(() => e.create('x', { columns: [{ name: 'c', type: 'weird' }] })).toThrow(/unknown type/)
  })

  it('lists declared collections, including empty ones', () => {
    const e = engine()
    e.create('orders', { columns: [] })
    e.create('empty', { columns: [] })
    expect(e.names().sort()).toEqual(['empty', 'orders'])
  })
})

describe('type coercion', () => {
  it('coerces to the declared type and keeps undeclared fields', () => {
    const e = engine()
    e.create('t', {
      columns: [
        { name: 'n', type: 'number' },
        { name: 'b', type: 'boolean' },
        { name: 'd', type: 'date' },
        { name: 'j', type: 'json' },
      ],
    })
    const r = e.add('t', { n: '42', b: 'true', d: 0, j: { a: 1 }, extra: 'kept' })
    expect(r.n).toBe(42)
    expect(r.b).toBe(1)
    expect(r.d).toBe('1970-01-01T00:00:00.000Z')
    expect(JSON.parse(String(r.j))).toEqual({ a: 1 })
    // A shape declares, it does not cage.
    expect(r.extra).toBe('kept')
  })

  it('rejects a value it cannot coerce rather than storing junk', () => {
    const e = engine()
    e.create('t', { columns: [{ name: 'n', type: 'number' }] })
    expect(e.add('t', { n: 'abc' }).n).toBeNull()
  })
})

describe('crud', () => {
  it('adds with a generated id and stamps timestamps', () => {
    const e = seeded()
    const r = e.add('orders', { total: 1 })
    expect(typeof r.id).toBe('string')
    expect(r.id.length).toBeGreaterThan(8)
    expect(typeof r.createdAt).toBe('number')
  })

  it('insert honours a caller-supplied id', () => {
    const e = seeded()
    e.insert('orders', { id: 'fixed', total: 7 })
    expect(e.get('orders', 'fixed').total).toBe(7)
  })

  it('set creates or overwrites at an id', () => {
    const e = seeded()
    e.set('orders', 'k1', { total: 5 })
    expect(e.get('orders', 'k1').total).toBe(5)
    e.set('orders', 'k1', { total: 6 })
    expect(e.count('orders')).toBe(4)
    expect(e.get('orders', 'k1').total).toBe(6)
  })

  it('set requires an id', () => {
    const e = seeded()
    expect(() => e.set('orders', '', {})).toThrow(/non-empty id/)
  })

  it('update merges, and reports an unknown id as null', () => {
    const e = seeded()
    const r = e.query('orders', { sort: { field: 'total', dir: 'asc' } }).items[0]
    const merged = e.update('orders', r.id, { status: 'shipped' })
    expect(merged.total).toBe(r.total)
    expect(merged.status).toBe('shipped')
    expect(e.update('orders', 'nope', { x: 1 })).toBeNull()
  })

  it('remove reports whether anything was deleted', () => {
    const e = seeded()
    expect(e.remove('orders', 'nope')).toBe(false)
    const r = e.all('orders')[0]
    expect(e.remove('orders', r.id)).toBe(true)
    expect(e.count('orders')).toBe(2)
  })

  it('get without an id returns every record', () => {
    const e = seeded()
    expect(e.get('orders')).toHaveLength(3)
  })
})

describe('query', () => {
  it('sorts ascending and descending', () => {
    const e = seeded()
    expect(e.query('orders', { sort: { field: 'total', dir: 'asc' } }).items.map((r) => r.total)).toEqual([10, 55, 99])
    expect(e.query('orders', { sort: { field: 'total', dir: 'desc' } }).items.map((r) => r.total)).toEqual([99, 55, 10])
  })

  it('paginates and reports the full result window', () => {
    const e = seeded()
    const page1 = e.query('orders', { sort: { field: 'total', dir: 'asc' }, page: 1, pageSize: 2 })
    expect(page1.items.map((r) => r.total)).toEqual([10, 55])
    expect(page1).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 })
    const page2 = e.query('orders', { sort: { field: 'total', dir: 'asc' }, page: 2, pageSize: 2 })
    expect(page2.items.map((r) => r.total)).toEqual([99])
  })

  it('clamps a page past the end to an empty result, not an error', () => {
    const e = seeded()
    const res = e.query('orders', { page: 99, pageSize: 2 })
    expect(res.items).toEqual([])
    expect(res.total).toBe(3)
  })

  it('filters with where clauses and every operator', () => {
    const e = seeded()
    const cases = [
      ['eq', 'new', 2],
      ['ne', 'new', 1],
      ['gte', 50, 2],
      ['gt', 55, 1],
      ['lt', 55, 1],
      ['lte', 55, 2],
      ['in', ['paid'], 1],
      ['nin', ['paid'], 2],
      ['contains', 'e', 2],
      ['startsWith', 'ne', 2],
      ['endsWith', 'id', 1],
    ]
    for (const [op, value, expected] of cases) {
      const res = e.query('orders', { where: [{ field: op === 'eq' || op === 'ne' || op === 'in' || op === 'nin' || op === 'contains' || op === 'startsWith' || op === 'endsWith' ? 'status' : 'total', op, value }] })
      expect(res.total, `op ${op}`).toBe(expected)
    }
  })

  it('matches booleans as 0/1', () => {
    const e = seeded()
    expect(e.query('orders', { where: [{ field: 'paid', op: 'eq', value: 1 }] }).total).toBe(1)
  })

  it('accepts a shorthand filter object', () => {
    const e = seeded()
    expect(e.query('orders', { filter: { status: 'new' } }).total).toBe(2)
    expect(e.query('orders', { filter: { status: ['new', 'paid'] } }).total).toBe(3)
  })

  it('projects a field subset', () => {
    const e = seeded()
    const items = e.query('orders', { fields: ['status'] }).items
    expect(Object.keys(items[0]).sort()).toEqual(['id', 'status'])
  })

  it('count respects a filter, and is cheap without one', () => {
    const e = seeded()
    expect(e.count('orders')).toBe(3)
    expect(e.count('orders', { filter: { status: 'new' } })).toBe(2)
  })

  it('find filters in memory and survives a throwing predicate', () => {
    const e = seeded()
    expect(e.find('orders', (r) => r.total > 20)).toHaveLength(2)
    expect(e.find('orders', () => { throw new Error('boom') })).toEqual([])
    expect(e.find('orders')).toHaveLength(3)
  })

  it('refuses to query a collection that was never declared', () => {
    const e = engine()
    expect(() => e.query('nope')).toThrow(/not declared/)
    expect(() => e.add('nope', {})).toThrow(/not declared/)
    // The message names the fix, not just the failure.
    expect(() => e.query('nope')).toThrow(/collections\.create/)
  })
})

describe('persistence', () => {
  it('survives a reopen', () => {
    const file = path.join(dir, 'store.db')
    const a = new StoreEngine({ file })
    a.create('t', { columns: [{ name: 'v', type: 'number' }] })
    a.add('t', { v: 7 })
    a.close()

    const b = new StoreEngine({ file })
    expect(b.shape('t')).toEqual({ columns: [{ name: 'v', type: 'number' }] })
    expect(b.get('t')[0].v).toBe(7)
    b.close()
  })

  it('is deterministic when the clock and id factory are injected', () => {
    const a = new StoreEngine({ file: ':memory:', now: () => 1000, id: () => 'fixed-id' })
    a.create('t', { columns: [{ name: 'v', type: 'number' }] })
    const r = a.add('t', { v: 1 })
    expect(r.id).toBe('fixed-id')
    expect(r.createdAt).toBe(1000)
    expect(r.updatedAt).toBe(1000)
  })

  it('dumps every collection', () => {
    const e = seeded()
    e.create('empty', { columns: [] })
    const dump = e.dump()
    expect(Object.keys(dump).sort()).toEqual(['empty', 'orders'])
    expect(dump.orders).toHaveLength(3)
  })
})
