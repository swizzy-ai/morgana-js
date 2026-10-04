/**
 * Argument parsing.
 *
 * Written rather than taken from a library: the CLI ships with no runtime
 * dependencies of its own, and its whole argument grammar is `--flag value`,
 * `--flag=value`, `--no-flag` and a positional. Commander would be ~200
 * transitive lines to replace that.
 *
 * Two behaviours the scripts relied on and this keeps:
 *
 *   - `--token` with nothing after it falls back rather than reading the *next*
 *     flag as its value. The old `process.argv[i + 1]` helper would happily
 *     return `'--url'` as the token, so a missing value silently became the
 *     next option.
 *   - an unknown `--flag` is an error, not a shrug. A typo in a deploy target
 *     should not look like it was accepted.
 */

/** Raised for a malformed invocation. Printed without a stack trace. */
export class UsageError extends Error {}

function isFlagish(token) {
  return token.startsWith('-') && token !== '-' && token !== '--'
}

export function parseArgs(argv, opts) {
  const { flags } = opts
  const values = {}
  const positionals = []
  const passthrough = []

  // `--` ends option parsing, so a project may pass `morgana build -- --watch`.
  let sawTerminator = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]

    if (sawTerminator) {
      passthrough.push(token);
      continue;
    }
    if (token === '--') {
      sawTerminator = true;
      continue;
    }

    if (!token.startsWith('-') || token === '-') {
      positionals.push(token);
      continue;
    }

    // Normalise `--no-x` into an explicit `x: false`.
    let negated = false;
    let body = token.startsWith('--') ? token.slice(2) : token.slice(1);

    if (!token.startsWith('--') && body.length === 1) {
      // A single-dash shorthand, e.g. `-p`.
      const spec = Object.entries(flags).find(([, s]) => s.short === body);
      if (!spec) throw new UsageError(`unknown option "-${body}"`);
      const [name, s] = spec;
      if (s.type === 'boolean') {
        values[name] = true;
      } else {
        const next = argv[i + 1];
        if (next === undefined || isFlagish(next)) {
          throw new UsageError(`option "-${body}" needs a value`);
        }
        values[name] = next;
        i++;
      }
      continue;
    }

    if (body.startsWith('no-')) {
      negated = true;
      body = body.slice(3);
    }

    // `--flag=value`
    let inlineValue;
    const eq = body.indexOf('=');
    if (eq >= 0) {
      inlineValue = body.slice(eq + 1);
      body = body.slice(0, eq);
    }

    const spec = flags[body];
    if (!spec) {
      throw new UsageError(
        `unknown option "--${negated ? 'no-' : ''}${body}"` +
          ` — run \`morgana --help\` for the options this command takes`,
      );
    }

    if (negated || spec.type === 'boolean') {
      if (inlineValue !== undefined) {
        throw new UsageError(`option "--${body}" does not take a value`);
      }
      values[body] = !negated;
      continue;
    }

    if (inlineValue !== undefined) {
      values[body] = inlineValue;
      continue;
    }

    // A string flag's value is the next token, but only if it is not another
    // option. Reading the next flag as a value is how `--token --url …` turned
    // the deploy token into the string "--url".
    const next = argv[i + 1];
    if (next === undefined || isFlagish(next)) {
      throw new UsageError(`option "--${body}" needs a value`);
    }
    values[body] = next;
    i++;
  }

  for (const name of opts.required ?? []) {
    if (values[name] === undefined) {
      const spec = flags[name];
      throw new UsageError(
        `missing required option "--${name}"` + (spec?.describe ? ` — ${spec.describe}` : ''),
      );
    }
  }

  return { positionals, values, passthrough };
}

/** A flag's value as a string, or `fallback` when absent. */
export function str(args, name, fallback = '') {
  const v = args.values[name];
  return typeof v === 'string' ? v : fallback;
}

/** A flag's value as a boolean. `--x` and `--no-x` both land here. */
export function bool(args, name, fallback = false) {
  const v = args.values[name];
  return typeof v === 'boolean' ? v : fallback;
}

/** The first positional, or `fallback`. */
export function positional(args, index = 0, fallback = '') {
  return args.positionals[index] ?? fallback;
}
