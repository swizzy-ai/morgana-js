/**
 * Server render — the request-time half of `render: 'server'` pages.
 *
 * The compile lane runs the page function once at build time and emits
 * `server/pages/<name>.json`. This module runs the OTHER execution: per
 * request, on the server. Same recorder (`buildUi`), same renderer
 * (`renderPageHtml`) — only the moment differs.
 *
 * Flow per request:
 *   1. host loads the page graph (cached parsed JSON is fine — hydrate
 *      deep-clones, so concurrent requests never share mutable state),
 *   2. host builds the action ctx with `ui` from `createServerUi`,
 *   3. the action fetches data, `ctx.ui.get(id).setProps(...)`, and returns
 *      `ctx.ui.pages.render(name)`,
 *   4. the host sees the branded page result and sends it as text/html.
 *
 * `actions.run` inside a server render is memoized per request: two reads of
 * the same action+args during one render fetch once. The memo dies with the
 * request — cross-request caching is a separate, explicitly-keyed feature.
 */
import { hydratePageGraph, type PageGraphJson } from './render/page-graph'
import { renderPageHtml } from './render/page'
import { buildUi } from './compile-ctx/registries'
import type { CompileState } from './compile-ctx/handles'

export interface ServerRenderDeps {
  runAction: (name: string, params?: unknown) => Promise<unknown>
}

export interface ServerRenderCtx {
  ui: Record<string, unknown>
  /** Render the (possibly mutated) page to HTML. */
  renderPage: (name?: string) => { __morganaPage: true; html: string }
}

/**
 * A branded page result. The host checks `isPageResult` to decide between
 * the `{ success, data }` JSON envelope and a text/html response. Branded so
 * a plain `{ html }` data object can never be mistaken for a page.
 */
export function pageResult(html: string): { __morganaPage: true; html: string } {
  return { __morganaPage: true, html }
}

export function isPageResult(v: unknown): v is { __morganaPage: true; html: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>)['__morganaPage'] === true &&
    typeof (v as Record<string, unknown>)['html'] === 'string'
  )
}

export function createServerUi(graph: PageGraphJson, deps: ServerRenderDeps): ServerRenderCtx {
  const ir = hydratePageGraph(graph)
  const state = {
    ir,
    config: {},
    actionName: `ssr:${graph.page.name}`,
    customObjects: new Map(),
  } as unknown as CompileState
  const ui = buildUi(state)
  const memo = new Map<string, Promise<unknown>>()
  const renderPage = (name?: string): { __morganaPage: true; html: string } => {
    const target = name ?? graph.page.name
    return pageResult(renderPageHtml(ir, target))
  }
  ;(ui['pages'] as Record<string, unknown>)['render'] = renderPage
  // Flat alias for the cloud sandbox: the guest rebuilds `ui` from what the
  // WASM bridge delivered, and one extra level of nesting is what gets
  // dropped crossing it (see buildActionModule). `pages.render` stays the
  // documented path; this is how it survives the trip.
  ;(ui as Record<string, unknown>)['renderPage'] = renderPage
  const withActions = {
    ...ui,
    actions: {
      run: (name: string, params?: unknown): Promise<unknown> => {
        const key = `${name}:${JSON.stringify(params ?? null)}`
        let hit = memo.get(key)
        if (!hit) {
          hit = deps.runAction(name, params)
          memo.set(key, hit)
        }
        return hit
      },
    },
  }
  return { ui: withActions, renderPage }
}
