/**
 * Collection writes must name declared columns — on both hosts.
 *
 * The worker stores a record as declared columns and silently dropped any
 * other field; `morgana dev` stored the whole record. So a field the author
 * forgot to declare worked locally and vanished deployed. Both hosts now refuse
 * the write instead, naming the field and the fix, so the mistake shows up the
 * first time the action runs under `morgana dev`.
 */

/** Fields every record carries implicitly, under either host's spelling. */
const IMPLICIT = new Set(['id', 'createdAt', 'updatedAt', 'created_at', 'updated_at'])

interface ShapeLike {
  columns?: Array<{ name: string }>
}

/** Fields of `data` that `shape` does not declare. Empty for an undeclared shape (no columns). */
export function undeclaredFields(shape: ShapeLike | null | undefined, data: unknown): string[] {
  const cols = shape?.columns
  if (!Array.isArray(cols) || !cols.length || !data || typeof data !== 'object') return []
  const declared = new Set(cols.map((c) => c.name))
  return Object.keys(data as Record<string, unknown>).filter((k) => !declared.has(k) && !IMPLICIT.has(k))
}

export function assertDeclaredFields(collection: string, shape: ShapeLike | null | undefined, data: unknown): void {
  const extra = undeclaredFields(shape, data)
  if (!extra.length) return
  const list = extra.map((f) => `"${f}"`).join(', ')
  throw Object.assign(
    new Error(
      `collection "${collection}" has no column ${list} — declare it in the collection's columns ` +
        `(e.g. { name: '${extra[0]}', type: 'json' }); undeclared fields are not stored`,
    ),
    { status: 400 },
  )
}
