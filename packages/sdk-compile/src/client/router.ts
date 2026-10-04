/**
 * Client-side SPA router: URL params, route matching, history integration.
 *
 * Pages marked with `isSpa: true` or `make('spa')` become client-routed shells.
 * The router:
 *  - Parses URL params from location.search and path segments
 *  - Matches current URL against declared page routes
 *  - Handles navigation via pushState instead of full page loads
 *  - Wires popstate for browser back/forward
 *
 * Unlike the static page nav (`/pages/{name}.html`), SPA pages share one
 * document and the router swaps content by dispatching route events the page
 * listens to.
 */

export interface RouteMatch {
  /** The matched page name */
  page: string
  /** Extracted path params (e.g., /user/:id → { id: '123' }) */
  params: Record<string, string>
  /** Query string params */
  query: Record<string, string>
  /** The original address pattern */
  address: string
}

export interface PageManifest {
  pages: Record<string, { address: string; isSpa?: boolean; spaRoute?: string }>
  page: string
  address: string
}

/**
 * Parse query string into key-value pairs.
 * Handles both ?key=value and search params encoding.
 */
export function parseQuery(search: string): Record<string, string> {
  const params: Record<string, string> = {}
  if (!search || search === '?') return params
  
  const searchStr = search.charAt(0) === '?' ? search.slice(1) : search
  if (!searchStr) return params
  
  const pairs = searchStr.split('&')
  for (const pair of pairs) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    if (eq < 0) {
      params[decodeURIComponent(pair)] = ''
    } else {
      const key = decodeURIComponent(pair.slice(0, eq))
      const val = decodeURIComponent(pair.slice(eq + 1))
      params[key] = val
    }
  }
  return params
}

/**
 * Match a URL path against a route pattern.
 * Supports:
 *  - Exact: /home
 *  - Params: /user/:id, /posts/:category/:slug
 *  - Optional: /docs/:section?
 *
 * Returns extracted params or null if no match.
 */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  // Normalize: strip trailing slashes for comparison
  const normPattern = pattern === '/' ? '/' : pattern.replace(/\/+$/, '')
  const normPath = path === '/' ? '/' : path.replace(/\/+$/, '')
  
  const patternParts = normPattern.split('/').filter(Boolean)
  const pathParts = normPath.split('/').filter(Boolean)
  
  // Different segment counts = no match (unless one is empty root)
  if (normPattern === '/' && normPath === '/') return {}
  if (patternParts.length !== pathParts.length) return null
  
  const params: Record<string, string> = {}
  
  for (let i = 0; i < patternParts.length; i++) {
    const patt = patternParts[i]
    const seg = pathParts[i]
    
    if (patt.charAt(0) === ':') {
      // Param segment
      const key = patt.slice(1)
      params[key] = decodeURIComponent(seg)
    } else if (patt !== seg) {
      // Literal mismatch
      return null
    }
  }
  
  return params
}

/**
 * Find which page matches the current URL.
 * Returns the page name, path params, and query params.
 */
export function resolveRoute(
  manifest: PageManifest,
  pathname: string,
  search: string
): RouteMatch | null {
  const query = parseQuery(search)
  
  // First check: exact page address match
  for (const [name, page] of Object.entries(manifest.pages)) {
    const addr = page.address ?? '/'
    const params = matchRoute(addr, pathname)
    if (params !== null) {
      return { page: name, params, query, address: addr }
    }
  }
  
  // Second check: spaRoute override (allows one page to handle multiple routes)
  for (const [name, page] of Object.entries(manifest.pages)) {
    if (page.isSpa && page.spaRoute) {
      const params = matchRoute(page.spaRoute, pathname)
      if (params !== null) {
        return { page: name, params, query, address: page.spaRoute }
      }
    }
  }
  
  return null
}

/**
 * Emitted bundle form: inlined into client.js as plain functions.
 * The runtime imports this module at compile time to generate the bundle text.
 */
