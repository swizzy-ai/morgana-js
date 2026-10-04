/**
 * Deep-part rules — content: markdown and code.
 */
import type { StyleCtx } from '../props';
import type { PartRule } from './shared';

export function contentPartStyles(
  kind: string,
  id: string,
  _rawProps: Record<string, unknown>,
  _ctx: StyleCtx,
): PartRule[] {
  const sel = (suffix: string): string => `[data-entity="${id}"]${suffix}`;
  const rules: PartRule[] = [];

  if (kind === 'markdown') {
    rules.push({
      selector: sel(''),
      css: { 'font-size': '15px', 'line-height': '1.7', color: 'var(--foreground)' },
    });
    rules.push({
      selector: sel(' h1, [data-part="h1"]'),
      css: { 'font-size': '30px', 'font-weight': '800', 'line-height': '1.2', margin: '24px 0 12px' },
    });
    rules.push({
      selector: sel(' h2, [data-part="h2"]'),
      css: { 'font-size': '24px', 'font-weight': '700', 'line-height': '1.3', margin: '24px 0 10px' },
    });
    rules.push({
      selector: sel(' h3, [data-part="h3"]'),
      css: { 'font-size': '19px', 'font-weight': '700', margin: '20px 0 8px' },
    });
    rules.push({
      selector: sel(' h4, [data-part="h4"]'),
      css: { 'font-size': '16px', 'font-weight': '700', margin: '18px 0 8px' },
    });
    rules.push({
      selector: sel(' p, [data-part="p"]'),
      css: { margin: '0 0 14px' },
    });
    rules.push({
      selector: sel(' ul, [data-part="ul"]'),
      css: { margin: '0 0 14px', 'padding-left': '24px', 'list-style': 'disc' },
    });
    rules.push({
      selector: sel(' ol, [data-part="ol"]'),
      css: { margin: '0 0 14px', 'padding-left': '24px', 'list-style': 'decimal' },
    });
    rules.push({
      selector: sel(' li, [data-part="li"]'),
      css: { margin: '4px 0' },
    });
    rules.push({
      selector: sel(' a, [data-part="a"]'),
      css: { color: 'var(--primary)', 'text-decoration': 'underline' },
    });
    rules.push({
      selector: sel(' blockquote, [data-part="blockquote"]'),
      css: {
        margin: '0 0 14px',
        padding: '8px 16px',
        'border-left': '3px solid var(--border)',
        color: 'var(--muted-foreground)',
        background: 'var(--muted)',
        'border-radius': '0 6px 6px 0',
      },
    });
    rules.push({
      selector: sel(' code, [data-part="code-inline"]'),
      css: {
        'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
        'font-size': '0.9em',
        background: 'var(--muted)',
        padding: '2px 5px',
        'border-radius': '4px',
      },
    });
    rules.push({
      selector: sel(' pre, [data-part="pre"]'),
      css: {
        margin: '0 0 14px',
        padding: '14px 16px',
        background: 'var(--muted)',
        'border-radius': '8px',
        overflow: 'auto',
      },
    });
    rules.push({
      selector: sel(' pre code'),
      css: { background: 'none', padding: '0', 'font-size': '13px' },
    });
    rules.push({
      selector: sel(' hr, [data-part="hr"]'),
      css: { border: '0', 'border-top': '1px solid var(--border)', margin: '24px 0' },
    });
    rules.push({
      selector: sel(' table'),
      css: { width: '100%', 'border-collapse': 'collapse', margin: '0 0 14px', 'font-size': '14px' },
    });
    rules.push({
      selector: sel(' th, td'),
      css: { padding: '8px 10px', 'text-align': 'left', 'border-bottom': '1px solid var(--border)' },
    });
    rules.push({
      selector: sel(' img'),
      css: { 'max-width': '100%', 'border-radius': '6px' },
    });
    rules.push({
      selector: sel(' strong'),
      css: { 'font-weight': '700' },
    });
  }

  if (kind === 'code') {
    rules.push({
      selector: sel(''),
      css: {
        'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
        'font-size': '13px',
        'line-height': '1.6',
        background: 'var(--muted)',
        color: 'var(--foreground)',
        padding: '14px 16px',
        'border-radius': '8px',
        overflow: 'auto',
        margin: '0',
        'white-space': 'pre',
        tabsize: '2',
      },
    });
    rules.push({
      selector: sel('[data-variant="dark"]'),
      css: { background: '#18181B', color: '#E4E4E7' },
    });
    rules.push({
      selector: sel(' [data-part="line"]'),
      css: { display: 'block', 'min-height': '1.6em' },
    });
    rules.push({
      selector: sel(' [data-part="line"][data-line="odd"]'),
      css: { background: 'rgba(0,0,0,0.03)' },
    });
    rules.push({
      selector: sel('[data-variant="dark"] [data-part="line"][data-line="odd"]'),
      css: { background: 'rgba(255,255,255,0.04)' },
    });
    rules.push({
      selector: sel(' [data-part="gutter"]'),
      css: {
        display: 'inline-block',
        width: '2.5em',
        'text-align': 'right',
        'margin-right': '16px',
        opacity: '0.4',
        'user-select': 'none',
      },
    });
    rules.push({
      selector: sel(' [data-part="gutter"][data-line="odd"]'),
      css: { background: 'inherit' },
    });
  }

  return rules;
}
