/**
 * React emitter — a normal Vite + React + TypeScript app.
 *
 * pages/*.tsx        one component per page: seed state, JSX, handlers
 * services/api.ts    one typed fetch fn per called server action
 * routes.tsx         address table (react-router)
 * index.css          ejected stylesheet, morgana- keyframes renamed to ui-
 * main.tsx, index.html, vite.config.ts, tsconfig, package.json, README
 *
 * Structure comes from renderNode (zero drift); interactivity is injected:
 * controls get value/checked + handlers, dynamic text becomes {expr},
 * list/toast regions render state items, tables render state rows, media
 * gets refs. Knob tables drive per-control handlers directly; bespoke action
 * bodies translate via translateClientBody.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ProjectIR, ObjNode } from '@morgana/sdk-compile';
import { renderNode } from '@morgana/sdk-compile';
import type { EjectFallback, EjectSelection } from '../core/types';
import { parseActionSources, handlerBodyText, extractTableSource } from '../core/codemod';
import { opName, pageComponentName, pageFileName } from '../core/names';
import { resolveMakeToken } from '@morgana/sdk-compile';
import { htmlToJsx } from './htmlToJsx';
import { CONTROL_SPECS, DYNAMIC_PROPS } from './kinds';
import { translateMethod, pageHelpers } from './methods';
import { translateClientBody, translateCtxHelpers } from './translate';

export interface ClientActionInfo {
  name: string;
  file: string;
  on: string[];
  handlerBody: string;
  helpersText: string;
}

export function collectClientActions(projectDir: string): ClientActionInfo[] {
  const out: ClientActionInfo[] = [];
  const base = path.join(projectDir, 'src', 'actions', 'client');
  if (!fs.existsSync(base)) return out;
  for (const file of fs.readdirSync(base).filter((f) => f.endsWith('.ts'))) {
    const full = path.join(base, file);
    const source = fs.readFileSync(full, 'utf8');
    for (const parsed of parseActionSources(full, source)) {
      if (parsed.lane !== 'client') continue;
      out.push({
        name: parsed.name,
        file: full,
        on: (Array.isArray(parsed.on) ? parsed.on : [parsed.on]).filter(Boolean) as string[],
        handlerBody: handlerBodyText(source, parsed.handlerText),
        helpersText: parsed.helpersText,
      });
    }
  }
  return out;
}

interface KnobEntry {
  target: string;
  prop: string;
  parseText: string;
  method?: string;
}

function parseKnobTable(tableSource: string): Record<string, KnobEntry> {
  const out: Record<string, KnobEntry> = {};
  const entryRe = /['"]([^'"]+)['"]\s*:\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(tableSource))) {
    const body = m[2];
    const str = (k: string): string | undefined => {
      const r = new RegExp(`${k}\\s*:\\s*['"]([^'"]+)['"]`).exec(body);
      return r ? r[1] : undefined;
    };
    const methodM = /method\s*:\s*['"]([^'"]+)['"]/.exec(body);
    const parseM = /parse\s*:\s*(\(.*?\)\s*=>\s*[^,}]+|[A-Za-z_$][\w$]*)/.exec(body);
    const target = str('target');
    const prop = str('prop');
    if (!target || !prop) continue;
    out[m[1]] = { target, prop, parseText: parseM ? parseM[1].trim() : '(v) => v', method: methodM ? methodM[1] : undefined };
  }
  return out;
}

/** Split an `id.event` / `id` selector into its object id. */
function selectorId(sel: string): string {
  const dot = sel.lastIndexOf('.');
  return dot < 0 ? sel : sel.slice(0, dot);
}

interface PagePlan {
  name: string;
  address: string;
  component: string;
  rootIds: string[];
  /** id → props that must read from state. */
  dyn: Map<string, Set<string>>;
  /** knob id → entry (drives direct handlers). */
  knobs: Map<string, KnobEntry>;
  /** control id → set of log region ids it appends to. */
  logs: Map<string, string[]>;
  /** control id → translated bespoke handler name (when no knob entry). */
  bespoke: Map<string, string>;
  handlers: string[];
  calledActions: Set<string>;
}

function collectPageObjects(ir: ProjectIR, rootIds: string[]): Map<string, ObjNode> {
  const out = new Map<string, ObjNode>();
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop() as string;
    if (out.has(id)) continue;
    const node = ir.objects.get(id);
    if (!node) continue;
    out.set(id, node);
    for (const child of node.children) stack.push(child);
    if (node.contentTemplateId) stack.push(node.contentTemplateId);
  }
  return out;
}

