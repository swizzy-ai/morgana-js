/**
 * Client-action translator — bespoke handler bodies → React handler bodies.
 *
 * Table-driven dispatch (KNOBS/LOGS) is consumed by the emitter directly from
 * the tables, so it never passes through here. This handles everything ELSE:
 * media branches, toast branches, log appends, chat send, lane echo — by
 * ordered textual rules over the stylized subset:
 *
 *   page guards (`if (!ctx.ui.get('x')) return …`) → dropped (components mount
 *     per page, the guard is vacuous)
 *   `const t = ctx.ui.get('id')` + `t.method(args)` → state ops via the method
 *     table (translateMethod), or a flagged fallback when unknown
 *   inline `(ctx.ui.get('id') as any)?.method(args)` → same, no binding needed
 *   media `[verb]?.()` computed calls → mediaRefs (real elements, play/pause)
 *   `ctx.actions.run('n', p)` → `api.n(p ?? {})`, recorded for services/api.ts
 *   `ctx.event` → the handler's `e` param; `.element` → e.currentTarget
 *   `firedId(ctx)` → the `firedId` param (the emitter wires each control
 *     directly, so dispatch-by-id becomes direct calls where tables cover it
 *     and an explicit id argument elsewhere)
 *   `readControl(ctx, 'id')` → `readValue('id')` (state, always fresh in React)
 *   `return {...}` → dropped (handlers return void)
 *   anything still mentioning `ctx.` → fallback, flagged with context
 */
import type { EjectFallback } from '../core/types';
import { translateMethod } from './methods';

export interface ClientTranslation {
  code: string;
  calledActions: string[];
  fallbacks: EjectFallback[];
}

const fb = (file: string, reason: string, source: string): EjectFallback => ({
  file,
  line: 0,
  reason,
  source: source.slice(0, 160),
});

