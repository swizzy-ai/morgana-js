/**
 * Deep-part rules — overlay: dialog, tabs, accordion, dropdown, menu, tooltip.
 */
import type { StyleCtx } from '../props';
import type { PartRule } from './shared';

export function overlayPartStyles(
  kind: string,
  id: string,
  _rawProps: Record<string, unknown>,
  _ctx: StyleCtx,
): PartRule[] {
  const sel = (suffix: string): string => `[data-entity="${id}"]${suffix}`;
  const rules: PartRule[] = [];

  if (kind === 'dialog') {
    rules.push({
      selector: sel(' [data-part="overlay"]'),
      css: { position: 'absolute', inset: '0', background: 'rgba(0, 0, 0, 0.5)' },
    });
    rules.push({
      selector: sel(' [data-part="header"]'),
      css: { 'font-size': '18px', 'font-weight': '600', 'margin-bottom': '8px' },
    });
    rules.push({
      selector: sel(' [data-part="description"]'),
      css: { 'font-size': '14px', color: 'var(--muted-foreground)', 'margin-bottom': '16px' },
    });
    rules.push({
      selector: sel(' [data-part="footer"]'),
      css: { display: 'flex', 'justify-content': 'flex-end', gap: '8px', 'margin-top': '16px' },
    });
  }

  if (kind === 'tabs') {
    rules.push({
      selector: sel(' [data-part="tab-list"]'),
      css: { display: 'flex', 'border-bottom': '1px solid var(--border)' },
    });
    rules.push({
      selector: sel(' [data-part="tab"]'),
      css: { padding: '8px 16px', cursor: 'pointer', 'border-bottom': '2px solid transparent', 'margin-bottom': '-1px' },
    });
    rules.push({
      selector: sel(' [data-part="tab"][data-active="true"]'),
      css: { color: 'var(--primary)', 'border-bottom-color': 'var(--primary)', 'font-weight': '600' },
    });
    rules.push({
      selector: sel(' [data-part="tab"][data-disabled="true"]'),
      css: { opacity: '0.5', cursor: 'not-allowed' },
    });
    rules.push({
      selector: sel(' [data-part="panel"]'),
      css: { padding: '16px 0' },
    });
    // Vertical: the list becomes a rail down the left edge.
    rules.push({
      selector: sel('[data-orientation="vertical"]'),
      css: { display: 'flex', 'flex-direction': 'row', gap: '16px', 'align-items': 'flex-start' },
    });
    rules.push({
      selector: sel('[data-orientation="vertical"] [data-part="tab-list"]'),
      css: { 'flex-direction': 'column', 'border-bottom': 'none', 'border-right': '1px solid var(--border)', 'flex': 'none' },
    });
    rules.push({
      selector: sel('[data-orientation="vertical"] [data-part="tab"]'),
      css: { 'text-align': 'left', 'border-bottom': 'none', 'border-right': '2px solid transparent', 'margin-bottom': '0', 'margin-right': '-1px' },
    });
    rules.push({
      selector: sel('[data-orientation="vertical"] [data-part="tab"][data-active="true"]'),
      css: { 'border-right-color': 'var(--primary)', 'border-bottom-color': 'transparent' },
    });
    rules.push({
      selector: sel('[data-orientation="vertical"] [data-part="panel"]'),
      css: { flex: '1', 'min-width': '0' },
    });
    // ── Tabs variants ──
    // 'line' is the default, stated explicitly so every declared variant has a
    // rule and none of them can drift into having no styling at all.
    rules.push({
      selector: sel('[data-variant="line"] [data-part="tab-list"]'),
      css: { 'border-bottom': '1px solid var(--border)' },
    });
    rules.push({
      selector: sel('[data-variant="line"] [data-part="tab"][data-active="true"]'),
      css: { 'border-bottom-color': 'var(--primary)', color: 'var(--primary)' },
    });
    rules.push({
      selector: sel('[data-variant="pill"] [data-part="tab-list"], [data-variant="pills"] [data-part="tab-list"]'),
      css: { 'border-bottom': 'none', background: 'var(--muted)', padding: '4px', 'border-radius': '8px', gap: '2px' },
    });
    rules.push({
      selector: sel('[data-variant="pill"] [data-part="tab"], [data-variant="pills"] [data-part="tab"]'),
      css: { 'border-radius': '6px', 'border-bottom': 'none', margin: '0', padding: '6px 12px' },
    });
    rules.push({
      selector: sel('[data-variant="pill"] [data-part="tab"][data-active="true"], [data-variant="pills"] [data-part="tab"][data-active="true"]'),
      css: { background: 'var(--card)', color: 'var(--foreground)', 'box-shadow': '0 1px 2px rgba(0,0,0,0.06)' },
    });
    rules.push({
      selector: sel('[data-variant="enclosed"] [data-part="tab-list"]'),
      css: { 'border-bottom': '1px solid var(--border)', gap: '4px' },
    });
    rules.push({
      selector: sel('[data-variant="enclosed"] [data-part="tab"]'),
      css: { 'border-radius': '6px 6px 0 0', 'border-bottom': '1px solid var(--border)' },
    });
    rules.push({
      selector: sel('[data-variant="enclosed"] [data-part="tab"][data-active="true"]'),
      css: { 'border-bottom-color': 'transparent' },
    });
    rules.push({
      selector: sel('[data-variant="bordered"] [data-part="tab"]'),
      css: { border: '1px solid var(--border)', 'border-bottom': 'none', 'margin-left': '-1px' },
    });
  }

  // ── Accordion ──────────────────────────────────────────────────────────
  if (kind === 'accordion') {
    rules.push({
      selector: sel(''),
      css: { display: 'flex', 'flex-direction': 'column', 'border-top': '1px solid var(--border)' },
    });
    rules.push({
      selector: sel(' [data-part="accordion-item"]'),
      css: { 'border-bottom': '1px solid var(--border)' },
    });
    rules.push({
      selector: sel(' [data-part="accordion-trigger"]'),
      css: {
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        gap: '12px',
        width: '100%',
        padding: '14px 4px',
        background: 'none',
        border: '0',
        'font-size': '14px',
        'font-weight': '500',
        color: 'var(--foreground)',
        cursor: 'pointer',
        'text-align': 'left',
      },
    });
    rules.push({
      selector: sel(' [data-part="accordion-trigger"][data-disabled="true"]'),
      css: { opacity: '0.5', cursor: 'not-allowed' },
    });
    rules.push({
      selector: sel(' [data-part="accordion-trigger"] [data-part="chevron"]'),
      css: { transition: 'transform 0.2s', 'flex': 'none', color: 'var(--muted-foreground)' },
    });
    rules.push({
      selector: sel(' [data-part="accordion-trigger"][data-open="true"] [data-part="chevron"]'),
      css: { transform: 'rotate(180deg)' },
    });
    rules.push({
      selector: sel(' [data-part="accordion-panel"]'),
      css: { padding: '0 4px 16px', 'font-size': '14px', color: 'var(--muted-foreground)' },
    });
  }

  // ── Dropdown / menu ────────────────────────────────────────────────────
  if (kind === 'dropdown' || kind === 'menu') {
    rules.push({
      selector: sel(''),
      css: { position: 'relative', display: 'inline-block' },
    });
    rules.push({
      selector: sel(' [data-part="dropdown-trigger"]'),
      css: { cursor: 'pointer' },
    });
    rules.push({
      selector: sel(' [data-part="dropdown-trigger"][data-disabled="true"]'),
      css: { opacity: '0.5', cursor: 'not-allowed' },
    });
    rules.push({
      selector: sel(' [data-part="dropdown-panel"]'),
      css: {
        position: 'absolute',
        top: '100%',
        left: '0',
        'min-width': '180px',
        padding: '4px',
        background: 'var(--card)',
        color: 'var(--card-foreground)',
        border: '1px solid var(--border)',
        'border-radius': '8px',
        'box-shadow': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        'z-index': '40',
        display: 'flex',
        'flex-direction': 'column',
      },
    });
    rules.push({
      selector: sel('[data-open="true"] [data-part="dropdown-panel"]'),
      css: { display: 'flex' },
    });
    if (kind === 'menu') {
      // A horizontal menu lays its items out inline and drops downward.
      rules.push({
        selector: sel(''),
        css: { display: 'flex', 'align-items': 'center', gap: '4px' },
      });
      rules.push({
        selector: sel(' [data-part="dropdown-panel"]'),
        css: { top: '100%' },
      });
    }
    rules.push({
      selector: sel(' [data-part="dropdown-item"]'),
      css: {
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
        padding: '8px 10px',
        'border-radius': '6px',
        'font-size': '14px',
        color: 'inherit',
        cursor: 'pointer',
        'text-decoration': 'none',
      },
    });
    rules.push({
      selector: sel(' [data-part="dropdown-item"]:hover'),
      css: { background: 'var(--muted)' },
    });
    rules.push({
      selector: sel(' [data-part="dropdown-item"][data-disabled="true"]'),
      css: { opacity: '0.5', cursor: 'not-allowed' },
    });
    rules.push({
      selector: sel(' [data-part="dropdown-item"][data-active="true"]'),
      css: { background: 'var(--muted)', 'font-weight': '500' },
    });
    rules.push({
      selector: sel(' [data-part="dropdown-separator"]'),
      css: { height: '1px', background: 'var(--border)', margin: '4px 0' },
    });
  }

  // ── Tooltip ────────────────────────────────────────────────────────────
  if (kind === 'tooltip') {
    rules.push({
      selector: sel(''),
      css: { position: 'relative', display: 'inline-flex' },
    });
    rules.push({
      selector: sel(' [data-part="tip"]'),
      css: {
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        'margin-bottom': '6px',
        padding: '6px 10px',
        background: 'var(--foreground)',
        color: 'var(--background)',
        'font-size': '12px',
        'line-height': '1.4',
        'border-radius': '6px',
        'white-space': 'nowrap',
        'z-index': '60',
        opacity: '0',
        visibility: 'hidden',
        transition: 'opacity 0.15s',
        'pointer-events': 'none',
      },
    });
    rules.push({
      selector: sel('[data-visible="true"] [data-part="tip"]'),
      css: { opacity: '1', visibility: 'visible' },
    });
    rules.push({
      selector: sel('[data-placement="bottom"] [data-part="tip"]'),
      css: { bottom: 'auto', top: '100%', 'margin-bottom': '0', 'margin-top': '6px' },
    });
  }

  return rules;
}
