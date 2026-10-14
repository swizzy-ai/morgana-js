import { describe, expect, it } from 'vitest';
import {
  parseActionSource,
  handlerBodyText,
  transformServerBody,
  splitRouterUi,
  extractTableSource,
} from '../core/codemod';
import { translateClientBody, dropTableBranch } from '../react/translate';
import { translateMethod } from '../react/methods';
import { opName } from '../core/names';

const SERVER = `import { defineServerAction } from '@morgana/sdk'
export const notesAdd = defineServerAction({
  config: { on: 'notesAdd' },
  handler: async (ctx) => {
    const text = String(ctx.args?.text ?? '').trim()
    if (!text) throw new Error('note text must not be empty')
    return (ctx.server.collections as any).add('docs_notes', { text, createdAt: Date.now() })
  },
})`;

describe('parseActionSource', () => {
  it('extracts name, lane, handler and body', () => {
    const p = parseActionSource('notes.ts', SERVER)!;
    expect(p.name).toBe('notesAdd');
    expect(p.lane).toBe('server');
    expect(handlerBodyText(SERVER, p.handlerText)).toContain('ctx.args');
  });
  it('returns null for non-action files', () => {
    expect(parseActionSource('x.ts', 'export const a = 1;')).toBeNull();
  });
});

describe('transformServerBody', () => {
  it('maps args, collections, nested runs; keeps throws and returns', () => {
    const body = `const text = String(ctx.args?.text ?? '').trim()
if (!text) throw new Error('nope')
const r = await ctx.actions.run('other', { a: 1 })
return (ctx.server.collections as any).add('n', { text })`;
    const t = transformServerBody('f.ts', body);
    expect(t.code).toContain('args?.text');
    expect(t.code).toContain('db.add(');
    expect(t.code).toContain(`services.other({ a: 1 })`);
    expect(t.code).toContain(`throw new Error('nope')`);
    expect(t.code).toContain('return db.add(');
    expect(t.fallbacks).toEqual([]);
  });
  it('flags ai and unknown ctx', () => {
    const t = transformServerBody('f.ts', `const x = await ctx.ai.generateText({}); return ctx.foo.bar;`);
    expect(t.fallbacks.length).toBeGreaterThanOrEqual(1);
    expect(t.code).toContain('aiStub');
  });
});

describe('splitRouterUi', () => {
  it('drops gets, merges setProps, returns updates', () => {
    const body = `const rows = await ctx.server.collections.query('n', {})
const t = ctx.ui.get('tbl')
t.setProps({ rows })
return ctx.ui.pages.render('p')`;
    const s = splitRouterUi('f.ts', body);
    expect(s.dataCode).toContain(`__updates['tbl']`);
    expect(s.dataCode).toContain('return __updates;');
    expect(s.dataCode).not.toContain('ctx.ui');
    expect(s.fallbacks).toEqual([]);
  });
});

describe('translateClientBody', () => {
  it('translates bound method calls and drops page guards', () => {
    const body = `if (!ctx.ui.get('d-basic-content')) return { ok: false }
const target = ctx.ui.get('d-box-target')
target.set('bg', 'red')
const v = target.get('value')`;
    const t = translateClientBody('f.ts', body, {});
    expect(t.code).toContain(`patch('d-box-target', { ['bg']: 'red' })`);
    expect(t.code).toContain(`objs['d-box-target']?.['value']`);
    expect(t.code).not.toContain('ctx.ui');
    expect(t.fallbacks).toEqual([]);
  });
  it('rewrites actions.run and ctx.event, flags DOM reads', () => {
    const body = `const r = await ctx.actions.run('notesAdd', { text })
const el = h.getElement()
const id = (ctx.event as any)?.target`;
    const t = translateClientBody('f.ts', body, {});
    expect(t.code).toContain('api.notesAdd({ text })');
    expect(t.calledActions).toEqual(['notesAdd']);
    expect(t.code).toContain('firedId');
    expect(t.fallbacks.some((f) => f.reason.includes('DOM read'))).toBe(true);
  });
  it('drops consumed table branches', () => {
    const body = `const knob = KNOBS[id]
if (knob) { target.set(knob.prop, 1) }
const x = 1;`;
    expect(dropTableBranch(body, 'KNOBS')).not.toContain('knob');
  });
});

describe('translateMethod', () => {
  it('covers common methods, defaults setters, nulls unknown', () => {
    expect(translateMethod('setProps', 'a', '{ x: 1 }')).toBe(`patch('a', { x: 1 })`);
    expect(translateMethod('setName', 'a', `'x'`)).toBe(`patch('a', { name: 'x' })`);
    expect(translateMethod('notify', 'a', '{ title: 1 }')).toContain(`pushToast('a'`);
    expect(translateMethod('frobnicate', 'a', '')).toBeNull();
  });
});

describe('opName', () => {
  it('strips the domain prefix', () => {
    expect(opName('notes', 'notesAdd')).toBe('add');
    expect(opName('notes', 'list')).toBe('list');
  });
});

describe('extractTableSource', () => {
  it('finds top-level tables', () => {
    const src = `const KNOBS = { a: 1 };\nexport const x = 2;`;
    expect(extractTableSource(src, 'KNOBS')).toContain('a: 1');
    expect(extractTableSource(src, 'NOPE')).toBeNull();
  });
});
