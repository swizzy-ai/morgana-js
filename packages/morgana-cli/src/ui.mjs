/**
 * Terminal output.
 *
 * Colour is applied only when the stream is a TTY, `NO_COLOR` is unset, and
 * `FORCE_COLOR` is not `0`. That is the https://no-color.org convention plus the
 * escape hatch CI needs, and it matters more than usual here: `deploy` prints a
 * machine-readable `result  ok|FAILED` line that CI parses, so ANSI codes in it
 * would break the check that this pipeline exists to provide.
 *
 * Written by hand rather than pulled from chalk, for the same reason as the arg
 * parser: the CLI ships with no runtime dependencies, and that is the point of
 * the tree, and this is the entire surface chalk would have been used for.
 */

const FORCE = process.env.FORCE_COLOR;
const NO_COLOR = process.env.NO_COLOR;

export const colorEnabled = (() => {
  if (FORCE === '0') return false;
  if (NO_COLOR !== undefined && NO_COLOR !== '') return false;
  // CI logs are not a terminal, and neither is a piped result.
  if (process.env.CI !== undefined && process.env.CI !== '') return false;
  return Boolean(process.stdout.isTTY);
})();

const wrap = (open, close) => (s) => (colorEnabled ? `\u001b[${open}m${s}\u001b[${close}m` : String(s));

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);

export function say(line = '') {
  process.stdout.write(`${line}\n`);
}

export function warn(line) {
  process.stderr.write(`${line}\n`);
}

/**
 * A labelled row: `label   value`, with the label dimmed and padded.
 *
 * The padding is computed on the *plain* label so colour codes do not count
 * toward the column width — otherwise every coloured label would shift its own
 * value by the length of its escape sequence.
 */
export function row(label, value, width = 14) {
  const pad = label.length >= width ? `${label} ` : label.padEnd(width);
  return `  ${dim(pad)}${value}`;
}

export function ok(text) {
  return `${green('ok')}    ${text}`;
}

export function fail(text) {
  return `${red('FAIL')}  ${text}`;
}
