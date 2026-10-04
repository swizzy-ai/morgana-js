/**
 * Deep-part rules — media: image, video, audio, chart, list, badge, alert.
 */
import type { StyleCtx } from '../props';
import type { PartRule } from './shared';

export function mediaPartStyles(
  kind: string,
  id: string,
  rawProps: Record<string, unknown>,
  _ctx: StyleCtx,
): PartRule[] {
  const sel = (suffix: string): string => `[data-entity="${id}"]${suffix}`;
  const rules: PartRule[] = [];

  if (kind === 'image') {
    rules.push({
      selector: sel(' [data-part="frame"]'),
      css: { display: 'block', position: 'relative', overflow: 'hidden' },
    });
    rules.push({
      selector: sel(' [data-part="img"]'),
      css: {
        display: 'block',
        width: '100%',
        height: '100%',
        'object-fit': rawProps['fit'] === 'contain' ? 'contain' : rawProps['fit'] === 'fill' ? 'fill' : rawProps['fit'] === 'none' ? 'none' : 'cover',
      },
    });
    rules.push({
      selector: sel(' [data-part="fallback"]'),
      css: {
        position: 'absolute',
        inset: '0',
        display: 'none',
        'align-items': 'center',
        'justify-content': 'center',
        background: 'var(--muted)',
        color: 'var(--muted-foreground)',
        'font-size': '12px',
      },
    });
    rules.push({
      selector: sel(' [data-part="img"][data-failed="true"]'),
      css: { display: 'none' },
    });
    rules.push({
      selector: sel(' [data-part="img"][data-failed="true"] + [data-part="fallback"]'),
      css: { display: 'flex' },
    });
  }

  if (kind === 'video' || kind === 'audio') {
    rules.push({
      selector: sel(''),
      css: { display: 'block', 'max-width': '100%' },
    });
    rules.push({
      selector: sel(' [data-part="media"]'),
      css: { display: 'block', width: '100%' },
    });
    if (kind === 'video') {
      rules.push({
        selector: sel(' [data-part="poster"]'),
        css: { display: 'block', width: '100%', 'aspect-ratio': '16 / 9', 'object-fit': 'cover' },
      });
      rules.push({
        selector: sel('[data-variant="cinema"]'),
        css: { 'aspect-ratio': '21 / 9' },
      });
      rules.push({
        selector: sel('[data-variant="rounded"]'),
        css: { 'border-radius': '12px', overflow: 'hidden' },
      });
    } else {
      rules.push({
        selector: sel(' [data-part="media"]'),
        css: { width: '100%' },
      });
      rules.push({
        selector: sel('[data-variant="pill"]'),
        css: { 'border-radius': '9999px', overflow: 'hidden' },
      });
      rules.push({
        selector: sel('[data-variant="card"]'),
        css: {
          'border-radius': '12px',
          padding: '16px',
          background: 'var(--muted)',
        },
      });
    }
  }

  return rules;
}
