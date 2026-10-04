/**
 * Page document: head, libraries, body, init scripts.
 */
import { escAttr, escHtml } from './html';
import { renderNode } from './node';
import { buildManifest, manifestJson } from './manifest';
import type { ProjectIR } from '../ir';

export function renderPageHtml(ir: ProjectIR, pageName: string, opts: { title?: string } = {}): string {
  const page = ir.pages.get(pageName)
  if (!page) throw new Error(`unknown page "${pageName}"`)
  const body = page.rootIds.map((id) => renderNode(ir, id)).join('\n')
  const pageProps = (ir.objects.get(pageName)?.props ?? {}) as Record<string, unknown>
  const title = opts.title ?? (typeof pageProps['title'] === 'string' && pageProps['title'] !== '' ? pageProps['title'] : pageName)
  const stateJson = JSON.stringify({ ...(ir.stateDefaults as Record<string, unknown>) }).replace(/</g, '\\u003c')
  const libraryTags = [...ir.libraries.values()].map(
    (lib) =>
      // `defer` keeps a third-party icon CDN off the critical path: a blocking
      // <script> in <head> holds up first paint for the whole download. The
      // icon init below runs on DOMContentLoaded, which defer still precedes.
      `<script defer src="${escAttr(lib.cdnUrl)}" data-morgana-lib="${escAttr(lib.name)}" data-morgana-global="${escAttr(lib.globalVar)}"></script>`,
  )
  const iconInit =
    ir.libraries.size > 0
      ? `<script>document.addEventListener('DOMContentLoaded',function(){${[...ir.libraries.values()]
        .map((lib) => `try{var g=window[${JSON.stringify(lib.globalVar)}];if(g&&g.createIcons)g.createIcons();}catch(e){}`)
        .join('')}});</script>`
      : ''
  const headExtra: string[] = []
  const bodyTagAttrs: string[] = []
  if (typeof pageProps['meta'] === 'string' && pageProps['meta'] !== '') {
    headExtra.push(pageProps['meta'].includes('<') ? pageProps['meta'] : `<meta name="description" content="${escAttr(pageProps['meta'])}" />`)
  }
  if (typeof pageProps['favicon'] === 'string' && pageProps['favicon'] !== '') {
    headExtra.push(`<link rel="icon" href="${escAttr(pageProps['favicon'])}" />`)
  }
  if (typeof pageProps['headCSS'] === 'string' && pageProps['headCSS'] !== '') {
    headExtra.push(`<style>${pageProps['headCSS']}</style>`)
  }
  // headScript was declared on PageProps but never emitted, so a page could not
  // inject a script without losing it at render.
  if (typeof pageProps['headScript'] === 'string' && pageProps['headScript'] !== '') {
    headExtra.push(`<script>${pageProps['headScript']}</script>`)
  }
  // `tags` is the shared open-ended prop: applied as data attributes so a
  // project can carry analytics or state flags on the page element.
  const tagProps = pageProps['tags']
  if (tagProps && typeof tagProps === 'object' && !Array.isArray(tagProps)) {
    for (const [k, v] of Object.entries(tagProps as Record<string, unknown>)) {
      if (v === undefined || v === null) continue
      bodyTagAttrs.push(`data-tag-${escAttr(k)}="${escAttr(String(v))}"`)
    }
  }
  const bodyAttrs = [`data-page="${escAttr(pageName)}"`, `data-address="${escAttr(page.address)}"`]
  // `make('spa')` (or the spa prop family) marks this page as a client-routed
  // shell. Declaring it is what the page props promise; emitting the attribute
  // is what makes it real for the client router.
  if (pageProps['spa'] === true || pageProps['isSpa'] === true) {
    bodyAttrs.push('data-spa="true"')
    if (typeof pageProps['spaRoute'] === 'string' && pageProps['spaRoute'] !== '') {
      bodyAttrs.push(`data-spa-route="${escAttr(pageProps['spaRoute'])}"`)
    }
  }
  if (typeof pageProps['title'] === 'string' && pageProps['title'] !== '') {
    bodyAttrs.push(`data-title="${escAttr(pageProps['title'])}"`)
  }
  if (pageProps['viewport'] === 'fill' || pageProps['viewport'] === 'hug') {
    bodyAttrs.push(`data-viewport="${escAttr(String(pageProps['viewport']))}"`)
  }
  if (pageProps['theme'] === 'light' || pageProps['theme'] === 'dark') {
    bodyAttrs.push(`data-theme="${escAttr(String(pageProps['theme']))}"`)
  }
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    // Asset base, so a browser action can build a URL with ctx.assets.url().
    // The worker rewrites this to its env-scoped route at serve time.
    '<meta name="morgana-asset-base" content="/assets" />',
    `<title>${escHtml(title)}</title>`,
    '<link rel="stylesheet" href="/assets/style.css" />',
    ...libraryTags,
    ...headExtra,
    '</head>',
    `<body ${[...bodyAttrs, ...bodyTagAttrs].join(' ')}>`,
    body,
    `<script id="__MORGANA_STATE__" type="application/json">${stateJson}</script>`,
    `<script id="__MORGANA_OBJECTS__" type="application/json">${manifestJson(buildManifest(ir, pageName))}</script>`,
    '<script src="/assets/client.js"></script>',
    iconInit,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