export function translateClientBody(
  file: string,
  body: string,
  opts: { consumedTables?: string[]; mediaIds?: Set<string>; helperNames?: string[] } = {},
): ClientTranslation {
  const fallbacks: EjectFallback[] = [];
  const calledActions: string[] = [];
  let code = body;

  // Calls into translated ctx-helpers drop the ctx argument.
  for (const name of opts.helperNames ?? []) {
    code = code.replace(new RegExp(`\\b${name}\\(\\s*ctx\\s*,`, 'g'), `${name}(`);
    code = code.replace(new RegExp(`\\b${name}\\(\\s*ctx\\s*\\)`, 'g'), `${name}()`);
  }

  // Branches the emitter wires directly from tables (knob dispatch, log
  // dispatch) are dropped here — keeping them would leave `target[method]`
  // computed calls no static translator can resolve.
  for (const table of opts.consumedTables ?? []) {
    code = dropTableBranch(code, table);
  }

  // Page guards are vacuous in per-page components. The guarded return is
  // brace-matched — a `return[^;]*` pattern would eat the file when
  // semicolons are absent.
  code = dropPageGuards(code);
  // firedId(ctx) → the wired id param.
  code = code.replace(/firedId\s*\(\s*ctx\s*\)/g, 'firedId');
  // readControl(ctx, 'id') → state read.
  code = code.replace(/readControl\s*\(\s*ctx\s*,\s*([^)]+)\)/g, (_m, id: string) => `readValue(${id})`);
  // ctx.event → e.
  code = code.replace(/\(ctx\.event\s+as\s+any\)\?\.element\b/g, 'e.currentTarget');
  code = code.replace(/\(ctx\.event\s+as\s+any\)\?\.target\b/g, 'firedId');
  code = code.replace(/ctx\.event\b/g, 'e');

  // Media play/pause shape: two consts feeding one computed call. Refs hold
  // real elements, so this is exact — and ?. makes it safe regardless.
  code = code.replace(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+?);\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+?);\s*;?\(ctx\.ui\.get\(\1\)\s+as\s+any\)\?\.\[\3\]\?\.\(\);?/g,
    (_m, _t: string, targetExpr: string, _v: string, verbExpr: string) =>
      `mediaRefs.current[${targetExpr.trim()}]?.[${verbExpr.trim()}]?.();`,
  );
  // Track `const V = [await] ctx.ui.get('id') [as any]` bindings.
  const bindings = new Map<string, string>();
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?\(?ctx\.ui\.get\(\s*['"]([^'"]+)['"]\s*\)(?:\s+as\s+any)?\)?/g)) {
    bindings.set(m[1], m[2]);
  }
  code = code.replace(/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:await\s+)?\(?ctx\.ui\.get\(\s*['"][^'"]+['"]\s*\)(?:\s+as\s+any)?\)?\s*;?/g, (m) => {
    // Keep the declaration only when the var is used outside method calls —
    // checked below; drop here, restore on fallback.
    return `/*__getdecl:${m}__*/`;
  });

  // Bound-var method calls: V?.M( / V?.M?.( / V.M( — trailing ?. tolerated.
  const boundRe = /([A-Za-z_$][\w$]*)\s*(?:\?\.\s*|\.\s*)([A-Za-z_$][\w$]*)\s*(?:\?\.\s*)?\(/g;
  code = code.replace(boundRe, (m, v: string, method: string) => {
    const id = bindings.get(v);
    if (!id) return m;
    return `/*__m:${id}:${method}:*/(`;
  });
  // Bound-var computed calls. On media objects the verb is play/pause and the
  // ref call is exact; anything else is unknowable statically.
  code = code.replace(/([A-Za-z_$][\w$]*)\s*(?:\?\.\s*)?\[([^\]]+)\]\s*(?:\?\.\s*)?\(/g, (m, v: string, expr: string) => {
    const id = bindings.get(v);
    if (!id) return m;
    if (opts.mediaIds?.has(id)) {
      return `mediaRefs.current['${id}']?.[${expr}]?.(`;
    }
    fallbacks.push(fb(file, `computed method call on '${id}' — method unknown statically`, `${v}[${expr}](…)`));
    return `/* eject: ${id}[${expr}] needs manual port */undefined`;
  });
  // Inline gets: (ctx.ui.get('id') as any)?.M( / ?.M?.( / .M( / .M?.(
  code = code.replace(/\(?ctx\.ui\.get\(\s*['"]([^'"]+)['"]\s*\)(?:\s+as\s+any)?\)?\s*(?:\?\.\s*|\.\s*)([A-Za-z_$][\w$]*)\s*(?:\?\.\s*)?\(/g, '/*__m:$1:$2:*/(');
  // Media computed verbs: (ctx.ui.get('id') as any)?.[verb]?.()
  code = code.replace(
    /\(?ctx\.ui\.get\(\s*['"]([^'"]+)['"]\s*\)(?:\s+as\s+any)?\)?\s*\?\.\s*\[(\w+)\]\s*\?\.\s*\(\s*\)/g,
    (_m, id: string, verb: string) => `mediaRefs.current['${id}']?.[${verb}]?.()`,
  );
  // Resolve the markers: balanced-paren arg capture, then translateMethod.
  code = resolveMarkers(code, file, fallbacks);

  // Restore get-declarations whose var leaked outside method calls. The check
  // strips string literals first: `\btarget\b` matches inside 'd-target'.
  code = code.replace(/\/\*__getdecl:(.*?)\*\//gs, (_m, decl: string) => {
    const vm = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(decl);
    const stripped = code.replace(_m, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
    if (vm && new RegExp(`\\b${vm[1]}\\b`).test(stripped)) {
      fallbacks.push(fb(file, `handle variable '${vm[1]}' used outside method calls — needs manual port`, decl));
      return `const ${vm[1]} = undefined as any; /* eject: was ${decl.trim().slice(0, 80)} */`;
    }
    return '';
  });

  // ctx.actions.run → api fns.
  code = code.replace(/\(?(?:await\s+)?ctx\.actions\.run\(\s*['"]([^'"]+)['"]\s*(,\s*([\s\S]*?))?\)\)?/g, (_m, n: string, _c: string, p: string) => {
    if (!calledActions.includes(n)) calledActions.push(n);
    return `api.${n}(${(p ?? '{}').trim() || '{}'})`;
  });

  // Creation calls nested in pushItem/place/append args → JSX-ish data.
  code = code.replace(/ctx\.ui\.text\(\s*\{([^}]*)\}\)/g, (_m, props: string) => {
    const cm = /content\s*:\s*([\s\S]+?)(,|})/.exec(`${props},`);
    return `{ label: ${cm ? cm[1].trim().replace(/,$/, '') : "''"} }`;
  });

  // Top-level returns go away; page-guard leftovers already dropped.
  code = code.replace(/^\s*return\s*\{[^}]*\}\s*;?\s*$/gm, '');

  // Anything left mentioning ctx. is untranslated.
  for (const m of code.matchAll(/ctx\.[A-Za-z_$][\w$]*/g)) {
    fallbacks.push(fb(file, `untranslated '${m[0]}' in client action`, m[0]));
  }
  // DOM escape hatches never survive translation.
  for (const m of code.matchAll(/\.(getElement|querySelector|querySelectorAll|closest|getAttribute)\s*\(/g)) {
    fallbacks.push(fb(file, `DOM read '${m[0]}' has no React equivalent here — use state or event values`, m[0]));
  }
  return { code, calledActions, fallbacks };
}

