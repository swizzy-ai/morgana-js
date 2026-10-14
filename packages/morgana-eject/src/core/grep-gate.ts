/**
 * Grep gate — the zero-trace guarantee, enforced mechanically.
 *
 * After emission, every ejected file is scanned for FRAMEWORK traces: package
 * names, bridge globals, kebab identifiers, member access, route markers. App
 * prose that happens to mention the framework ("Morgana Docs" in a title) is
 * the user's own copy, not a trace, and does not match — the patterns below
 * all require a code-shaped context (quotes, @, ., -, _).
 */
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN = [
  /__morgana/i,
  /@studiomorgana\//i,
  /from\s+['"]@studiomorgana['"]/i,
  /morgana-[a-z]/i,
  /\bMorgana\.[A-Za-z]/,
  /data-spa-route/i,
];

const ALLOWLIST: Array<{ file: RegExp; pattern: RegExp; reason: string }> = [];

export function grepGate(outDir: string): string[] {
  const violations: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(full);
        continue;
      }
      if (!/\.(tsx?|jsx?|css|html|json|md|sql)$/.test(entry.name)) continue;
      const rel = path.relative(outDir, full).split(path.sep).join('/');
      // package.json/lockfiles legitimately name ejected npm deps — the gate
      // is about framework traces in code, not dependency names.
      if (entry.name === 'package.json' || entry.name === 'package-lock.json') continue;
      const text = fs.readFileSync(full, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        for (const pattern of FORBIDDEN) {
          if (!pattern.test(line)) continue;
          const allowed = ALLOWLIST.some((a) => a.file.test(rel) && a.pattern.test(line));
          if (!allowed) violations.push(`${rel}:${i + 1} matches ${pattern}`);
        }
      });
    }
  };
  walk(outDir);
  return violations;
}
