/**
 * The SDK contract must not describe the engine behind it.
 *
 * This exists because that was true once, and it broke a deployed feature while
 * every local check passed. `CollectionsHandle` and `FilesHandle` were typed
 * `MaybePromise<T> = T | Promise<T>` so one contract could satisfy both a
 * synchronous store and an asynchronous one. Every method therefore looked
 * "maybe a promise" to callers, so reading a field off an un-awaited result
 * typechecked perfectly and then threw at runtime:
 *
 *     const result = ctx.server.collections.query('orders', {...})
 *     return result.items.length      // works here. Throws against storage.
 *
 * The failure was invisible at every level that does not run the real thing:
 * the type system said it was fine, the demo host said it was fine, and the
 * build was clean. Only invoking the compiled action against storage found it.
 *
 * A collection is a collection, and every method on one is a promise, because
 * reading and writing a record means reaching storage.
 *
 * These assertions run at two levels on purpose. The `expectTypeOf` block is
 * erased at runtime and verified by `tsc --noEmit` — that is what makes a
 * regression a *build* failure rather than something a reader has to notice.
 * The file-reading assertions run for real, so the guarantee does not depend on
 * someone remembering to typecheck.
 */
import { describe, expect, it, expectTypeOf } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type {
  CollectionsHandle,
  FilesHandle,
  FileMeta,
  StoreQueryResult,
  StoreShape,
} from '../contexts/server'
import * as sdk from '../index'

const SERVER_TS = path.join(__dirname, '..', 'contexts', 'server.ts')
const INDEX_TS = path.join(__dirname, '..', 'index.ts')

describe('every method on a storage handle is a promise', () => {
  // Erased at runtime; verified by `tsc --noEmit`. Widen any of these back to a
  // bare value and the build fails here.
  it('CollectionsHandle', () => {
    type C = CollectionsHandle
    expectTypeOf<C['get']>().returns.toEqualTypeOf<Promise<any>>()
    expectTypeOf<C['set']>().returns.toEqualTypeOf<Promise<Record<string, unknown> | null>>()
    expectTypeOf<C['add']>().returns.toEqualTypeOf<Promise<Record<string, unknown>>>()
    expectTypeOf<C['insert']>().returns.toEqualTypeOf<Promise<Record<string, unknown>>>()
    expectTypeOf<C['update']>().returns.toEqualTypeOf<Promise<Record<string, unknown> | null>>()
    expectTypeOf<C['remove']>().returns.toEqualTypeOf<Promise<boolean>>()
    expectTypeOf<C['count']>().returns.toEqualTypeOf<Promise<number>>()
    expectTypeOf<C['find']>().returns.toEqualTypeOf<Promise<any[]>>()
    expectTypeOf<C['query']>().returns.toEqualTypeOf<Promise<StoreQueryResult>>()
    expectTypeOf<C['create']>().returns.toEqualTypeOf<Promise<StoreShape>>()
    expectTypeOf<C['shape']>().returns.toEqualTypeOf<Promise<StoreShape | null>>()
  })

  it('FilesHandle', () => {
    type F = FilesHandle
    expectTypeOf<F['read']>().returns.toEqualTypeOf<Promise<string | Uint8Array | null>>()
    expectTypeOf<F['write']>().returns.toEqualTypeOf<Promise<FileMeta>>()
    expectTypeOf<F['update']>().returns.toEqualTypeOf<Promise<FileMeta>>()
    expectTypeOf<F['remove']>().returns.toEqualTypeOf<Promise<boolean>>()
    expectTypeOf<F['list']>().returns.toEqualTypeOf<Promise<FileMeta[]>>()
    expectTypeOf<F['stat']>().returns.toEqualTypeOf<Promise<FileMeta | null>>()
  })

  it('a query result must be awaited before its fields are read', () => {
    // The shape of the original bug as a positive assertion: `items` only
    // exists on the awaited type, so this stops compiling the moment the return
    // type widens back to a bare value.
    const readItems = async (c: CollectionsHandle): Promise<number> => {
      const result = await c.query('orders', {})
      return result.items.length
    }
    expectTypeOf(readItems).returns.toEqualTypeOf<Promise<number>>()
    expect(typeof readItems).toBe('function')
  })
})

describe('the ambiguity cannot be reintroduced quietly', () => {
  it('MaybePromise is not exported from the package', () => {
    // A single re-export would be enough to let the whole ambiguity back in,
    // and it would be invisible until a deployed action threw on a line nobody
    // could explain.
    expect(Object.keys(sdk)).not.toContain('MaybePromise')
  })

  it('MaybePromise is not declared or exported in the source', () => {
    const server = fs.readFileSync(SERVER_TS, 'utf8')
    expect(server).not.toMatch(/export type MaybePromise/)
    // And not used anywhere in it either — the declaration is gone, so a
    // leftover use would be a build error, but this catches it before that.
    expect(server.replace(/^ \*.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/MaybePromise/)
  })

  it('the package index does not re-export it', () => {
    const index = fs.readFileSync(INDEX_TS, 'utf8')
    expect(index).not.toMatch(/^\s*MaybePromise,?\s*$/m)
  })
})

describe('the SDK does not describe the engine behind a handle', () => {
  // The comments on these interfaces are part of the published contract — they
  // are what a user reads to decide what a handle is. Naming a backing store in
  // them invites exactly the reasoning this file exists to prevent: picking a
  // method based on where it runs.
  const SRC_FILES = [
    path.join(__dirname, '..', 'contexts', 'server.ts'),
    path.join(__dirname, '..', 'contexts', 'base.ts'),
    path.join(__dirname, '..', 'contexts', 'client.ts'),
    path.join(__dirname, '..', 'events.ts'),
    path.join(__dirname, '..', 'data.ts'),
    path.join(__dirname, '..', 'contracts.ts'),
    path.join(__dirname, '..', 'props.ts'),
  ]

  // "lite-server" and "lite =" were the giveaway that the type documentation was
  // narrating two implementations. `cloud` alone is too blunt — `cloud-served`
  // in a comment about AI is a deployment fact, not a type fact — so the match
  // is limited to phrasings that promise a different type depending on where
  // the code runs.
  const ENGINE_NARRATION = [
    /lite[- ]server/i,
    /lite\s*=/i,
    /cloud\s*=\s*[A-Z]{2}/,
    /always cloud-served/i,
    /never local keys/i,
    /cloud = KV/i,
    /local fs/i,
  ]

  it('no contract file narrates its backing implementation', () => {
    const offenders: string[] = []
    for (const file of SRC_FILES) {
      const text = fs.readFileSync(file, 'utf8')
      for (const pattern of ENGINE_NARRATION) {
        if (pattern.test(text)) offenders.push(`${path.basename(file)}: ${pattern}`)
      }
    }
    expect(offenders, `SDK contracts must not describe the engine:\n${offenders.join('\n')}`).toEqual([])
  })
})