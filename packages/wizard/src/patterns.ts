import type { MemoryValue } from './types'

function matchesPattern(key: string, value: MemoryValue, pattern: string): boolean {
  const name = value.name ?? key
  const mime = value.mimeType

  if (pattern === 'all images' || pattern === 'images') {
    return mime.startsWith('image/')
  }
  if (pattern === 'all text' || pattern === 'text') {
    return mime.startsWith('text/')
  }
  if (pattern === 'all pdfs' || pattern === 'pdfs') {
    return mime === 'application/pdf'
  }
  if (pattern === 'all audio' || pattern === 'audio') {
    return mime.startsWith('audio/')
  }

  if (pattern.includes('*') || pattern.includes('?')) {
    const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    return new RegExp(regexStr, 'i').test(name)
  }

  return name === pattern || key === pattern
}

export function matchMemoryValues(
  values: Record<string, MemoryValue>,
  patterns: string[],
): Record<string, MemoryValue> {
  const result: Record<string, MemoryValue> = {}
  for (const [key, value] of Object.entries(values)) {
    for (const pattern of patterns) {
      if (matchesPattern(key, value, pattern)) {
        result[key] = value
        break
      }
    }
  }
  return result
}
