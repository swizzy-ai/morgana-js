/**
 * Page graph round-trip.
 *
 * The request-time render path stands or falls on one property: hydrating the
 * emitted `server/pages/<name>.json` must reproduce the build output exactly.
 * If `renderPageHtml(hydrate(extract(ir)))` is byte-identical to
 * `renderPageHtml(ir)`, the artifact is sufficient and Phases 2–3 are plumbing.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createEmptyIR } from '../ir';
import { ensureNode, makeHandle, type CompileState } from '../compile-ctx/handles';
import { compileProject } from '../index';
import { renderPageHtml } from '../render/page';
import { createServerUi, isPageResult } from '../server-render';
import { extractPageGraph, hydratePageGraph } from '../render/page-graph';

type Placer = { place: (c: unknown) => void };

function project() {
  const ir = createEmptyIR();
  const state = { ir, config: {}, actionName: 'test' } as CompileState;
  ensureNode(state, 'page', { id: 'dash', title: 'Dash', address: 'dash', render: 'server' });
  ir.pages.set('dash', { name: 'dash', address: 'dash', rootIds: ['dash-table'], app: null, render: 'server' });
  const table = makeHandle(state, ensureNode(state, 'box', { id: 'dash-table' })) as unknown as Placer;
  const row = makeHandle(state, ensureNode(state, 'box', { id: 'dash-row' })) as unknown as Placer;
  const cell = makeHandle(state, ensureNode(state, 'text', { id: 'dash-cell', content: 'hi' }));
  row.place(cell);
  table.place(row);
  return ir;
}

describe('page graph round-trip', () => {
  it('extract → JSON → hydrate renders byte-identical HTML', () => {
    const ir = project();
    const before = renderPageHtml(ir, 'dash');
    const json = JSON.parse(JSON.stringify(extractPageGraph(ir, 'dash')));
    const after = renderPageHtml(hydratePageGraph(json), 'dash');
    expect(after).toBe(before);
  });

  it('a handle mutation on the hydrated IR changes the render', () => {
    const ir = project();
    const json = JSON.parse(JSON.stringify(extractPageGraph(ir, 'dash')));
    const req = hydratePageGraph(json);
    req.objects.get('dash-cell')!.props['content'] = 'loaded';
    const html = renderPageHtml(req, 'dash');
    expect(html).toContain('loaded');
    expect(html).not.toContain('>hi<');
  });

  it('extract of an unknown page fails fast', () => {
    expect(() => extractPageGraph(createEmptyIR(), 'nope')).toThrow('unknown page "nope"');
  });

  it('concurrent hydrations are isolated: mutating one never leaks into the other', () => {
    const ir = project();
    const json = JSON.parse(JSON.stringify(extractPageGraph(ir, 'dash')));
    const a = hydratePageGraph(json);
    const b = hydratePageGraph(json);
    a.objects.get('dash-cell')!.props['content'] = 'request-a';
    expect(renderPageHtml(a, 'dash')).toContain('request-a');
    expect(renderPageHtml(b, 'dash')).toContain('>hi<');
    expect(renderPageHtml(b, 'dash')).not.toContain('request-a');
  });

  it('createServerUi exposes get + pages.render + renderPage, and brands the result', async () => {
    const ir = project();
    const json = JSON.parse(JSON.stringify(extractPageGraph(ir, 'dash')));
    const calls: Array<[string, unknown]> = [];
    const { ui, renderPage } = createServerUi(json, {
      runAction: async (name, params) => {
        calls.push([name, params]);
        return { rows: [1] };
      },
    });
    const h = await (ui as any).get('dash-cell');
    expect(h).toBeDefined();
    h.setProps({ content: 'via-ui' });
    // actions.run through the render ctx is memoized per request
    await (ui as any).actions.run('getRows', { q: 1 });
    await (ui as any).actions.run('getRows', { q: 1 });
    expect(calls).toEqual([['getRows', { q: 1 }]]);
    const out = await (ui as any).pages.render('dash');
    expect(isPageResult(out)).toBe(true);
    expect(out.html).toContain('via-ui');
    expect(isPageResult({ html: 'x' })).toBe(false);
    void renderPage;
  });

  it('a render:server page emits server/pages/<name>.json; static pages do not', async () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-pg-'));
    const write = (rel: string, text: string): void => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text, 'utf8');
    };
    write(
      'morgana.config.ts',
      ["import { defineConfig } from '@morgana/sdk'", "export default defineConfig({ name: 'pg', entry: 'home' })"].join('\n'),
    );
    const action = (name: string, body: string): string =>
      [
        "import { defineClientAction } from '@morgana/sdk'",
        `export const ${name} = defineClientAction({`,
        '  config: { on: "compile" },',
        '  handler: (ctx) => {',
        `    ${body}`,
        '    return { ok: true }',
        '  },',
        '})',
      ].join('\n');
    write(
      'src/actions/compile/a.ts',
      action('a', "const p = ctx.ui.pages.create({ name: 'home', address: '/' }); p.app('main'); p.place(ctx.ui.box({ id: 'h' }))"),
    );
    write(
      'src/actions/compile/b.ts',
      action(
        'b',
        "const p = ctx.ui.pages.create({ name: 'srv', address: 'srv', render: 'server' }); p.app('main'); p.place(ctx.ui.text({ id: 'srv-t', content: 'x' }))",
      ),
    );
    const out = await compileProject({ dir, outDir: path.join(dir, 'dist') });
    expect(out.files).toContain('server/pages/srv.json');
    expect(out.files).not.toContain('server/pages/home.json');
    expect(out.files).toContain('srv/index.html');
    expect(out.files).toContain('index.html');
    const graph = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'server', 'pages', 'srv.json'), 'utf8'));
    expect(graph.page.name).toBe('srv');
    expect(graph.objects['srv-t'].props.content).toBe('x');
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60000);
});
