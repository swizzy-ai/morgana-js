/**
 * Express emitter — a normal Express + TypeScript backend.
 *
 * services/<domain>.ts  action bodies, codemodded (ctx.* → db/args/services)
 * routes/<domain>.ts    POST /api/<domain>/<op> per action, GET for page routers
 * db.ts / schema.sql    better-sqlite3, schema from stores.json
 * middleware/auth.ts    sessions in sqlite; errors.ts maps throws → 400/500
 * jobs.ts               queue table + node-cron triggers, in-process
 *
 * No framework strings anywhere — the grep gate enforces it.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { EjectFallback, EjectSelection } from '../core/types';
import { parseActionSources, handlerBodyText, transformServerBody, splitRouterUi } from '../core/codemod';

export interface ServerActionInfo {
  name: string;
  file: string;
  domain: string;
  on: string | string[];
  handlerBody: string;
  isRouter: boolean;
  routePath: string | null;
}

export function collectServerActions(projectDir: string): ServerActionInfo[] {
  const out: ServerActionInfo[] = [];
  const base = path.join(projectDir, 'src', 'actions', 'server');
  if (!fs.existsSync(base)) return out;
  for (const file of fs.readdirSync(base).filter((f) => f.endsWith('.ts'))) {
    const full = path.join(base, file);
    const source = fs.readFileSync(full, 'utf8');
    for (const parsed of parseActionSources(full, source)) {
      if (parsed.lane !== 'server') continue;
      const ons = Array.isArray(parsed.on) ? parsed.on : [parsed.on];
      let routePath: string | null = null;
      for (const o of ons) {
        const m = /^http\.([a-z]+)\s+(\/\S*)$/i.exec(o ?? '');
        if (m && m[1].toLowerCase() === 'get') routePath = m[2];
      }
      const isRouter = /ctx\.ui\.(pages\.render|renderPage|get)\(/.test(parsed.handlerText);
      out.push({
        name: parsed.name,
        file: full,
        domain: file.replace(/\.ts$/, ''),
        on: parsed.on,
        handlerBody: handlerBodyText(source, parsed.handlerText),
        isRouter,
        routePath,
      });
    }
  }
  return out;
}

function opName(domain: string, actionName: string): string {
  const lower = actionName.toLowerCase();
  if (lower.startsWith(domain.toLowerCase())) {
    const rest = actionName.slice(domain.length);
    return rest[0].toLowerCase() + rest.slice(1);
  }
  return actionName;
}

function serviceFile(info: ServerActionInfo, fallbacks: EjectFallback[]): string {
  const lines = [
    `import { db } from '../db/db';`,
    `import { fileStore } from '../db/files';`,
    `import { jobs } from '../jobs';`,
    `import { config } from '../config';`,
    `import { authUser } from '../middleware/auth';`,
    `import * as services from './index';`,
    '',
  ];
  let body = info.handlerBody;
  if (info.isRouter) {
    const split = splitRouterUi(info.file, body);
    fallbacks.push(...split.fallbacks);
    body = split.dataCode;
  }
  const t = transformServerBody(info.file, body);
  fallbacks.push(...t.fallbacks);
  // Service signature: data in, data out. The route owns req/res.
  lines.push(`export async function ${info.name}(args: any, req?: any): Promise<any> {`);
  if (info.isRouter) lines.push(`  const __updates: Record<string, any> = {};`);
  lines.push(t.code);
  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}

function domainService(domain: string, actions: ServerActionInfo[], fallbacks: EjectFallback[]): string {
  return actions.map((a) => serviceFile(a, fallbacks)).join('\n');
}

/** Rewrite bare `services.NAME(` to its namespaced `services.DOMAIN.NAME(`. */
export function qualifyServiceCalls(code: string, actions: ServerActionInfo[]): string {
  const byName = new Map(actions.map((a) => [a.name, a.domain]));
  return code.replace(/\bservices\.([A-Za-z_$][\w$]*)\s*\(/g, (m, n: string) => {
    const d = byName.get(n);
    return d ? `services.${d}.${n}(` : m;
  });
}

function domainRoutes(
  domain: string,
  actions: ServerActionInfo[],
  sel: Required<EjectSelection>,
): string {
  const lines = [
    `import { Router } from 'express';`,
    `import * as service from '../services/${domain}';`,
    '',
    `export const ${domain}Router = Router();`,
    '',
  ];
  for (const a of actions) {
    if (a.isRouter && a.routePath) {
      const comp = toComponentName(a.routePath);
      lines.push(`// Server-rendered page: fetch, then render the React component to HTML.`);
      lines.push(`${domain}Router.get('${a.routePath}', async (req, res, next) => {`);
      lines.push(`  try {`);
      lines.push(`    const args = { ...req.query, ...req.params, ...req.body };`);
      lines.push(`    const data = await service.${a.name}(args, req);`);
      lines.push(`    const { renderToString } = await import('react-dom/server');`);
      lines.push(`    const { ${comp} } = await import('../../client/src/pages/${comp}');`);
      lines.push(`    const html = renderToString(${comp}({ initial: data }));`);
      lines.push(`    res.send(layout(html, '${comp}'));`);
      lines.push(`  } catch (err) { next(err); }`);
      lines.push(`});`);
    } else {
      lines.push(`${domain}Router.post('/${opName(domain, a.name)}', async (req, res, next) => {`);
      lines.push(`  try {`);
      lines.push(`    const args = { ...req.query, ...req.params, ...req.body };`);
      lines.push(`    res.json(await service.${a.name}(args, req));`);
      lines.push(`  } catch (err) { next(err); }`);
      lines.push(`});`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function toComponentName(routePath: string): string {
  const seg = routePath.replace(/^\/+|\/+$/g, '').split('/').pop() || 'home';
  return seg[0].toUpperCase() + seg.slice(1) + 'Page';
}

const INDEX_TS = (sel: Required<EjectSelection>, domains: string[], jobWiring: string[]) => `import express from 'express';
import path from 'node:path';
import session from 'express-session';
import SQLiteStore from 'connect-sqlite3';
import { errorHandler } from './middleware/errors';
import { registerJob, startJobs } from './jobs';
${domains.map((d) => `import { ${d}Router } from './routes/${d}';`).join('\n')}
${domains.map((d) => `import * as ${d}Service from './services/${d}';`).join('\n')}

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET ?? 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  store: new (SQLiteStore(session))({ db: 'sessions.sqlite', dir: './data' }),
}));
app.use(express.static(path.join(__dirname, '../../client/dist')));
${domains.map((d) => `app.use('${sel.apiPrefix}/${d}', ${d}Router);`).join('\n')}
app.use(errorHandler);

${jobWiring.join('\n')}
startJobs();
const port = Number(process.env.PORT ?? ${sel.port});
app.listen(port, () => console.log(\`listening on \${port}\`));
`;

const ERRORS_TS = `import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  const status = typeof err?.status === 'number' ? err.status : 400;
  res.status(status).json({ message: String(err?.message ?? 'request failed') });
}
`;

const AUTH_TS = `import type { Request } from 'express';

export function authUser(req: Request): any {
  return (req as any).session?.user ?? null;
}
`;

const DB_TS = `import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const file = process.env.DB_PATH ?? './data/app.sqlite';
fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
const sqlite = new Database(path.resolve(file));
sqlite.pragma('journal_mode = WAL');

function rows(sql: string, params: unknown[] = []): any[] {
  return sqlite.prepare(sql).all(...params) as any[];
}

function parseCell(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function parseRow(r: any): any {
  if (!r || typeof r !== 'object') return r;
  const out: any = {};
  for (const [k, v] of Object.entries(r)) out[k] = parseCell(v);
  return out;
}

export const db = {
  query: async (name: string, o: any = {}) => {
    let sql = \`select * from "\${name}"\`;
    const params: unknown[] = [];
    if (o?.sort?.field) sql += \` order by "\${o.sort.field}" \${String(o.sort.dir ?? 'asc').toUpperCase() === 'DESC' ? 'desc' : 'asc'}\`;
    if (o?.pageSize) sql += \` limit \${Number(o.pageSize)} offset \${(Number(o.page ?? 1) - 1) * Number(o.pageSize)}\`;
    const items = rows(sql, params).map(parseRow);
    return { items, total: items.length };
  },
  get: async (name: string, id: string) => parseRow(sqlite.prepare(\`select * from "\${name}" where id = ?\`).get(id) ?? null),
  add: async (name: string, data: any) => {
    const id = data.id ?? \`\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2, 8)}\`;
    const record = { id, ...data };
    const cols = Object.keys(record);
    sqlite.prepare(\`insert into "\${name}" (\${cols.map((c) => \`"\${c}"\`).join(', ')}) values (\${cols.map(() => '?').join(', ')})\`).run(...cols.map((c) => JSON.stringify(record[c]) ?? null));
    return record;
  },
  set: async (name: string, id: string, data: any) => {
    const cols = Object.keys(data);
    if (cols.length) sqlite.prepare(\`update "\${name}" set \${cols.map((c) => \`"\${c}" = ?\`).join(', ')} where id = ?\`).run(...cols.map((c) => JSON.stringify(data[c]) ?? null), id);
    return db.get(name, id);
  },
  update: async (name: string, id: string, data: any) => db.set(name, id, data),
  remove: async (name: string, id: string) => {
    sqlite.prepare(\`delete from "\${name}" where id = ?\`).run(id);
    return { ok: true };
  },
  count: async (name: string) => (sqlite.prepare(\`select count(*) as n from "\${name}"\`).get() as any)?.n ?? 0,
};
`;

const FILES_TS = `import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('./data/files');
fs.mkdirSync(dir, { recursive: true });

export const fileStore = {
  read: async (p: string) => fs.readFileSync(path.join(dir, p)),
  write: async (p: string, data: any) => {
    const full = path.join(dir, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
    return { path: p };
  },
  remove: async (p: string) => { fs.rmSync(path.join(dir, p), { force: true }); return { ok: true }; },
  list: async (prefix = '') => fs.readdirSync(path.join(dir, prefix)),
};
`;

const JOBS_TS = `import cron from 'node-cron';

export const jobs = {
  push: async (name: string, payload: unknown) => ({ queued: name, payload, at: Date.now() }),
};

const scheduled: Array<{ run: string; fn: (args: any) => Promise<unknown>; cron: string }> = [];

export function registerJob(run: string, fn: (args: any) => Promise<unknown>, schedule: string): void {
  scheduled.push({ run, fn, cron: schedule });
}

export function startJobs(): void {
  for (const s of scheduled) cron.schedule(s.cron, () => s.fn({}));
}
`;

const CONFIG_TS = `export const config = {
  port: Number(process.env.PORT ?? 3001),
};
`;

const LAYOUT_TS = `export function layout(body: string, title: string): string {
  return \`<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>\${title}</title><link rel="stylesheet" href="/index.css" /></head><body><div id="root">\${body}</div><script type="module" src="/src/main.tsx"></script></body></html>\`;
}
`;

export function schemaSql(stores: Array<{ name: string; shape?: { columns?: Array<{ name: string; type?: string }> } }>): string {
  return stores
    .map((s) => {
      const cols = (s.shape?.columns ?? []).map((c) => `"${c.name}" text`).join(', ');
      return `create table if not exists "${s.name}" (id text primary key${cols ? `, ${cols}` : ''});`;
    })
    .join('\n');
}

function entityTypes(stores: Array<{ name: string; shape?: { columns?: Array<{ name: string; type?: string }> } }>): string {
  return stores
    .map((s) => {
      const fields = (s.shape?.columns ?? [])
        .map((c) => `  ${c.name}: ${c.type === 'number' ? 'number' : c.type === 'boolean' ? 'boolean' : 'string'};`)
        .join('\n');
      const iname = s.name.replace(/(^|_)([a-z])/g, (_m, _p: string, c: string) => c.toUpperCase()).replace(/s$/, '');
      return `export interface ${iname} {\n  id: string;\n${fields}\n}`;
    })
    .join('\n\n');
}

export interface ExpressEmit {
  files: Record<string, string>;
  routes: string[];
  actions: string[];
}

export function emitExpress(
  projectDir: string,
  actions: ServerActionInfo[],
  stores: Array<{ name: string; shape?: { columns?: Array<{ name: string; type?: string }> } }>,
  triggers: Array<{ cron?: string; run?: string }>,
  sel: Required<EjectSelection>,
  fallbacks: EjectFallback[],
): ExpressEmit {
  void projectDir;
  const files: Record<string, string> = {};
  const domains = [...new Set(actions.map((a) => a.domain))];
  const routes: string[] = [];
  const byName = new Map(actions.map((a) => [a.name, a]));
  for (const domain of domains) {
    const list = actions.filter((a) => a.domain === domain);
    let svc = domainService(domain, list, fallbacks);
    svc = qualifyServiceCalls(svc, actions);
    files[`server/src/services/${domain}.ts`] = svc;
    files[`server/src/routes/${domain}.ts`] = domainRoutes(domain, list, sel);
    for (const a of list) {
      routes.push(a.isRouter && a.routePath ? `GET ${a.routePath}` : `POST ${sel.apiPrefix}/${domain}/${opName(domain, a.name)}`);
    }
  }
  const jobWiring: string[] = [];
  for (const t of triggers) {
    if (!t.cron || !t.run) continue;
    const a = byName.get(t.run);
    if (!a) continue;
    jobWiring.push(`registerJob('${t.run}', (args) => ${a.domain}Service.${a.name}(args), '${t.cron}');`);
  }
  const svcIndex = domains.map((d) => `export * as ${d} from './${d}';`).join('\n') + '\n';
  files['server/src/services/index.ts'] = svcIndex;
  files['server/src/index.ts'] = INDEX_TS(sel, domains, jobWiring);
  files['server/src/middleware/errors.ts'] = ERRORS_TS;
  files['server/src/middleware/auth.ts'] = AUTH_TS;
  files['server/src/db/db.ts'] = DB_TS;
  files['server/src/db/files.ts'] = FILES_TS;
  files['server/src/db/schema.sql'] = schemaSql(stores) + '\n';
  files['server/src/db/types.ts'] = entityTypes(stores) + '\n';
  files['server/src/jobs.ts'] = JOBS_TS;
  files['server/src/config.ts'] = CONFIG_TS;
  files['server/src/ssr.ts'] = `export { layout } from './layout';\n`;
  files['server/src/layout.ts'] = LAYOUT_TS;
  files['server/package.json'] = JSON.stringify(
    {
      name: 'server',
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: { dev: 'tsx watch src/index.ts', build: 'tsc -p tsconfig.json', start: 'node dist/index.js' },
      dependencies: {
        'better-sqlite3': '^11.0.0',
        'connect-sqlite3': '^0.9.0',
        express: '^5.0.0',
        'express-session': '^1.18.0',
        'node-cron': '^3.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
      devDependencies: { tsx: '^4.0.0', typescript: '^5.0.0', '@types/express': '^5.0.0', '@types/express-session': '^1.18.0', '@types/node': '^22.0.0', '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0' },
    },
    null,
    2,
  ) + '\n';
  files['server/tsconfig.json'] = JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react-jsx',
        strict: true, skipLibCheck: true, outDir: 'dist', rootDir: 'src',
        types: ['node'],
      },
      include: ['src'],
    },
    null,
    2,
  ) + '\n';
  return { files, routes, actions: actions.map((a) => a.name) };
}