/** Drop `if (!ctx.ui.get('…')) return …;` guards (brace-matched). */
export function dropPageGuards(code: string): string {
  const re = /if\s*\(\s*!ctx\.ui\.get\(\s*['"][^'"]+['"]\s*\)\s*\)\s*return\b/g;
  let m: RegExpExecArray | null;
  let shift = 0;
  while ((m = re.exec(code))) {
    const start = m.index;
    let j = start + m[0].length;
    while (j < code.length && /\s/.test(code[j])) j += 1;
    if (code[j] === '{') {
      let depth = 0;
      let str: string | null = null;
      while (j < code.length) {
        const ch = code[j];
        if (str) {
          if (ch === str) str = null;
        } else if (ch === '"' || ch === "'" || ch === '`') {
          str = ch;
        } else if (ch === '{') {
          depth += 1;
        } else if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
        j += 1;
      }
    } else {
      while (j < code.length && code[j] !== '\n' && code[j] !== ';') j += 1;
      if (code[j] === ';') j += 1;
    }
    code = code.slice(0, start) + code.slice(j);
    re.lastIndex = start;
    shift += 1;
    if (shift > 100) break;
  }
  return code;
}

/** Translate ctx-taking helpers (log(ctx, …), paint(ctx, …)) minus the ctx param. */
const DROPPED_HELPERS = new Set([
  // Replaced everywhere they are called: firedId(ctx) → the wired id param,
  // readControl(ctx, id) → readValue(id) over state. Emitting them would leave
  // DOM-bound dead code behind.
  'firedId',
  'readControl',
]);
export function translateCtxHelpers(
  file: string,
  helpersText: string,
  opts: { consumedTables?: string[]; mediaIds?: Set<string> } = {},
): { code: string; calledActions: string[]; fallbacks: EjectFallback[]; names: string[] } {
  const out: string[] = [];
  const calledActions: string[] = [];
  const fallbacks: EjectFallback[] = [];
  const names: string[] = [];
  const takeBlock = (src: string, openIdx: number): [string, number] => {
    let depth = 0;
    let j = openIdx;
    let str: string | null = null;
    while (j < src.length) {
      const ch = src[j];
      if (str) {
        if (ch === str) str = null;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        str = ch;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return [src.slice(openIdx + 1, j), j + 1];
      }
      j += 1;
    }
    return [src.slice(openIdx + 1), src.length];
  };
  // function NAME(ctx, rest...) { ... }
  for (const m of helpersText.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*ctx\s*(,([^)]*))?\)\s*\{/g)) {
    if (DROPPED_HELPERS.has(m[1])) continue;
    const rest = (m[3] ?? '').trim();
    const openIdx = (m.index ?? 0) + m[0].length - 1;
    const [body] = takeBlock(helpersText, openIdx);
    const t = translateClientBody(file, body, opts);
    fallbacks.push(...t.fallbacks);
    for (const n of t.calledActions) if (!calledActions.includes(n)) calledActions.push(n);
    names.push(m[1]);
    out.push(`async function ${m[1]}(${rest}): Promise<void> {\n${t.code}\n}`);
  }
  // const NAME = [async] (ctx, rest...) => { ... }
  for (const m of helpersText.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s+)?\(\s*ctx\s*(,([^)]*))?\)\s*=>\s*\{/g)) {
    if (names.includes(m[1]) || DROPPED_HELPERS.has(m[1])) continue;
    const rest = (m[4] ?? '').trim();
    const openIdx = (m.index ?? 0) + m[0].length - 1;
    const [body] = takeBlock(helpersText, openIdx);
    const t = translateClientBody(file, body, opts);
    fallbacks.push(...t.fallbacks);
    for (const n of t.calledActions) if (!calledActions.includes(n)) calledActions.push(n);
    names.push(m[1]);
    out.push(`const ${m[1]} = async (${rest}): Promise<void> => {\n${t.code}\n};`);
  }
  return { code: out.join('\n\n'), calledActions, fallbacks, names };
}

