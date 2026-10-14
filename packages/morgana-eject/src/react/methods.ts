/**
 * Handle-method table — translates Morgana handle calls into React state ops.
 *
 * Every entry maps `handle.METHOD(argsText)` to a React statement string that
 * runs inside a page component with `objects`/`setObjects`/`patch` in scope
 * (plus `mediaRefs` for media, `pushItem` for lists). Unknown methods are NOT
 * guessed — translateMethod returns null and the caller files a fallback.
 *
 * Setter default: any `setFoo(v)` with no entry patches prop `foo`. Special
 * cases below override it.
 */

export type MethodEmit = (targetId: string, argsText: string) => string;

const patch = (id: string, body: string): string => `patch('${id}', ${body})`;

function parseArgs(argsText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  let str: string | null = null;
  for (const ch of argsText) {
    if (str) {
      cur += ch;
      if (ch === str) str = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      str = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const TABLE: Record<string, MethodEmit> = {
  setProps: (id, a) => patch(id, a || '{}'),
  set: (id, a) => {
    const [k, v] = parseArgs(a);
    return patch(id, `{ [${k}]: ${v} }`);
  },
  get: (id, a) => `objs['${id}']?.[${a || "'value'"}]`,
  show: (id) => patch(id, '{ open: true, visible: true }'),
  hide: (id) => patch(id, '{ open: false, visible: false }'),
  open: (id) => patch(id, '{ open: true }'),
  close: (id) => patch(id, '{ open: false }'),
  expand: (id) => patch(id, '{ expanded: true }'),
  collapse: (id) => patch(id, '{ expanded: false }'),
  check: (id) => patch(id, '{ checked: true }'),
  uncheck: (id) => patch(id, '{ checked: false }'),
  toggle: (id) => `setObjs(prev => ({ ...prev, ['${id}']: { ...prev['${id}'], checked: !prev['${id}']?.checked } }))`,
  enable: (id) => patch(id, '{ disabled: false }'),
  disable: (id) => patch(id, '{ disabled: true }'),
  select: (id) => patch(id, '{ selected: true }'),
  deselect: (id) => patch(id, '{ selected: false }'),
  clear: (id) => patch(id, '{ items: [] }'),
  clearSelection: (id) => patch(id, '{ selection: [] }'),
  append: (id, a) => `pushItem('${id}', ${a || '{}'})`,
  play: (id) => `mediaRefs.current['${id}']?.play()`,
  pause: (id) => `mediaRefs.current['${id}']?.pause()`,
  copy: (id) => `navigator.clipboard.writeText(String(objs['${id}']?.content ?? ''))`,
  copyCode: (id) => `navigator.clipboard.writeText(String(objs['${id}']?.code ?? objs['${id}']?.content ?? ''))`,
  notify: (id, a) => `pushToast('${id}', ${a || '{}'})`,
  dismiss: (id, a) => `dismissToast('${id}', ${a || ''})`,
  setValue: (id, a) => patch(id, `{ value: ${a} }`),
  setChecked: (id, a) => patch(id, `{ checked: ${a} }`),
  setSort: (id, a) => patch(id, `{ sort: ${a} }`),
  setFilter: (id, a) => patch(id, `{ filter: ${a} }`),
  setActiveKey: (id, a) => patch(id, `{ activeKey: ${a} }`),
  setVariant: (id, a) => patch(id, `{ variant: ${a} }`),
  getValues: (id) => `getFormValues('${id}')`,
  setOrientation: (id, a) => patch(id, `{ orientation: ${a} }`),
  setSeparator: (id, a) => patch(id, `{ separator: ${a} }`),
  setAnimate: (id, a) => patch(id, `{ animate: ${a} }`),
  setDensity: (id, a) => patch(id, `{ density: ${a} }`),
  setKind: (id, a) => patch(id, `{ kind: ${a} }`),
  setSize: (id, a) => patch(id, `{ width: ${a} }`),
  bounce: (id) => patch(id, `{ animate: 'bounce' }`),
  bouncy: (id) => patch(id, `{ animate: 'bouncy' }`),
  fadeIn: (id) => patch(id, `{ animate: 'fadeIn' }`),
  fadeOut: (id) => patch(id, `{ animate: 'fadeOut' }`),
  pulse: (id) => patch(id, `{ animate: 'pulse' }`),
  scale: (id) => patch(id, `{ animate: 'scale' }`),
  slide: (id) => patch(id, `{ animate: 'slide' }`),
  spin: (id) => patch(id, `{ animate: 'spin' }`),
  prev: (id) => `setObjs(prev => ({ ...prev, ['${id}']: { ...prev['${id}'], current: Math.max(0, Number(prev['${id}']?.current ?? 0) - 1) } }))`,
  next: (id) => `setObjs(prev => ({ ...prev, ['${id}']: { ...prev['${id}'], current: Number(prev['${id}']?.current ?? 0) + 1 } }))`,
};

/** Translate `handle.METHOD(args)` → React code, or null when unknown. */
export function translateMethod(method: string, targetId: string, argsText: string): string | null {
  const emit = TABLE[method];
  if (emit) return emit(targetId, argsText);
  // Default setter rule: setFoo(v) patches prop foo.
  const m = /^set([A-Z][A-Za-z0-9]*)$/.exec(method);
  if (m) {
    const prop = m[1][0].toLowerCase() + m[1].slice(1);
    return patch(targetId, `{ ${prop}: ${argsText} }`);
  }
  return null;
}

/** The page-level helpers every ejected interactive page defines. */
export function pageHelpers(): string {
  return [
    'const [objs, setObjs] = useState<Record<string, any>>(seedObjects);',
    'const patch = (id: string, p: Record<string, any>) =>',
    '  setObjs(prev => ({ ...prev, [id]: { ...prev[id], ...p } }));',
    'const pushItem = (id: string, item: any) =>',
    '  setObjs(prev => ({ ...prev, [id]: { ...prev[id], items: [...(prev[id]?.items ?? []), item] } }));',
    'const mediaRefs = useRef<Record<string, HTMLMediaElement | null>>({});',
    'const pushToast = (regionId: string, t: any) => {',
    '  const toast = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...t };',
    '  setObjs(prev => ({ ...prev, [regionId]: { ...prev[regionId], items: [...(prev[regionId]?.items ?? []), toast] } }));',
    '  const duration = Number(t?.duration ?? 4000);',
    '  setTimeout(() => setObjs(prev => ({',
    '    ...prev,',
    '    [regionId]: { ...prev[regionId], items: (prev[regionId]?.items ?? []).filter((x: any) => x.id !== toast.id) },',
    '  })), duration);',
    '};',
  'const dismissToast = (regionId: string, id: string) =>',
  '  setObjs(prev => ({ ...prev, [regionId]: { ...prev[regionId], items: (prev[regionId]?.items ?? []).filter((x: any) => x.id !== id) } }));',
  'const getFormValues = (formId: string): Record<string, unknown> => {',
  '  const out: Record<string, unknown> = {};',
  '  for (const f of FORM_FIELDS[formId] ?? []) out[f] = objs[f]?.value ?? objs[f]?.checked ?? null;',
  '  return out;',
  '};',
  ].join('\n');
}