export function routerPart(): string[] {
  return [
    '// ── SPA Router ──────────────────────────────────────────────────────────',
    'function parseQuery(search){',
    '  var params={};',
    '  if(!search||search==="?") return params;',
    '  var s=search.charAt(0)==="?"?search.slice(1):search;',
    '  if(!s) return params;',
    '  var pairs=s.split("&");',
    '  for(var i=0;i<pairs.length;i++){',
    '    var pair=pairs[i];',
    '    if(!pair) continue;',
    '    var eq=pair.indexOf("=");',
    '    if(eq<0){ params[decodeURIComponent(pair)]=""; }',
    '    else{',
    '      var k=decodeURIComponent(pair.slice(0,eq));',
    '      var v=decodeURIComponent(pair.slice(eq+1));',
    '      params[k]=v;',
    '    }',
    '  }',
    '  return params;',
    '}',
    'function matchRoute(pattern,path){',
    '  var normP=pattern==="/"?"/":pattern.replace(/\\/+$/,"");',
    '  var normPh=path==="/"?"/":path.replace(/\\/+$/,"");',
    '  var patternParts=normP.split("/").filter(function(p){return p;});',
    '  var pathParts=normPh.split("/").filter(function(p){return p;});',
    '  if(normP==="/"&&normPh==="/") return {};',
    '  if(patternParts.length!==pathParts.length) return null;',
    '  var params={};',
    '  for(var i=0;i<patternParts.length;i++){',
    '    var patt=patternParts[i];',
    '    var seg=pathParts[i];',
    '    if(patt.charAt(0)===":"){',
    '      var key=patt.slice(1);',
    '      params[key]=decodeURIComponent(seg);',
    '    }else if(patt!==seg){ return null; }',
    '  }',
    '  return params;',
    '}',
    'function resolveRoute(manifest,pathname,search){',
    '  var query=parseQuery(search);',
    '  var pages=manifest.pages||{};',
    '  for(var name in pages){',
    '    if(!pages.hasOwnProperty(name)) continue;',
    '    var pg=pages[name];',
    '    var addr=pg.address||"/";',
    '    var params=matchRoute(addr,pathname);',
    '    if(params!==null) return {page:name,params:params,query:query,address:addr};',
    '  }',
    '  for(var name in pages){',
    '    if(!pages.hasOwnProperty(name)) continue;',
    '    var pg=pages[name];',
    '    if(pg.isSpa&&pg.spaRoute){',
    '      var params=matchRoute(pg.spaRoute,pathname);',
    '      if(params!==null) return {page:name,params:params,query:query,address:pg.spaRoute};',
    '    }',
    '  }',
    '  return null;',
    '}',
    '// Current route state, reactive',
    'var __currentRoute=null;',
    'var __routeListeners=[];',
    'function getCurrentRoute(){',
    '  if(!__currentRoute&&typeof location!=="undefined"){',
    '    var m=typeof __manifest==="function"?__manifest():null;',
    '    if(m){',
    '      __currentRoute=resolveRoute(m,location.pathname,location.search);',
    '    }',
    '  }',
    '  return __currentRoute;',
    '}',
    'function notifyRouteChange(){',
    '  var route=getCurrentRoute();',
    '  for(var i=0;i<__routeListeners.length;i++){',
    '    try{ __routeListeners[i](route); }catch(e){ console.error("[Morgana] route listener failed:",e); }',
    '  }',
    '  dispatchPageEvent("route:changed",route?route.page:"",null,route);',
    '}',
    'function onRouteChange(fn){',
    '  __routeListeners.push(fn);',
    '  return function(){ var i=__routeListeners.indexOf(fn); if(i>=0) __routeListeners.splice(i,1); };',
    '}',
    '// Navigate within SPA (uses pushState, no page reload)',
    'function navigateSpa(url,opts){',
    '  if(typeof history==="undefined"||typeof location==="undefined") return;',
    '  opts=opts||{};',
    '  var targetUrl=String(url||"/");',
    '  // Allow both absolute paths and page names',
    '  var m=typeof __manifest==="function"?__manifest():null;',
    '  if(m&&m.pages&&m.pages[targetUrl]){',
    '    // It\'s a page name, resolve to address',
    '    targetUrl=m.pages[targetUrl].address||"/";',
    '  }',
    '  // Merge params if provided',
    '  if(opts.params&&typeof opts.params==="object"){',
    '    var qp=[];',
    '    for(var k in opts.params){',
    '      if(opts.params.hasOwnProperty(k)){',
    '        qp.push(encodeURIComponent(k)+"="+encodeURIComponent(opts.params[k]));',
    '      }',
    '    }',
    '    if(qp.length>0) targetUrl+=(targetUrl.indexOf("?")>=0?"&":"?")+qp.join("&");',
    '  }',
    '  if(targetUrl===location.pathname+location.search) return; // already there',
    '  history.pushState({transition:opts.transition||"instant"},""||"",targetUrl);',
    '  __currentRoute=null; // invalidate',
    '  notifyRouteChange();',
    '}',
    '// Wire browser back/forward',
    'function initRouter(){',
    '  if(typeof window==="undefined"||typeof location==="undefined") return;',
    '  // Initial route',
    '  __currentRoute=null;',
    '  getCurrentRoute();',
    '  // Listen for back/forward',
    '  if(typeof window.addEventListener==="function"){',
    '    window.addEventListener("popstate",function(){',
    '      __currentRoute=null;',
    '      notifyRouteChange();',
    '    });',
    '  }',
    '}',
    '// Export to window for testing/debugging',
    'if(typeof window!=="undefined"){',
    '  window.__morgana_router={',
    '    getCurrentRoute:getCurrentRoute,',
    '    navigate:navigateSpa,',
    '    onRouteChange:onRouteChange,',
    '  };',
    '}',
  ]
}
