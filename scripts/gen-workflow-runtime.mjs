// Regenerates packages/morgana-server/src/workflow-runtime.ts from the built
// @studiomorgana/wizard bundle.
//
// The action sandbox (QuickJS) cannot import modules, so the whole wizard
// runtime ships with every compiled action as one inlined string. This script
// turns the package's bundled ESM output (packages/wizard/dist/index.js, built
// by tsup) into that string:
//
//   1. Wrap the bundle body in an IIFE that returns a plain object of its
//      exports (`__wiz`). Embedding at module scope would make the asyncify
//      result-unwrap recurse on the bundle's top-level class/function bindings
//      ("Maximum call stack size exceeded"), so everything stays inside the
//      function.
//   2. Rewrite the bundle's trailing `export { local as name }` into the IIFE's
//      `return { name: local }`.
//   3. Emit the export names as `WORKFLOW_EXPORTS`, so the action wrapper can
//      destructure them into the inner IIFE's scope.
//
// Usage: node scripts/gen-workflow-runtime.mjs
//        (build the package first: pnpm --filter @studiomorgana/wizard build)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distPath = resolve(repoRoot, "packages/wizard/dist/index.js");
const outPath = resolve(repoRoot, "packages/morgana-server/src/workflow-runtime.ts");

const src = readFileSync(distPath, "utf8");

const exportMatch = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(src);
if (!exportMatch) {
  throw new Error(`No trailing export block in ${distPath} — build @studiomorgana/wizard first`);
}

const entries = exportMatch[1]
  .split(",")
  .map((spec) => spec.trim())
  .filter(Boolean)
  .map((spec) => {
    const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(spec);
    if (!m) throw new Error(`Unsupported export specifier: ${spec}`);
    return { exported: m[2] ?? m[1], local: m[1] };
  });

const body = src.slice(0, exportMatch.index).trimEnd();
const returned = entries.map((e) => `${e.exported}: ${e.local}`).join(", ");
const iife = `const __wiz = (function () {\n${body}\n\nreturn { ${returned} };\n})();`;

const exportsLiteral = JSON.stringify(entries.map((e) => e.exported));

const out = `// AUTO-GENERATED from packages/wizard/dist/index.js
// Regenerate with \`node scripts/gen-workflow-runtime.mjs\` (after building wizard).
// Inlined as a JSON string literal so the QuickJS sandbox can eval the whole
// wizard runtime in one module. The bundle is wrapped in an IIFE that returns
// \`__wiz\` (a plain object holding the exported bindings) — embedding at module
// scope would make the asyncify result-unwrap recurse on the bundle’s top-level
// class/function bindings (Maximum call stack size exceeded). The action
// wrapper appended after this constant uses \`__wiz.*\`.
export const WORKFLOW_RUNTIME = ${JSON.stringify(iife)};
// Names of the bundle’s exports, so the action wrapper can destructure them
// inside its inner IIFE and expose the runtime’s bare identifiers
// (\`createWorkflow\`, \`Signal\`, ...) to the deployed action code.
export const WORKFLOW_EXPORTS = ${exportsLiteral};
`;

writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${entries.length} exports, ${iife.length} bytes)`);