const SEED_SKIP = new Set(['id', 'name', 'placement']);

function seedFor(objects: Map<string, ObjNode>): Record<string, unknown> {
  // Seed every JSON-safe prop, not just dynamic ones: the JSX reads state for
  // values/checked/rows/items/content, and state must equal the IR on first
  // paint or controlled inputs render empty. Static props ride along unused.
  const seed: Record<string, unknown> = {};
  for (const [id, node] of objects) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node.props as Record<string, unknown>)) {
      if (SEED_SKIP.has(k) || v === undefined) continue;
      try {
        props[k] = JSON.parse(JSON.stringify(v));
      } catch {
        /* function-valued props seed empty — handlers set them */
      }
    }
    if (Object.keys(props).length) seed[id] = props;
  }
  return seed;
}

/** Find an open tag carrying data-entity="id"; returns [start, endOfTag). */
function findOpenTag(jsx: string, id: string): [number, number] | null {
  const needle = `data-entity="${id}"`;
  const at = jsx.indexOf(needle);
  if (at < 0) return null;
  const lt = jsx.lastIndexOf('<', at);
  if (lt < 0) return null;
  // Walk forward to the tag end, respecting quotes and {...} exprs.
  let j = lt + 1;
  let quote: string | null = null;
  let braces = 0;
  while (j < jsx.length) {
    const ch = jsx[j];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '{') {
      braces += 1;
    } else if (ch === '}') {
      braces -= 1;
    } else if (ch === '>' && braces === 0) {
      return [lt, j + 1];
    }
    j += 1;
  }
  return null;
}

/** Match the close tag for the open tag starting at `lt`. Returns [innerEnd, afterClose). */
function matchClose(jsx: string, lt: number): [number, number] | null {
  const nameM = /^<([A-Za-z][\w-]*)/.exec(jsx.slice(lt));
  if (!nameM) return null;
  const tag = nameM[1].toLowerCase();
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'circle', 'path', 'rect']);
  if (VOID.has(tag)) return null;
  let depth = 0;
  let j = lt;
  let quote: string | null = null;
  let braces = 0;
  while (j < jsx.length) {
    const ch = jsx[j];
    if (quote) {
      if (ch === quote) quote = null;
      j += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      j += 1;
      continue;
    }
    if (ch === '{') braces += 1;
    if (ch === '}') braces -= 1;
    if (ch === '<' && braces === 0 && !quote) {
      if (jsx.startsWith(`</${tag}`, j)) {
        if (depth === 0) {
          const gt = jsx.indexOf('>', j);
          return [j, gt < 0 ? jsx.length : gt + 1];
        }
        depth -= 1;
      } else if (jsx.startsWith(`<${tag}`, j) && /^<[A-Za-z]/.test(jsx.slice(j))) {
        const gt = jsx.indexOf('>', j);
        if (gt > 0 && jsx[gt - 1] !== '/') depth += 1;
      }
    }
    j += 1;
  }
  return null;
}

function insertAttr(jsx: string, id: string, attrs: string, fallbacks: EjectFallback[], file: string): string {
  const found = findOpenTag(jsx, id);
  if (!found) {
    fallbacks.push({ file, line: 0, reason: `JSX has no element for '${id}' — wiring skipped`, source: id });
    return jsx;
  }
  const [lt, end] = found;
  const tag = jsx.slice(lt, end);
  if (tag.endsWith('/>')) return `${jsx.slice(0, end - 2)} ${attrs} />${jsx.slice(end)}`;
  return `${jsx.slice(0, end - 1)} ${attrs}>${jsx.slice(end)}`;
}

function eventValueExpr(kind: string): string {
  if (kind === 'toggle' || kind === 'checkbox' || kind === 'switch' || kind === 'radio') {
    return 'String(e.target.checked)';
  }
  return 'e.target.value';
}

export interface ReactEmit {
  files: Record<string, string>;
  pages: string[];
}

