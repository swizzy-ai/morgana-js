function getValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (current == null) return undefined
    return current[key]
  }, obj)
}

export function render(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const value = getValue(context, key.trim())
    return value !== undefined ? String(value) : `{{${key}}}`
  })
}