/** Drop `const X = TABLE[…]; … if (X) { … }` dispatch blocks (brace-matched). */
export function dropTableBranch(code: string, table: string): string {
  const decl = new RegExp(`const\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${table}\\s*\\[[^\\]]+\\]\\s*;?`);
  const m = decl.exec(code);
  if (!m) return code;
  code = code.slice(0, m.index) + code.slice(m.index + m[0].length);
  const varName = m[1];
  const ifRe = new RegExp(`if\\s*\\(\\s*${varName}\\s*\\)\\s*\\{`);
  const im = ifRe.exec(code);
  if (!im) return code;
  let depth = 0;
  let j = im.index + im[0].length - 1;
  let str: string | null = null;
  while (j < code.length) {
    const ch = code[j];
    if (str) {
      if (ch === str) str = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      str = ch;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        j += 1;
        break;
      }
    }
    j += 1;
  }
  return code.slice(0, im.index) + code.slice(j);
}
function resolveMarkers(code: string, file: string, fallbacks: EjectFallback[]): string {
  let out = '';
  let i = 0;
  for (;;) {
    const at = code.indexOf('/*__m:', i);
    if (at < 0) {
      out += code.slice(i);
      break;
    }
    out += code.slice(i, at);
    const end = code.indexOf(':*/(', at);
    if (end < 0) {
      out += code.slice(at);
      break;
    }
    const [id, method] = code.slice(at + 6, end).split(':');
    // Capture the balanced arg list starting at `end + 4` (after ':*/(').
    let depth = 1;
    let j = end + 4;
    let str: string | null = null;
    while (j < code.length && depth > 0) {
      const ch = code[j];
      if (str) {
        if (ch === str) str = null;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        str = ch;
      } else if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
      }
      j += 1;
    }
    const args = code.slice(end + 4, j - 1);
    // Optional-chaining marker: the source used ?. — re-emit safe navigation
    // by keeping the statement (translated calls are null-safe by construction
    // for set-like methods; reads use ?. already).
    const translated = translateMethod(method, id, args.trim());
    if (translated === null) {
      fallbacks.push(fb(file, `handle method '${method}' has no React mapping`, `${id}.${method}(${args.slice(0, 80)})`));
      out += `/* eject: ${id}.${method} needs manual port */ undefined`;
    } else {
      out += translated;
    }
    i = j;
  }
  return out;
}