export function emitReactApp(
  ir: ProjectIR,
  clientActions: ClientActionInfo[],
  serverActions: Array<{ name: string; domain: string }>,
  styleCss: string,
  sel: Required<EjectSelection>,
  report: { fallbacks: EjectFallback[] },
): ReactEmit {
  const fallbacks = report.fallbacks;
  const files: Record<string, string> = {};
  const wanted = new Set(sel.pages ?? [...ir.pages.keys()]);
  const pages: string[] = [];
  const calledEverywhere = new Set<string>();

  // Index actions by the object ids they listen on.
  const listeners = new Map<string, ClientActionInfo[]>();
  for (const a of clientActions) {
    for (const s of a.on) {
      const id = selectorId(s);
      if (!listeners.has(id)) listeners.set(id, []);
      listeners.get(id)!.push(a);
    }
  }

  for (const page of ir.pages.values()) {
    if (!wanted.has(page.name)) continue;
    pages.push(page.name);
    const objects = collectPageObjects(ir, page.rootIds);
    const dyn = new Map<string, Set<string>>();
    const touch = (id: string, prop: string): void => {
      if (!dyn.has(id)) dyn.set(id, new Set());
      dyn.get(id)!.add(prop);
    };
    // DYNAMIC_PROPS families are always state-read (data changes).
    for (const [id, node] of objects) {
      for (const p of DYNAMIC_PROPS[node.kind] ?? []) touch(id, p);
    }

    const knobs = new Map<string, KnobEntry>();
    const logs = new Map<string, string[]>();
    const bespoke = new Map<string, string>();
    const handlers: string[] = [];
    const calledActions = new Set<string>();

    // Knob + log tables drive direct wiring. A knob-shaped record has
    // {target,prop}; a log-shaped record maps control ids to region ids
    // (values must be object ids on the page — that is what tells LOGS
    // apart from value tables like TOAST_VARIANTS).
    const tables = discoverTables(clientActions, objects);
    for (const t of tables) {
      for (const [knobId, entry] of Object.entries(t.entries)) {
        if (!objects.has(knobId)) continue;
        if (t.role === 'log') {
          if (!logs.has(knobId)) logs.set(knobId, []);
          logs.get(knobId)!.push(entry.target);
          touch(entry.target, 'items');
        } else {
          knobs.set(knobId, entry);
          touch(entry.target, entry.prop);
          if (entry.method) touch(entry.target, methodProp(entry.method));
        }
      }
    }

    // make('token') resolves here — tokens are static, the kind is known from
    // the IR, and the resolved props bake into a patch. Output never names it.
    const findGetTarget = (body: string, v: string): string | null => {
      const m = new RegExp(`(?:const|let|var)\\s+${v}\\s*=\\s*(?:await\\s+)?\\(?ctx\\.ui\\.get\\(\\s*['"]([^'"]+)['"]`).exec(body);
      return m ? m[1] : null;
    };
    const resolveMakes = (body: string, file: string): string =>
      body.replace(
        /([A-Za-z_$][\w$]*)\s*(?:\?\.\s*|\.\s*)make\s*(?:\?\.\s*)?\(\s*['"]([^'"]+)['"]\s*\)/g,
        (m: string, v: string, token: string) => {
          const target = findGetTarget(body, v);
          if (!target) return m;
          const kind = objects.get(target)?.kind ?? '';
          try {
            const resolved = resolveMakeToken(kind, token);
            return `patch('${target}', ${JSON.stringify(resolved)})`;
          } catch {
            fallbacks.push({ file, line: 0, reason: `make('${token}') could not resolve`, source: token });
            return m;
          }
        },
      );

    // Bespoke handlers: translate each client action body once per page that
    // has any of its listened ids. Knob and log dispatch branches are dropped
    // (wired directly below); page guards are vacuous and dropped too.
    const consumed = tables.map((x) => x.name);
    const mediaIds = new Set([...objects.entries()].filter(([, n]) => n.kind === 'video' || n.kind === 'audio').map(([id]) => id));
    for (const a of clientActions) {
      const mine = a.on.map(selectorId).filter((id) => objects.has(id));
      if (!mine.length) continue;
      const ctxHelpers = translateCtxHelpers(a.file, a.helpersText, { consumedTables: consumed, mediaIds });
      fallbacks.push(...ctxHelpers.fallbacks);
      for (const n of ctxHelpers.calledActions) calledActions.add(n);
      const t = translateClientBody(a.file, resolveMakes(a.handlerBody, a.file), {
        consumedTables: consumed,
        mediaIds,
        helperNames: ctxHelpers.names,
      });
      fallbacks.push(...t.fallbacks);
      for (const n of t.calledActions) calledActions.add(n);
      const hname = `handle${a.name[0].toUpperCase()}${a.name.slice(1)}`;
      // Pure helpers (no ctx.) eject verbatim; ctx-bound ones were replaced.
      const pureHelpers = pureHelperText(a.helpersText, tables.map((x) => x.name));
      handlers.push(`const ${hname} = async (firedId: string, e: any): Promise<void> => {\n${indent(t.code)}\n};`);
      if (pureHelpers.trim()) handlers.push(pureHelpers);
      if (ctxHelpers.code.trim()) handlers.push(ctxHelpers.code);
      for (const id of mine) {
        if (!knobs.has(id) && !bespoke.has(id)) bespoke.set(id, hname);
      }
    }
    for (const n of calledActions) calledEverywhere.add(n);

    // Seed + JSX.
    const seed = seedFor(objects);
    let jsx = page.rootIds.map((r) => htmlToJsx(renderNode(ir, r))).join('\n');
    const file = `client/src/pages/${pageFileName(page.name)}`;

    // Log appenders first: every log-source id gets one, replicating the
    // source cap semantics (8 entries, then clear). Knob appliers and bespoke
    // handlers call these; log-only controls call them directly.
    const logFns: string[] = [];
    const logCall = (id: string): string => `appendLog_${safeId(id)}()`;
    for (const [id, regions] of logs) {
      const caps = regions
        .map((l) => `if (((objs['${l}']?.items ?? []) as any[]).length >= 8) patch('${l}', { items: [] });`)
        .join('\n');
      const pushes = regions
        .map((l) => `pushItem('${l}', { label: \`${id} fired @ \${new Date().toLocaleTimeString()}\` });`)
        .join('\n');
      logFns.push(`const appendLog_${safeId(id)} = (): void => {\n  ${caps}\n  ${pushes}\n};`);
    }

    // 1. Controls: value/checked + handlers.
    for (const [id, node] of objects) {
      const spec = CONTROL_SPECS[node.kind];
      if (!spec) continue;
      const logAfter = (logs.get(id) ?? []).length ? `; ${logs.get(id)!.map(logCall).join('; ')}` : '';
      const entry = knobs.get(id);
      if (entry) {
        const attrs = spec.valueProp
          ? `${spec.valueProp}={objs['${id}']?.${spec.valueProp} ?? ''} ${spec.event}={(e: any) => applyKnob_${safeId(id)}(e)}`
          : `${spec.event}={() => applyKnob_${safeId(id)}()}`;
        jsx = insertAttr(jsx, id, attrs, fallbacks, file);
        continue;
      }
      if (bespoke.has(id) && spec.event) {
        const h = bespoke.get(id)!;
        const attrs = spec.valueProp
          ? `${spec.valueProp}={objs['${id}']?.${spec.valueProp} ?? ''} ${spec.event}={(e: any) => { ${h}('${id}', e)${logAfter}; }}`
          : `${spec.event}={(e: any) => { ${h}('${id}', e)${logAfter}; }}`;
        jsx = insertAttr(jsx, id, attrs, fallbacks, file);
        continue;
      }
      if (logs.has(id) && spec.event) {
        jsx = insertAttr(jsx, id, `${spec.event}={() => ${logCall(id)}}`, fallbacks, file);
        continue;
      }
      // Unwired control: generic state write so reads stay fresh.
      if (spec.valueProp && spec.event) {
        const write = spec.valueProp === 'checked'
          ? `patch('${id}', { checked: e.target.checked })`
          : `patch('${id}', { value: e.target.value })`;
        const read = spec.valueProp === 'checked'
          ? `checked={!!objs['${id}']?.checked}`
          : `value={objs['${id}']?.${spec.valueProp} ?? ''}`;
        jsx = insertAttr(jsx, id, `${read} ${spec.event}={(e: any) => ${write}}`, fallbacks, file);
      }
    }

    // 2. Knob appliers (with log appends folded in).
    const appliers: string[] = [];
    const ANIMATES = new Set(['bounce', 'bouncy', 'fadeIn', 'fadeOut', 'pulse', 'scale', 'slide', 'spin', 'setAnimate']);
    for (const [knobId, entry] of knobs) {
      const knobNode = objects.get(knobId);
      const kind = knobNode?.kind ?? 'input';
      const target = entry.target;
      if (entry.method && ANIMATES.has(entry.method)) touch(target, 'animate');
      const apply = entry.method
        ? translateMethod(entry.method, target, `parsed`)
        : translateMethod('set', target, `'${entry.prop}', parsed`);
      if (apply === null) {
        fallbacks.push({ file, line: 0, reason: `knob method '${entry.method}' has no React mapping`, source: knobId });
        continue;
      }
      const logExtra = (logs.get(knobId) ?? []).map(logCall).join('; ');
      appliers.push(
        `const applyKnob_${safeId(knobId)} = (e: any): void => {`,
        `  const raw = ${eventValueExpr(kind)};`,
        `  const parsed = (${entry.parseText})(raw);`,
        `  ${apply};`,
        logExtra ? `  ${logExtra};` : '',
        `};`,
      );
    }

    // 3. Dynamic leaf text.
    for (const [id, props] of dyn) {
      const node = objects.get(id);
      if (!node || !['text', 'badge'].includes(node.kind)) continue;
      if (!props.has('content') && !props.has('label')) continue;
      const prop = node.kind === 'badge' ? 'label' : 'content';
      jsx = replaceLeafText(jsx, id, `{objs['${id}']?.${prop} ?? ''}`, fallbacks, file);
    }

    // 4. Regions: lists/toasts append state items; tables render state rows.
    for (const [id, node] of objects) {
      const spec = CONTROL_SPECS[node.kind];
      if (spec?.region === 'items' || spec?.region === 'toasts') {
        jsx = appendBeforeClose(
          jsx,
          id,
          `{((objs['${id}']?.items ?? []) as any[]).map((it: any, i: number) => <li key={i}>{typeof it === 'string' ? it : (it.label ?? JSON.stringify(it))}</li>)}`,
          fallbacks,
          file,
        );
      } else if (spec?.region === 'rows') {
        const cols = ((node.props as Record<string, unknown>)['columns'] as Array<{ key: string; label: string }> | undefined) ?? [];
        const head = cols.map((c) => `<td>{String(row[${JSON.stringify(c.key)}] ?? '')}</td>`).join('');
        jsx = replaceTbody(jsx, id, `{((objs['${id}']?.rows ?? []) as any[]).map((row: any, i: number) => <tr key={i}>${head}</tr>)}`, fallbacks, file);
      }
      if (spec?.media) {
        jsx = insertAttr(jsx, id, `ref={(el: any) => { mediaRefs.current['${id}'] = el; }}`, fallbacks, file);
      }
    }

    // 5. Animate tokens ride the renamed keyframes (ui-*) via data-animate.
    for (const [id, props] of dyn) {
      if (!props.has('animate') || !objects.has(id)) continue;
      jsx = insertAttr(jsx, id, `data-animate={objs['${id}']?.animate}`, fallbacks, file);
    }

    // 6. Form field map for getFormValues.
    const formFields: Record<string, string[]> = {};
    for (const [id, node] of objects) {
      if (node.kind !== 'form' && node.kind !== 'login' && node.kind !== 'signup') continue;
      const fields: string[] = [];
      const walk: string[] = [...node.children];
      while (walk.length) {
        const cid = walk.pop() as string;
        const c = objects.get(cid);
        if (!c) continue;
        const p = (c.props as Record<string, unknown>).value !== undefined || (c.props as Record<string, unknown>).checked !== undefined;
        if (p) fields.push(cid);
        walk.push(...c.children);
      }
      if (fields.length) formFields[id] = fields;
    }

    const component = pageComponentName(page.name);
    const seedJson = JSON.stringify(seed, null, 2).replace(/</g, '\\u003c');
    const readValue = `const readValue = (id: string): string => String(objs[id]?.value ?? objs[id]?.checked ?? '');`;
    const formFieldsJson = `const FORM_FIELDS: Record<string, string[]> = ${JSON.stringify(formFields)};`;
    const page_src = `import { useRef, useState } from 'react';
import * as api from '../services/api';

const seedObjects: Record<string, any> = ${seedJson};
${formFieldsJson}

export function ${component}({ initial }: { initial?: Record<string, any> }): JSX.Element {
${indent(pageHelpers())}
  ${readValue}
${handlers.map((h) => indent(h)).join('\n')}
${logFns.map((h) => indent(h)).join('\n')}
${appliers.map((a) => indent(a)).join('\n')}
  return (
    <>
${indent(jsx, 2)}
    </>
  );
}
`;
    files[`client/src/pages/${pageFileName(page.name)}`] = page_src;
  }

  // services/api.ts — one fetch fn per called server action.
  files['client/src/services/api.ts'] = emitApi(serverActions, calledEverywhere, sel);

  // routes.tsx, main.tsx, index.html, configs, css, package.json, README.
  files['client/src/routes.tsx'] = emitRoutes(ir, pages, sel);
  files['client/src/main.tsx'] = `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { RouterProvider } from 'react-router-dom';\nimport { router } from './routes';\nimport './index.css';\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <RouterProvider router={router} />\n  </StrictMode>,\n);\n`;
  files['client/index.html'] = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>App</title>\n</head>\n<body>\n<div id="root"></div>\n<script type="module" src="/src/main.tsx"></script>\n</body>\n</html>\n`;
  files['client/vite.config.ts'] = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { port: 5173, proxy: { '/api': 'http://localhost:${sel.port}' } },\n});\n`;
  files['client/tsconfig.json'] = JSON.stringify(
    { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, types: ['vite/client'] }, include: ['src'] },
    null, 2,
  ) + '\n';
  files['client/package.json'] = JSON.stringify(
    {
      name: 'client', private: true, version: '1.0.0', type: 'module',
      scripts: { dev: 'vite', build: 'tsc -p tsconfig.json && vite build', preview: 'vite preview' },
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', 'react-router-dom': '^7.0.0' },
      devDependencies: { '@vitejs/plugin-react': '^4.0.0', typescript: '^5.0.0', vite: '^6.0.0', '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0' },
    },
    null, 2,
  ) + '\n';
  files['client/README.md'] = `# Client\n\nPlain React + Vite + TypeScript. \`npm install && npm run dev\`.\n`;
  return { files, pages };
}

