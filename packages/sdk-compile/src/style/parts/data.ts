/**
 * Deep-part rules — data: table, progress, chart, list.
 */
import { PROGRESS_VARIANTS, TABLE_DENSITY } from '../tokens';
import type { StyleCtx } from '../props';
import type { PartRule } from './shared';

export function dataPartStyles(
  kind: string,
  id: string,
  rawProps: Record<string, unknown>,
  _ctx: StyleCtx,
): PartRule[] {
  const sel = (suffix: string): string => `[data-entity="${id}"]${suffix}`;
  const rules: PartRule[] = [];

  if (kind === 'table') {
    const densityKey = typeof rawProps['density'] === 'string' ? rawProps['density'] : 'normal';
    const d = TABLE_DENSITY[densityKey] ?? TABLE_DENSITY['normal']!;
    const variant = typeof rawProps['variant'] === 'string' ? rawProps['variant'] : 'default';
    rules.push({
      selector: sel(' thead th'),
      css: {
        'font-size': d.headerSize,
        'font-weight': '600',
        'text-align': 'left',
        padding: `${d.cellY} ${d.cellX}`,
        'border-bottom': '1px solid var(--border)',
      },
    });
    rules.push({
      selector: sel(' tbody td'),
      css: {
        'font-size': d.cellSize,
        padding: `${d.cellY} ${d.cellX}`,
        ...(variant === 'bordered' ? { border: '1px solid var(--border)' } : { 'border-bottom': '1px solid var(--border)' }),
      },
    });
    if (variant === 'striped') {
      rules.push({
        selector: sel(' tbody tr:nth-child(even)'),
        css: { background: 'var(--muted)' },
      });
    }
    rules.push({
      selector: sel(' th[data-sortable="true"]'),
      css: { cursor: 'pointer', 'user-select': 'none' },
    });
    rules.push({
      selector: sel(' [data-part="sort-arrow"]'),
      css: { opacity: '0.5', 'font-size': '10px', 'margin-left': '4px' },
    });
    // Row selection — the prop existed but was never styled, so selecting a row
    // produced no visual change at all.
    rules.push({
      selector: sel(' tbody tr[data-selected="true"]'),
      css: { background: 'color-mix(in srgb, var(--primary) 12%, transparent)' },
    });
    rules.push({
      selector: sel(' tbody tr[data-selected="true"] td'),
      css: { 'border-color': 'var(--primary)' },
    });
    rules.push({
      selector: sel(' [data-part="select-cell"]'),
      css: { width: '1%', 'white-space': 'nowrap' },
    });
    if (rawProps['loading'] === true) {
      rules.push({
        selector: sel(''),
        css: { opacity: '0.5', 'pointer-events': 'none' },
      });
      rules.push({
        selector: sel('::after'),
        css: { content: '"Loading…"' },
      });
    }
    if (rawProps['stickyHeader'] === true) {
      rules.push({
        selector: sel(' thead th'),
        css: { position: 'sticky', top: '0', background: 'var(--card)', 'z-index': '1' },
      });
    }
    rules.push({
      selector: sel(' caption'),
      css: { 'text-align': 'left', 'font-size': '13px', color: 'var(--muted-foreground)', padding: '0 0 8px' },
    });
    rules.push({
      selector: sel(' tbody td[colspan]'),
      css: { 'text-align': 'center', color: 'var(--muted-foreground)', padding: '24px 8px' },
    });
    rules.push({
      selector: sel(' [data-part="page-size"]'),
      css: {
        display: 'inline-flex',
        'align-items': 'center',
        gap: '6px',
        'margin-left': '12px',
        'font-size': '13px',
        color: 'var(--muted-foreground)',
      },
    });
    rules.push({
      selector: sel(' [data-part="page-size"] select'),
      css: {
        border: '1px solid var(--border)',
        'border-radius': '6px',
        background: 'var(--card)',
        color: 'var(--foreground)',
        padding: '3px 6px',
        'font-size': '13px',
      },
    });
    rules.push({
      selector: sel(' [data-part="total"]'),
      css: { 'font-size': '13px', color: 'var(--muted-foreground)', 'margin-left': '8px' },
    });
    // Variants beyond striped/bordered: cards and elevated change the row box.
    if (rawProps['variant'] === 'cards') {
      rules.push({
        selector: sel(' tbody tr'),
        css: {
          border: '1px solid var(--border)',
          'border-radius': '8px',
          margin: '6px 0',
          display: 'block',
        },
      });
      rules.push({
        selector: sel(' tbody td'),
        css: { display: 'inline-block', width: 'auto', 'border-bottom': 'none', padding: '6px 10px' },
      });
      rules.push({
        selector: sel(' tbody td::before'),
        css: { content: 'attr(data-label) " "', color: 'var(--muted-foreground)', 'font-size': '12px' },
      });
    }
    if (rawProps['variant'] === 'elevated') {
      rules.push({
        selector: sel(''),
        css: { 'box-shadow': '0 4px 12px -2px rgba(0,0,0,0.08)', 'border-radius': '10px', 'border': '1px solid var(--border)' },
      });
    }
    if (rawProps['variant'] === 'glass') {
      rules.push({
        selector: sel(''),
        css: {
          'backdrop-filter': 'blur(12px)',
          background: 'rgba(255,255,255,0.7)',
          'border-radius': '10px',
        },
      });
    }
  }

  if (kind === 'progress') {
    const variant = typeof rawProps['variant'] === 'string' ? rawProps['variant'] : 'emerald';
    rules.push({
      selector: sel(' [data-part="fill"]'),
      css: { height: '100%', background: PROGRESS_VARIANTS[variant] ?? PROGRESS_VARIANTS['emerald']!, 'border-radius': 'inherit' },
    });
  }

  return rules;
}
