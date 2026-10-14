/**
 * Codemod core — translates Morgana action source into idiomatic target code.
 *
 * Two layers, matching the plan:
 *   derive  — structure/props/routes come from the IR, never from source text.
 *   adapt   — action BODIES are rewritten by ordered rules over the finite
 *             ctx surface. Anything unmatched that still mentions `ctx.` is a
 *             fallback: flagged in the report with file:line, never silently
 *             dropped.
 *
 * Rules are intentionally syntactic (regex over stylized code + AST for
 * extraction), not semantic. The docs actions prove the subset; the report
 * proves nothing leaked.
 */
import ts from 'typescript';
import type { EjectFallback } from './types';

export interface ParsedAction {
  name: string;
  lane: 'server' | 'client' | 'compile' | 'desktop';
  on: string | string[];
  handlerText: string;
  helpersText: string;
  file: string;
}

/** Parse one action file. Returns every action it declares. */
export function parseActionSources(file: string, source: string): ParsedAction[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const found: ParsedAction[] = [];
  const helperTexts: string[] = [];
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) continue;
    if (
      ts.isVariableStatement(stmt) &&
      stmt.declarationList.declarations.length === 1 &&
      stmt.declarationList.declarations[0]?.initializer &&
      ts.isCallExpression(stmt.declarationList.declarations[0].initializer)
    ) {
      const call = stmt.declarationList.declarations[0].initializer;
      const callee = call.expression.getText(sf);
      const laneMatch = /define(Server|Client|Desktop)Action/.exec(callee);
      if (laneMatch && call.arguments.length === 1 && ts.isObjectLiteralExpression(call.arguments[0])) {
        const obj = call.arguments[0];
        const name = stmt.declarationList.declarations[0].name.getText(sf);
        let on: string | string[] = '';
        let handlerText = '';
        for (const prop of obj.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = prop.name.getText(sf);
          if (key === 'config' && ts.isObjectLiteralExpression(prop.initializer)) {
            for (const cp of prop.initializer.properties) {
              if (ts.isPropertyAssignment(cp) && cp.name.getText(sf) === 'on') {
                on = evalOnLiteral(cp.initializer.getText(sf));
              }
            }
          }
          if (key === 'handler') handlerText = prop.initializer.getText(sf);
        }
        const lane = laneMatch[1] === 'Server' ? 'server' : laneMatch[1] === 'Client' ? 'client' : laneMatch[1] === 'Desktop' ? 'desktop' : 'compile';
        found.push({ name, lane: lane as ParsedAction['lane'], on, handlerText, helpersText: '', file });
        continue;
      }
    }
    // Top-level helpers (tables, firedId, readControl…) eject verbatim.
    if (!ts.isImportDeclaration(stmt)) helperTexts.push(stmt.getText(sf));
  }
  for (const f of found) f.helpersText = helperTexts.join('\n\n');
  return found;
}

/** Parse one action file. Returns null when it declares no action. */
export function parseActionSource(file: string, source: string): ParsedAction | null {
  const all = parseActionSources(file, source);
  return all.length ? all[0] : null;
}

/**
 * The handler's inner statements as source text. Arrow-with-block → the block;
 * expression body → `return <expr>;`. Callers get a body, never a wrapper.
 */
export function handlerBodyText(source: string, handlerText: string): string {
  const sf = ts.createSourceFile('tmp.ts', `const __h = ${handlerText}`, ts.ScriptTarget.ES2022, true);
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      const init = stmt.declarationList.declarations[0]?.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        if (ts.isBlock(init.body)) {
          return init.body.statements.map((s) => s.getText(sf)).join('\n');
        }
        return `return (${init.body.getText(sf)});`;
      }
    }
  }
  return handlerText;
}

function evalOnLiteral(text: string): string | string[] {
  const t = text.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  const m = /^\[(.*)\]$/s.exec(t);
  if (m) {
    return m[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return t;
}

/** Extract a top-level `const NAME = {...}` record literal source by name. */
export function extractTableSource(source: string, tableName: string): string | null {
  const sf = ts.createSourceFile('tmp.ts', source, ts.ScriptTarget.ES2022, true);
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (decl.name.getText(sf) === tableName && decl.initializer) {
          return decl.initializer.getText(sf);
        }
      }
    }
  }
  return null;
}

export interface TransformResult {
  code: string;
  fallbacks: EjectFallback[];
}

