/**
 * HTML → JSX transform for the React eject.
 *
 * Structural fidelity comes free: the eject renders each object with the
 * framework's own renderNode, then converts the HTML to JSX. A hand-maintained
 * kind→JSX table would drift from the templates on every framework change;
 * this cannot drift, because it IS the templates' output.
 *
 * Rules are mechanical and total: class→className, for→htmlFor, void elements
 * self-closed, style strings→objects, comments→JSX comments, braces in text
 * escaped. Entities (&amp; &quot; …) pass through — JSX understands them.
 */

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', 'circle', 'path', 'rect',
]);

function styleToObject(style: string): string {
  const entries: string[] = [];
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const key = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!key || !val) continue;
    const jsKey = /^--[a-z0-9-]+$/i.test(key)
      ? `'${key}'`
      : key.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    entries.push(`${jsKey}: '${val.replace(/'/g, "\\'")}'`);
  }
  return `{{ ${entries.join(', ')} }}`;
}

function escapeTextBraces(text: string): string {
  return text.replace(/([{}])/g, "{'$1'}");
}

/** Convert one rendered HTML string to JSX. Never throws on valid input. */
export function htmlToJsx(html: string): string {
  let out = '';
  let i = 0;
  // text vs tag state machine — no regex soup, no HTML parser dependency.
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      out += escapeTextBraces(html.slice(i));
      break;
    }
    if (lt > i) out += escapeTextBraces(html.slice(i, lt));
    // Comment → JSX comment.
    if (html.startsWith('!--', lt + 1)) {
      const end = html.indexOf('-->', lt + 4);
      const body = end < 0 ? html.slice(lt + 4) : html.slice(lt + 4, end);
      out += `{/*${body}*/}`;
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const gt = html.indexOf('>', lt + 1);
    if (gt < 0) {
      out += escapeTextBraces(html.slice(lt));
      break;
    }
    const raw = html.slice(lt + 1, gt);
    // Closing tag passes through.
    if (raw.startsWith('/')) {
      out += `<${raw}>`;
      i = gt + 1;
      continue;
    }
    // Doctype / processing instructions pass through.
    if (raw.startsWith('!') || raw.startsWith('?')) {
      out += `<${raw}>`;
      i = gt + 1;
      continue;
    }
    const selfClose = raw.endsWith('/');
    const body = selfClose ? raw.slice(0, -1).trim() : raw;
    const space = body.search(/\s/);
    const tag = (space < 0 ? body : body.slice(0, space)).toLowerCase();
    let rest = space < 0 ? '' : body.slice(space + 1);
    // Rewrite attributes.
    rest = rest.replace(/\bclass=/g, 'className=');
    rest = rest.replace(/\bfor=/g, 'htmlFor=');
    rest = rest.replace(/\bonerror="([^"]*)"/g, (_m, js: string) => `onError={(e) => { ${js.replace(/\bthis\b/g, 'e.currentTarget')} }}`);
    rest = rest.replace(/\bonerror='([^']*)'/g, (_m, js: string) => `onError={(e) => { ${js.replace(/\bthis\b/g, 'e.currentTarget')} }}`);
    rest = rest.replace(/\bonload="([^"]*)"/g, (_m, js: string) => `onLoad={(e) => { ${js.replace(/\bthis\b/g, 'e.currentTarget')} }}`);
    rest = rest.replace(/\bstyle="([^"]*)"/g, (_m, s: string) => `style=${styleToObject(s)}`);
    rest = rest.replace(/\bstyle='([^']*)'/g, (_m, s: string) => `style=${styleToObject(s)}`);
    const needsClose = !selfClose && VOID.has(tag);
    out += `<${tag}${rest ? ` ${rest.trim()}` : ''}${needsClose ? ' /' : selfClose ? ' /' : ''}>`;
    i = gt + 1;
  }
  return out;
}
