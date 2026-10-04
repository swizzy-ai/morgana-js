/**
 * Tool parameter shapes → JSON Schema, and the check that runs before a call.
 *
 * The schema is what the model is *told*. The check is what happens when the
 * model gets it wrong, and the two are deliberately separate: a mismatch
 * reports the problem back to the model as a tool error, because a model that
 * is told "reason is required" will fix it on the next turn, whereas a run that
 * dies on the first mistake answers nothing.
 */

import type { ToolParams } from './types'

/** One property, in the shape the providers accept. */
export interface ToolSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
}

export interface ToolSchema {
  type: 'object'
  properties: Record<string, ToolSchemaProperty>
  required?: string[]
}

const KNOWN: Record<string, ToolSchemaProperty['type']> = {
  string: 'string',
  text: 'string',
  number: 'number',
  float: 'number',
  int: 'integer',
  integer: 'integer',
  boolean: 'boolean',
  bool: 'boolean',
  array: 'array',
  list: 'array',
  object: 'object',
  record: 'object',
}

/**
 * The type a bare string names, or `undefined` when it names none.
 *
 * An unknown word is not an error. It is left off the schema and the check, so a
 * project that invents `'money'` still gets a working tool with no constraints —
 * a weaker prompt beats a build failure over a word in a shape.
 */
function typeOf(word: string): ToolSchemaProperty['type'] | undefined {
  return KNOWN[word.trim().toLowerCase()]
}

/**
 * Turn a `ToolParams` shape into JSON Schema.
 *
 * A trailing `?` on a name makes it optional. A bare string is the type. A
 * `ToolParamSpec` adds prose and an enum. An object nests.
 */
export function paramsSchema(params: ToolParams): ToolSchema {
  const properties: Record<string, ToolSchemaProperty> = {}
  const required: string[] = []

  for (const [rawName, value] of Object.entries(params)) {
    const optional = rawName.endsWith('?')
    const name = optional ? rawName.slice(0, -1) : rawName
    if (!name) continue

    let prop: ToolSchemaProperty

    if (typeof value === 'string') {
      const type = typeOf(value)
      prop = type ? { type } : { type: 'object' }
    } else if (typeof value === 'object' && value !== null && !isParamSpec(value)) {
      // A nested shape. Its own required list is not merged upward — the
      // providers take one flat `required` array, and a nested miss is reported
      // by the check instead of by the schema.
      const nested = paramsSchema(value as ToolParams)
      prop = {
        type: 'object',
        description: Object.keys(nested.properties).join(', ') || undefined,
      }
    } else if (typeof value === 'object' && value !== null) {
      const spec = value as { describe?: string; oneOf?: readonly string[] }
      prop = { type: 'string' }
      if (spec.describe) prop.description = spec.describe
      if (spec.oneOf?.length) prop.enum = [...spec.oneOf]
    } else {
      prop = { type: 'object' }
    }

    properties[name] = prop
    if (!optional) required.push(name)
  }

  return required.length
    ? { type: 'object', properties, required }
    : { type: 'object', properties }
}

function isParamSpec(value: object): boolean {
  return 'describe' in value || 'oneOf' in value || 'example' in value
}

/**
 * Check a call's arguments against the declared shape.
 *
 * Returns the message to hand back to the model, or undefined when the call is
 * fine. Only declared parameters are checked: a tool with no shape accepts
 * whatever the model sends, because a model guessing at a parameter it was
 * never told about is still doing something the action can answer.
 */
export function checkArgs(
  params: ToolParams | undefined,
  args: Record<string, unknown>,
  path = '',
): string | undefined {
  if (!params) return undefined

  for (const [rawName, value] of Object.entries(params)) {
    const optional = rawName.endsWith('?')
    const name = optional ? rawName.slice(0, -1) : rawName
    const label = path ? `${path}.${name}` : name
    const got = args[name]

    if (got === undefined || got === null) {
      if (optional) continue
      return `"${label}" is required`
    }

    if (typeof value === 'string') {
      const type = typeOf(value)
      if (!type) continue
      if (!matches(got, type)) return `"${label}" must be a ${type}, got ${describe(got)}`
      continue
    }

    if (typeof value === 'object' && value !== null && isParamSpec(value)) {
      const oneOf = (value as { oneOf?: readonly string[] }).oneOf
      if (oneOf?.length && !oneOf.includes(String(got))) {
        return `"${label}" must be one of ${oneOf.map((o) => JSON.stringify(o)).join(', ')}`
      }
      continue
    }

    // A nested shape. Reported as `filter.term` rather than `term`, because the
    // action reads a nested object and the model has to know which one was wrong.
    if (typeof value === 'object' && value !== null && typeof got === 'object') {
      const inner = checkArgs(value as ToolParams, got as Record<string, unknown>, label)
      if (inner) return inner
    }
  }

  return undefined
}

function matches(value: unknown, type: ToolSchemaProperty['type']): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && value !== null
  }
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return 'an array'
  if (value === null) return 'null'
  return typeof value
}
