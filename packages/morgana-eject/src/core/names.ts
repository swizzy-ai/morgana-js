/** Shared naming: one rule everywhere, no drift between emitters. */
export function opName(domain: string, actionName: string): string {
  const lower = actionName.toLowerCase();
  if (lower.startsWith(domain.toLowerCase())) {
    const rest = actionName.slice(domain.length);
    return rest[0].toLowerCase() + rest.slice(1);
  }
  return actionName;
}

export function pageComponentName(pageName: string): string {
  const base = pageName.replace(/^\/+|\/+$/g, '').split('/').pop() || 'home';
  const pascal = base.split(/[-_]/).map((s) => (s ? s[0].toUpperCase() + s.slice(1) : '')).join('');
  return `${pascal || 'Home'}Page`;
}

export function pageFileName(pageName: string): string {
  return `${pageComponentName(pageName)}.tsx`;
}

export function domainOfActionFile(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? 'misc.ts';
  return base.replace(/\.ts$/, '');
}
