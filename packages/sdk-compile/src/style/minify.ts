/**
 * CSS minification.
 *
 * The stylesheet is generated, not authored, so it is already free of comments
 * and stray whitespace — but every rule still costs bytes over the wire and
 * again in KV. esbuild's CSS minifier is used rather than a hand-rolled pass
 * because it understands the parts that break naive regex minifiers:
 * `calc(100% - 2rem)`, `url(data:...)` containing spaces, `@media` nesting and
 * custom-property values.
 *
 * A minifier that fails must not fail the build: the stylesheet is already
 * valid, and shipping it unminified beats shipping nothing.
 */
import { transform } from 'esbuild'

export async function minifyCss(css: string): Promise<string> {
  if (!css.trim()) return css
  try {
    const result = await transform(css, { loader: 'css', minify: true })
    return result.code
  } catch (err) {
    console.warn(
      `[morgana] css minify failed, shipping the stylesheet unminified: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return css
  }
}
