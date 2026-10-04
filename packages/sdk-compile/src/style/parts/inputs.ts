/**
 * Deep-part rules — inputs: form, switch, checkbox, radio, toggle, field.
 */
import { SHADOW_SCALE, SWITCH_SIZES } from '../tokens';
import type { StyleCtx } from '../props';
import type { PartRule } from './shared';

export function inputPartStyles(
  kind: string,
  id: string,
  rawProps: Record<string, unknown>,
  _ctx: StyleCtx,
): PartRule[] {
  const sel = (suffix: string): string => `[data-entity="${id}"]${suffix}`;
  const rules: PartRule[] = [];

  if (kind === 'switch' || kind === 'checkbox' || kind === 'radio' || kind === 'toggle') {
    const sizeKey = typeof rawProps['size'] === 'string' ? rawProps['size'] : 'md';
    const g = SWITCH_SIZES[sizeKey] ?? SWITCH_SIZES['md']!;
    const disabled = rawProps['disabled'] === true;
    const onLeft = `calc(100% - ${g.thumb}px - ${g.pad}px)`;
    rules.push({
      selector: sel(''),
      css: { display: 'flex', 'align-items': 'center', gap: '8px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? '0.5' : '1' },
    });
    rules.push({
      selector: sel(' [data-part="track"]'),
      css: {
        width: `${g.trackW}px`,
        height: `${g.trackH}px`,
        background: 'var(--muted)',
        'border-radius': '9999px',
        position: 'relative',
        transition: 'background 0.2s',
        flex: 'none',
      },
    });
    rules.push({
      selector: sel('[data-checked="true"] [data-part="track"]'),
      css: { background: 'var(--primary)' },
    });
    rules.push({
      selector: sel(' [data-part="thumb"]'),
      css: {
        width: `${g.thumb}px`,
        height: `${g.thumb}px`,
        background: 'white',
        'border-radius': '9999px',
        position: 'absolute',
        top: `${g.pad}px`,
        left: `${g.pad}px`,
        transition: 'left 0.2s',
        'box-shadow': SHADOW_SCALE['xs']!,
      },
    });
    rules.push({
      selector: sel('[data-checked="true"] [data-part="thumb"]'),
      css: { left: onLeft },
    });
    rules.push({
      selector: sel(' [data-part="label"]'),
      css: { 'font-size': '14px', color: 'var(--foreground)' },
    });
    rules.push({
      selector: sel(' [data-part="description"]'),
      css: { 'font-size': '12px', color: 'var(--muted-foreground)' },
    });
  }

  // ── Select ─────────────────────────────────────────────────────────────
  if (kind === 'select') {
    rules.push({
      selector: sel(''),
      css: { display: 'inline-flex', 'flex-direction': 'column', gap: '4px', position: 'relative' },
    });
    rules.push({
      selector: sel(' > select'),
      css: {
        appearance: 'none',
        padding: '8px 30px 8px 10px',
        border: '1px solid var(--border)',
        'border-radius': '6px',
        background: 'var(--card)',
        color: 'var(--foreground)',
        'font-size': '14px',
        cursor: 'pointer',
        'min-width': '120px',
      },
    });
    rules.push({
      selector: sel(' > select:disabled'),
      css: { opacity: '0.5', cursor: 'not-allowed' },
    });
    rules.push({
      selector: sel(' > select:focus-visible'),
      css: { outline: '2px solid var(--primary)', 'outline-offset': '1px' },
    });
    rules.push({
      selector: sel('[data-variant="outline"] > select'),
      css: { background: 'transparent' },
    });
    rules.push({
      selector: sel('[data-variant="ghost"] > select'),
      css: { background: 'transparent', border: 'none', 'padding-left': '4px', 'padding-right': '24px' },
    });
    rules.push({
      selector: sel('[data-variant="pill"] > select'),
      css: { 'border-radius': '9999px', 'padding-left': '14px', 'padding-right': '32px' },
    });
    // Composed select (searchable / clearable)
    rules.push({
      selector: sel(' [data-part="control"]'),
      css: {
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
        padding: '8px 10px',
        border: '1px solid var(--border)',
        'border-radius': '6px',
        background: 'var(--card)',
        'font-size': '14px',
        cursor: 'pointer',
        'min-width': '160px',
        'justify-content': 'space-between',
      },
    });
    rules.push({
      selector: sel(' [data-part="value"]'),
      css: { flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' },
    });
    rules.push({
      selector: sel(' [data-part="caret"]'),
      css: { opacity: '0.5', 'font-size': '11px', flex: 'none' },
    });
    rules.push({
      selector: sel(' [data-part="clear"]'),
      css: { opacity: '0.5', cursor: 'pointer', padding: '0 4px', 'font-size': '15px', 'line-height': '1' },
    });
    rules.push({
      selector: sel(' [data-part="clear"]:hover'),
      css: { opacity: '1' },
    });
    rules.push({
      selector: sel(' [data-part="search"]'),
      css: {
        margin: '4px 0',
        padding: '6px 8px',
        border: '1px solid var(--border)',
        'border-radius': '6px',
        'font-size': '13px',
        background: 'var(--card)',
        color: 'var(--foreground)',
      },
    });
    rules.push({
      selector: sel(' [data-part="options"]'),
      css: {
        position: 'absolute',
        top: '100%',
        left: '0',
        right: '0',
        'margin-top': '4px',
        padding: '4px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        'border-radius': '8px',
        'box-shadow': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        'max-height': '260px',
        overflow: 'auto',
        'z-index': '50',
      },
    });
    rules.push({
      selector: sel(' [data-part="option"]'),
      css: {
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
        padding: '7px 9px',
        'border-radius': '6px',
        'font-size': '14px',
        cursor: 'pointer',
      },
    });
    rules.push({
      selector: sel(' [data-part="option"]:hover'),
      css: { background: 'var(--muted)' },
    });
    rules.push({
      selector: sel(' [data-part="option"][aria-selected="true"]'),
      css: { background: 'var(--muted)', 'font-weight': '500' },
    });
    rules.push({
      selector: sel(' [data-part="option"][data-disabled="true"]'),
      css: { opacity: '0.5', cursor: 'not-allowed' },
    });
    rules.push({
      selector: sel(' [data-part="option-desc"]'),
      css: { 'font-size': '12px', color: 'var(--muted-foreground)' },
    });
    rules.push({
      selector: sel(' [data-part="option-badge"]'),
      css: {
        'margin-left': 'auto',
        'font-size': '11px',
        background: 'var(--muted)',
        'border-radius': '9999px',
        padding: '0 6px',
      },
    });
  }

  // ── Forms ──────────────────────────────────────────────────────────────
  if (kind === 'form' || kind === 'login' || kind === 'signup') {
    const layout = typeof rawProps['layout'] === 'string' ? rawProps['layout'] : 'vertical';
    const fieldGap = layout === 'compact' ? '8px' : '16px';
    rules.push({
      selector: sel(''),
      css: {
        display: 'flex',
        'flex-direction': layout === 'horizontal' ? 'row' : layout === 'inline' ? 'row' : 'column',
        'align-items': layout === 'horizontal' ? 'flex-start' : layout === 'inline' ? 'center' : 'stretch',
        gap: fieldGap,
      },
    });
    if (layout === 'inline') {
      rules.push({
        selector: sel(' [data-part="field"]'),
        css: { flex: '0 0 auto' },
      });
    }
    if (layout === 'horizontal') {
      rules.push({
        selector: sel(' [data-part="field"]'),
        css: { display: 'flex', 'align-items': 'center', gap: '12px', flex: '1 1 0' },
      });
      rules.push({
        selector: sel(' [data-part="field"] > [data-part="label"]'),
        css: { 'min-width': '120px', 'flex': 'none' },
      });
    }
    rules.push({
      selector: sel(' [data-part="field"]'),
      css: { display: 'flex', 'flex-direction': 'column', gap: '6px' },
    });
    rules.push({
      selector: sel(' [data-part="label"]'),
      css: { 'font-size': '14px', 'font-weight': '500', color: 'var(--foreground)' },
    });
    rules.push({
      selector: sel(' [data-part="label"][data-required="true"]::after'),
      css: { content: '" *"', color: '#DC2626' },
    });
    rules.push({
      selector: sel(' [data-part="hint"]'),
      css: { 'font-size': '12px', color: 'var(--muted-foreground)' },
    });
    rules.push({
      selector: sel(' [data-part="footer"]'),
      css: { display: 'flex', gap: '8px', 'align-items': 'center', 'margin-top': '4px' },
    });
    rules.push({
      selector: sel('[data-submitting="true"]'),
      css: { opacity: '0.7', 'pointer-events': 'none' },
    });
    // login/signup centre in a card by default — they are a page, not a strip.
    if (kind === 'login' || kind === 'signup') {
      rules.push({
        selector: sel(''),
        css: { 'max-width': '380px', margin: '0 auto', padding: '24px' },
      });
    }
  }

  return rules;
}