const fallback = (file: string, text: string, reason: string): EjectFallback => {
  const line = text.split('\n').length > 1 ? 0 : 0;
  return { file, line, reason, source: text.slice(0, 160) };
};

/**
 * Server action body → Express service body.
 *
 * `ctx.args` → args, collections → db, throws stay throws (the route maps
 * them to 400), `return v` stays (the route wraps res.json). Router-only UI
 * calls are stripped by splitRouterUi() before this runs.
 */
export function transformServerBody(file: string, body: string): TransformResult {
  const fallbacks: EjectFallback[] = [];
  let code = body;
  code = code.replace(/ctx\.args\b/g, 'args');
  code = code.replace(/\(ctx\.server\.collections\s+as\s+any\)/g, 'db');
  code = code.replace(/ctx\.server\.collections\b/g, 'db');
  code = code.replace(/ctx\.server\.files\b/g, 'fileStore');
  code = code.replace(/ctx\.server\.queue\.push\b/g, 'jobs.push');
  code = code.replace(/ctx\.vars\.([A-Za-z_$][\w$]*)/g, 'config.$1');
  code = code.replace(/ctx\.auth\.user\(\)/g, 'authUser(req)');
  code = code.replace(/ctx\.actions\.run\(\s*['"]([^'"]+)['"]\s*(,\s*([^)]+))?\)/g, (_m, n: string, _c: string, p: string) =>
    `services.${n}(${p ?? '{}'})`,
  );
  if (/ctx\.ai\./.test(code)) {
    fallbacks.push(fallback(file, 'ctx.ai.*', 'AI calls need provider SDK wiring — ejected as a stub'));
    code = code.replace(/ctx\.ai\.[A-Za-z_$][\w$]*/g, 'aiStub');
  }
  if (/ctx\.events\.|ctx\.channels/.test(code)) {
    fallbacks.push(fallback(file, 'ctx.events/channels', 'live channels are out of eject scope — needs manual port'));
  }
  for (const m of code.matchAll(/ctx\.[A-Za-z_$][\w$]*/g)) {
    if (/ctx\.(args|server|auth|vars)\b/.test(m[0])) continue;
    fallbacks.push(fallback(file, m[0], `untranslated ctx reference in server action`));
  }
  return { code, fallbacks };
}

/**
 * Split a router action body into data code + update map.
 *
 * `const t = ctx.ui.get('id')` declarations are dropped; `t.setProps(p)` and
 * `t.set(k, v)` become `__updates['id']` merges; `return …render(…)` becomes
 * `return __updates`. Everything else is data code that runs unchanged.
 */
export function splitRouterUi(file: string, body: string): { dataCode: string; fallbacks: EjectFallback[] } {
  const fallbacks: EjectFallback[] = [];
  const getIds = new Map<string, string>();
  for (const m of body.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?ctx\.ui\.get\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    getIds.set(m[1], m[2]);
  }
  let code = body.replace(/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:await\s+)?ctx\.ui\.get\(\s*['"][^'"]+['"]\s*\)\s*;?/g, '');
  for (const [varName, id] of getIds) {
    const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    code = code.replace(
      new RegExp(`${esc}\\s*\\?\\.\\s*setProps\\s*\\(([^)]+)\\)|${esc}\\.setProps\\s*\\(([^)]+)\\)`, 'g'),
      (_m, a: string, b: string) => `__updates['${id}'] = { ...__updates['${id}'], ...(${a ?? b}) }`,
    );
    code = code.replace(
      new RegExp(`${esc}\\s*\\?\\.\\s*set\\s*\\(([^,]+),\\s*([^)]+)\\)|${esc}\\.set\\s*\\(([^,]+),\\s*([^)]+)\\)`, 'g'),
      (_m, a: string, b: string, c: string, d: string) =>
        `__updates['${id}'] = { ...__updates['${id}'], [${a ?? c}]: ${b ?? d} }`,
    );
  }
  code = code.replace(/return\s+(?:await\s+)?ctx\.ui\.pages\.render\([^)]*\)\s*;?/g, 'return __updates;');
  code = code.replace(/return\s+(?:await\s+)?ctx\.ui\.renderPage\([^)]*\)\s*;?/g, 'return __updates;');
  if (/ctx\.ui\./.test(code)) {
    fallbacks.push(fallback(file, 'ctx.ui.*', 'router UI call outside the get/setProps/render pattern — needs manual port'));
  }
  return { dataCode: code, fallbacks };
}
