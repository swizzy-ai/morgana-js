export function extractJson(text: string): any {
  let cleaned = text.trim()

  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '')
  cleaned = cleaned.trim()

  const firstBracket = cleaned.search(/[\[{]/)
  if (firstBracket === -1) return null
  cleaned = cleaned.slice(firstBracket)

  const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'))
  if (lastBracket === -1) return null
  cleaned = cleaned.slice(0, lastBracket + 1)

  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}
