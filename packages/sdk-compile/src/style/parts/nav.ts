/**
 * Deep-part rules — navigation: breadcrumbs, avatar, separator, skeleton, slot.
 */
import type { StyleCtx } from '../props';
import type { PartRule } from './shared';

const AVATAR_SIZES: Record<string, string> = {
  xs: '20px',
  sm: '28px',
  md: '36px',
  lg: '48px',
  xl: '64px',
};

export function navPartStyles(
  kind: string,
  id: string,
  rawProps: Record<string, unknown>,
  _ctx: StyleCtx,
): PartRule[] {
  const sel = (suffix: string): string => `[data-entity="${id}"]${suffix}`;
  const rules: PartRule[] = [];

  // ── Breadcrumbs ────────────────────────────────────────────────────────
  if (kind === 'breadcrumbs') {
    rules.push({
      selector: sel(''),
      css: { display: 'flex', 'align-items': 'center', gap: '6px', 'font-size': '13px', 'flex-wrap': 'wrap' },
    });
    rules.push({
      selector: sel(' [data-part="crumb"]'),
      css: { display: 'inline-flex', 'align-items': 'center', gap: '6px', color: 'var(--muted-foreground)' },
    });
    rules.push({
      selector: sel(' [data-part="crumb"][data-current="true"]'),
      css: { color: 'var(--foreground)', 'font-weight': '500' },
    });
    rules.push({
      selector: sel(' [data-part="crumb"] a'),
      css: { color: 'inherit', 'text-decoration': 'none' },
    });
    rules.push({
      selector: sel(' [data-part="crumb"] a:hover'),
      css: { 'text-decoration': 'underline' },
    });
    rules.push({
      selector: sel(' [data-part="separator"]'),
      css: { color: 'var(--muted-foreground)', opacity: '0.6' },
    });
  }

  // ── Avatar ─────────────────────────────────────────────────────────────
  if (kind === 'avatar') {
    const size = typeof rawProps['size'] === 'string' ? rawProps['size'] : 'md';
    const px = AVATAR_SIZES[size] ?? AVATAR_SIZES['md']!;
    const radius = rawProps['shape'] === 'square' ? '4px' : rawProps['shape'] === 'rounded' ? '8px' : '9999px';
    rules.push({
      selector: sel(''),
      css: { display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', 'flex': 'none' },
    });
    rules.push({
      selector: sel(' [data-part="image"]'),
      css: { width: px, height: px, 'border-radius': radius, 'object-fit': 'cover', display: 'block' },
    });
    // Initials stand in when no image resolves — always rendered so the box
    // never collapses while a remote image loads or after it 404s.
    rules.push({
      selector: sel(' [data-part="initials"]'),
      css: {
        width: px,
        height: px,
        'border-radius': radius,
        background: 'var(--muted)',
        color: 'var(--muted-foreground)',
        display: 'inline-flex',
        'align-items': 'center',
        'justify-content': 'center',
        'font-size': `${Math.round(parseInt(px, 10) * 0.4)}px`,
        'font-weight': '600',
        'text-transform': 'uppercase',
        'user-select': 'none',
        overflow: 'hidden',
      },
    });
    rules.push({
      selector: sel(' [data-part="image"][data-loaded="true"] + [data-part="initials"]'),
      css: { display: 'none' },
    });
    rules.push({
      selector: sel(' [data-part="image"]:not([data-loaded="true"])'),
      css: { display: 'none' },
    });
    if (rawProps['ring'] === true) {
      rules.push({
        selector: sel(' [data-part="image"]'),
        css: { outline: '2px solid var(--card)', 'outline-offset': '1px' },
      });
    }
    if (rawProps['status']) {
      rules.push({
        selector: sel(' [data-part="status"]'),
        css: {
          position: 'absolute',
          right: '0',
          bottom: '0',
          width: `${Math.round(parseInt(px, 10) * 0.28)}px`,
          height: `${Math.round(parseInt(px, 10) * 0.28)}px`,
          'border-radius': '9999px',
          border: '2px solid var(--card)',
        },
      });
    }
  }

  // ── Separator ──────────────────────────────────────────────────────────
  if (kind === 'separator') {
    const orientation = rawProps['orientation'] === 'vertical' ? 'vertical' : 'horizontal';
    rules.push({
      selector: sel(''),
      css:
        orientation === 'vertical'
          ? { width: '1px', 'align-self': 'stretch', background: 'var(--border)', 'flex': 'none' }
          : { width: '100%', height: '1px', background: 'var(--border)', 'flex': 'none' },
    });
    rules.push({
      selector: sel('[data-variant="dashed"]'),
      css: {
        background: 'none',
        ...(orientation === 'vertical'
          ? { 'border-left': '1px dashed var(--border)' }
          : { 'border-top': '1px dashed var(--border)' }),
      },
    });
    rules.push({
      selector: sel('[data-variant="strong"]'),
      css: { background: 'var(--foreground)', opacity: '0.4' },
    });
  }

  // ── Skeleton ───────────────────────────────────────────────────────────
  if (kind === 'skeleton') {
    rules.push({
      selector: sel(''),
      css: {
        background: 'var(--muted)',
        'border-radius': typeof rawProps['radius'] === 'string' ? rawProps['radius'] : '6px',
        'min-height': typeof rawProps['height'] === 'string' || typeof rawProps['height'] === 'number' ? String(rawProps['height']) : '1em',
        animation: rawProps['animate'] === false ? 'none' : 'morgana-skeleton 1.4s ease-in-out infinite',
      },
    });
  }

  // ── Slot ───────────────────────────────────────────────────────────────
  if (kind === 'slot') {
    // A slot is a projection point: it holds whatever was placed into it, and
    // renders nothing (not even a box) while empty.
    rules.push({
      selector: sel(':empty'),
      css: { display: 'none' },
    });
    rules.push({
      selector: sel(''),
      css: { display: 'contents' },
    });
  }

  return rules;
}