function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_$]/g, '_');
}

function indent(s: string, n = 1): string {
  const pad = '  '.repeat(n);
  return s.split('\n').map((l) => (l.trim() ? pad + l : l)).join('\n');
}

function methodProp(method: string): string {
  const m = /^set([A-Z][A-Za-z0-9]*)$/.exec(method);
  if (!m) return 'value';
  return m[1][0].toLowerCase() + m[1].slice(1);
}

interface TableRole {
  name: string;
  role: 'knob' | 'log';
  entries: Record<string, { target: string; prop: string; parseText: string; method?: string }>;
}

function discoverTables(actions: ClientActionInfo[], objects: Map<string, ObjNode>): TableRole[] {
  const out: TableRole[] = [];
  for (const a of actions) {
    // Knob tables: Record<string, { target, prop, parse, method? }>.
    for (const m of a.helpersText.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*:\s*Record<string,\s*\{[^}]*target[^}]*\}[^=]*=\s*\{([\s\S]*?)\n\}[\s;]*/g)) {
      const entries = parseKnobTable(m[0]);
      if (Object.keys(entries).length) out.push({ name: m[1], role: 'knob', entries });
    }
    // Log tables: Record<string, string> whose values are object ids on the page.
    for (const m of a.helpersText.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\}[\s;]*/g)) {
      const entries: TableRole['entries'] = {};
      for (const em of m[2].matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g)) {
        if (objects.has(em[1]) && objects.has(em[2])) entries[em[1]] = { target: em[2], prop: 'items', parseText: '(v) => v' };
      }
      if (Object.keys(entries).length) out.push({ name: m[1], role: 'log', entries });
    }
  }
  return out;
}

