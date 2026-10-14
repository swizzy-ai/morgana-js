/**
 * Eject selection + report — the contract between the CLI prompt and the emitters.
 *
 * Everything the user picks lands in EjectSelection. Everything the emitters
 * could not translate lands in EjectReport.fallbacks — deterministic, counted,
 * printed at the end. An empty fallback list is the goal; a non-empty one is
 * still shippable, because every entry names its file and line.
 */

export interface EjectSelection {
  /** Page names to eject. Defaults to all pages. */
  pages?: string[];
  /** Express listen port. Default 3001. */
  port?: number;
  /** API prefix for generated routes. Default '/api'. */
  apiPrefix?: string;
  /** SQLite file, relative to the ejected server dir. Default 'data/app.sqlite'. */
  dbPath?: string;
  /** Seed stores from the current dist data. Default true. */
  seed?: boolean;
  /** Auth strategy for the ejected backend. Sessions-in-sqlite is the default. */
  auth?: 'session-sqlite' | 'none';
  /** Run cron triggers in-process via node-cron. Default true. */
  cron?: boolean;
}

export interface EjectFallback {
  file: string;
  line: number;
  reason: string;
  source: string;
}

export interface EjectReport {
  outDir: string;
  files: string[];
  /** Pages, actions, stores, routes that were ejected. */
  ejected: { pages: string[]; actions: string[]; stores: string[]; routes: string[] };
  /** Everything that needs a human look. Empty is the goal. */
  fallbacks: EjectFallback[];
  warnings: string[];
}

export function createReport(outDir: string): EjectReport {
  return { outDir, files: [], ejected: { pages: [], actions: [], stores: [], routes: [] }, fallbacks: [], warnings: [] };
}

export function printReport(report: EjectReport): string {
  const lines = [
    `ejected ${report.ejected.pages.length} pages, ${report.ejected.actions.length} actions, ${report.ejected.stores.length} stores → ${report.outDir}`,
    `files: ${report.files.length}`,
  ];
  if (report.fallbacks.length) {
    lines.push(`manual adaptations needed (${report.fallbacks.length}):`);
    for (const f of report.fallbacks) lines.push(`  ${f.file}:${f.line} — ${f.reason}`);
  } else {
    lines.push('no manual adaptations — clean eject');
  }
  for (const w of report.warnings) lines.push(`warning: ${w}`);
  return lines.join('\n');
}
