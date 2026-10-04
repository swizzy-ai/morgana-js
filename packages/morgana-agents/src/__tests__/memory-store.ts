/**
 * An in-memory `KeyValueStore`, so the registries can be tested without a KV
 * namespace and so the same suite runs in a Worker where one is unavailable.
 */
import type { KeyValueStore } from '../store'

export function memoryStore(seed: Record<string, unknown> = {}): KeyValueStore & {
  reads: number
  raw: Map<string, string>
} {
  const raw = new Map<string, string>()
  for (const [k, v] of Object.entries(seed)) raw.set(k, JSON.stringify(v))

  let reads = 0

  return {
    raw,
    get reads() {
      return reads
    },
    async get<T>(key: string): Promise<T | null> {
      reads++
      const hit = raw.get(key)
      if (hit === undefined) return null
      try {
        return JSON.parse(hit) as T
      } catch {
        return null
      }
    },
    async put(key: string, value: unknown) {
      raw.set(key, JSON.stringify(value))
    },
    async delete(key: string) {
      raw.delete(key)
    },
    async keys(prefix: string) {
      return [...raw.keys()].filter((k) => k.startsWith(prefix))
    },
  }
}