function pureHelperText(helpersText: string, tableNames: string[]): string {
  // Pure helpers (no ctx., no DOM) eject verbatim. Tables are consumed by the
  // generator, firedId/readControl/getElement shapes are replaced.
  const keep: string[] = [];
  for (const chunk of helpersText.split(/\n(?=const |function |export )/)) {
    const t = chunk.trim();
    if (!t) continue;
    if (/ctx\.|getElement|querySelector|closest|getAttribute/.test(t)) continue;
    if (tableNames.some((n) => new RegExp(`\\bconst\\s+${n}\\b`).test(t))) continue;
    keep.push(t);
  }
  return keep.join('\n\n');
}

function replaceLeafText(jsx: string, id: string, expr: string, fallbacks: EjectFallback[], file: string): string {
  const found = findOpenTag(jsx, id);
  if (!found) return jsx;
  const closed = matchClose(jsx, found[0]);
  if (!closed) return jsx;
  const inner = jsx.slice(found[1], closed[0]);
  if (inner.includes('<')) return jsx; // not a leaf — leave static
  return `${jsx.slice(0, found[1])}${expr}${jsx.slice(closed[0])}`;
}

function appendBeforeClose(jsx: string, id: string, addition: string, fallbacks: EjectFallback[], file: string): string {
  const found = findOpenTag(jsx, id);
  if (!found) {
    fallbacks.push({ file, line: 0, reason: `JSX has no element for '${id}' — region skipped`, source: id });
    return jsx;
  }
  const closed = matchClose(jsx, found[0]);
  if (!closed) {
    fallbacks.push({ file, line: 0, reason: `JSX element '${id}' has no close tag — region skipped`, source: id });
    return jsx;
  }
  return `${jsx.slice(0, closed[0])}${addition}${jsx.slice(closed[0])}`;
}

function replaceTbody(jsx: string, id: string, rowsJsx: string, fallbacks: EjectFallback[], file: string): string {
  const found = findOpenTag(jsx, id);
  if (!found) {
    fallbacks.push({ file, line: 0, reason: `JSX has no table for '${id}'`, source: id });
    return jsx;
  }
  const closed = matchClose(jsx, found[0]);
  if (!closed) return jsx;
  const span = jsx.slice(found[0], closed[1]);
  const tb = /<tbody>[\s\S]*?<\/tbody>/.exec(span);
  if (!tb) {
    fallbacks.push({ file, line: 0, reason: `table '${id}' has no tbody — rows left static`, source: id });
    return jsx;
  }
  const abs = found[0] + tb.index;
  return `${jsx.slice(0, abs)}<tbody>${rowsJsx}</tbody>${jsx.slice(abs + tb[0].length)}`;
}

function emitApi(
  serverActions: Array<{ name: string; domain: string }>,
  called: Set<string>,
  sel: Required<EjectSelection>,
): string {
  const byName = new Map(serverActions.map((a) => [a.name, a]));
  const lines = [
    `// Generated service layer — one typed fetch per server action the pages call.`,
    ``,
    `async function call<T = any>(path: string, params: unknown): Promise<T> {`,
    `  const res = await fetch(path, {`,
    `    method: 'POST',`,
    `    headers: { 'content-type': 'application/json' },`,
    `    body: JSON.stringify(params ?? {}),`,
    `  });`,
    `  const body = await res.json().catch(() => ({}));`,
    `  if (!res.ok) throw new Error(String((body as any)?.message ?? 'request failed'));`,
    `  return (body as any)?.data ?? (body as T);`,
    `}`,
    ``,
  ];
  // Unwrap the { success, data } envelope the Express routes send.
  for (const name of [...called].sort()) {
    const info = byName.get(name);
    if (!info) {
      lines.push(`// eject: action '${name}' has no server implementation — stubbed`);
      lines.push(`export async function ${name}(params: unknown): Promise<any> {`);
      lines.push(`  throw new Error("action '${name}' is not implemented");`);
      lines.push(`}`);
      continue;
    }
    lines.push(`export async function ${name}(params: unknown): Promise<any> {`);
    lines.push(`  return call('${sel.apiPrefix}/${info.domain}/${opName(info.domain, name)}', params);`);
    lines.push(`}`);
  }
  return lines.join('\n') + '\n';
}

function emitRoutes(ir: ProjectIR, pages: string[], sel: Required<EjectSelection>): string {
  void sel;
  const imports = pages
    .map((p) => {
      const c = pageComponentName(p);
      return `const ${c} = lazy(() => import('./pages/${c}').then((m) => ({ default: m.${c} })));`;
    })
    .join('\n');
  const routes = pages
    .map((p) => {
      const addr = ir.pages.get(p)?.address ?? `/${p}`;
      const path = addr === '/' ? '/' : `/${addr}/`;
      const c = pageComponentName(p);
      return `  { path: '${path}', element: (<Suspense fallback={null}><${c} /></Suspense>) },`;
    })
    .join('\n');
  return `import { lazy, Suspense } from 'react';\nimport { createBrowserRouter } from 'react-router-dom';\n\n${imports}\n\nexport const router = createBrowserRouter([\n${routes}\n]);\n`;
}
