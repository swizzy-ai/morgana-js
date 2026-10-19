/**
 * Binding table + page/state dispatch.
 *
 * Dispatch is a key lookup, never a scan. The compiler groups the validated
 * bindings by event and emits one dispatch function per event (origin/prop
 * guards unrolled inline), so the browser never loops through bindings to
 * find a match. Runtime subscribers are keyed the same way and composed into
 * a chain at subscribe time, so dispatch is exactly two lookups and two
 * calls. The only iterations left here run on cold paths: subscribe /
 * unsubscribe (chain rebuild), state commits (the state-only list, prefix
 * matching — no exact index exists for it), and the debug-only log reader.
 */

interface ClientBinding {
  event: string
  action: string
  origin?: string
  prop?: string
}

/** Per-action timing from `config.debounce` / `config.throttle`, in milliseconds. */
export type ActionTiming = Record<string, { debounce?: number; throttle?: number }>

/**
 * How an action fires. Without timing it runs on every event. With
 * `debounce`, it runs once events stop for that long (the last event wins).
 * With `throttle`, it runs at once, then at most once per window — and the
 * last event of a window still runs when the window ends, so the final
 * keystroke is never dropped.
 */
function firePart(timing: ActionTiming): string {
  const timed = Object.entries(timing).filter(([, t]) => (t.debounce ?? 0) > 0 || (t.throttle ?? 0) > 0)
  if (!timed.length) return 'function __morgana_fire(a,ev){window.__morgana_run(a,{},ev);}'
  const table = JSON.stringify(Object.fromEntries(timed.sort(([a], [b]) => a.localeCompare(b))))
  return [
    `var __morgana_timing=${table},__morgana_timers={};`,
    'function __morgana_fire(a,ev){',
    '  var t=__morgana_timing[a];',
    '  if(!t){window.__morgana_run(a,{},ev);return;}',
    '  var s=__morgana_timers[a]||(__morgana_timers[a]={});',
    '  if(t.debounce>0){clearTimeout(s.d);s.d=setTimeout(function(){window.__morgana_run(a,{},ev);},t.debounce);return;}',
    '  var now=Date.now();',
    '  if(!s.until||now>=s.until){s.until=now+t.throttle;window.__morgana_run(a,{},ev);return;}',
    '  s.ev=ev;',
    '  if(!s.p){s.p=setTimeout(function(){s.p=null;var e=s.ev;s.ev=null;s.until=Date.now()+t.throttle;window.__morgana_run(a,{},e);},s.until-now);}',
    '}',
  ].join('')
}

export function busPart(bindingsJson: string, timing: ActionTiming = {}): string[] {
  const bindings = JSON.parse(bindingsJson) as ClientBinding[]
  const isState = (b: ClientBinding): boolean => Boolean(b && b.event && b.event.indexOf('state:') === 0)
  const page = bindings.filter((b) => !isState(b))
  const state = bindings.filter(isState)
  // Insertion order is the compiler's sort order (event, origin, prop,
  // action), so emission is byte-stable for the same input.
  const byEvent = new Map<string, ClientBinding[]>()
  for (const b of page) {
    const list = byEvent.get(b.event)
    if (list) list.push(b)
    else byEvent.set(b.event, [b])
  }
  const esc = (s: string): string => JSON.stringify(s)
  const entries = [...byEvent.entries()]
    .map(([event, list]) => {
      const body = list
        .map((b) => {
          const conds: string[] = []
          if (b.origin) conds.push(`ev.origin===${esc(b.origin)}`)
          if (b.prop) conds.push(`ev.payload&&ev.payload.prop===${esc(b.prop)}`)
          const call = `__morgana_fire(${esc(b.action)},ev)`
          return conds.length ? `if(${conds.join('&&')}){${call};}` : `${call};`
        })
        .join('')
      return `[${esc(event)},function(ev){${body}}]`
    })
    .join(',')
  // Full binding records for tests and introspection — dispatch never reads
  // this, it reads __handlers.
  const defs = bindings
    .filter((b) => b && b.event)
    .map((b) => {
      const rec: Record<string, string> = { event: b.event, action: b.action }
      if (b.origin) rec.origin = b.origin
      if (b.prop) rec.prop = b.prop
      return rec
    })
  return [
    '// Page bindings, compiled to one dispatch function per event. Dispatch',
    '// is a key lookup — the runtime never scans bindings to find a match.',
    firePart(timing),
    `var __handlers=new Map([${entries}]);`,
    `var __stateHandlers = ${JSON.stringify(state)};`,
    `var __bindingDefs = ${JSON.stringify(defs)};`,
    ...objectSubscriptions(page),
    '// Runtime subscribers, keyed by event. Subscribing composes a call chain',
    '// (cold); dispatch invokes the chain once — no scan, no per-dispatch',
    '// allocation, no per-dispatch loop.',
    'var __subs=Object.create(null);',
    'function __safeSub(fn){return function(a,b,c,d){try{fn(a,b,c,d);}catch(e){console.error("[Morgana] page subscriber failed:",e);}};}',
    'function __compose(list){var f=__safeSub(list[0]);for(var i=1;i<list.length;i++){(function(p,n){f=function(a,b,c,d){p(a,b,c,d);n(a,b,c,d);};})(f,__safeSub(list[i]));}return f;}',
    'function onPageEvent(event,fn){',
    '  var k=String(event||"");',
    '  var e=__subs[k]||(__subs[k]={list:[],call:null});',
    '  e.list.push(fn);e.call=__compose(e.list);',
    '  return function(){var i=e.list.indexOf(fn);if(i>=0){e.list.splice(i,1);e.call=e.list.length?__compose(e.list):null;}};',
    '}',
    '// Event log: circular buffer. Writes are O(1) with no shift; ordering',
    '// happens in the debug-only reader below, never on the dispatch path.',
    'var __logBuf=new Array(200);var __logI=0;var __logN=0;',
    'function logEvent(entry){entry.ts=Date.now();__logBuf[__logI]=entry;__logI=(__logI+1)%200;if(__logN<200)__logN++;return entry;}',
    'function __logOrdered(){var out=[];for(var i=0;i<__logN;i++){out.push(__logBuf[(__logI-__logN+i+400)%200]);}return out;}',
    'function getEventLog(filter){',
    '  var log=__logOrdered();',
    '  if(!filter) return log;',
    '  if(typeof filter==="string") return log.filter(function(e){ return e.name===filter; });',
    '  if(filter.name) return log.filter(function(e){ return e.name===filter.name; });',
    '  if(filter.lane) return log.filter(function(e){ return e.lane===filter.lane; });',
    '  return log;',
    '}',
    '// Introspection shape is unchanged: one entry per distinct event (first',
    '// action wins) — the runtime `sources()` contract depends on it.',
    'function getEventSources(){',
    '  var seen={};var out=[];',
    '  for(var i=0;i<__bindingDefs.length;i++){var b=__bindingDefs[i];if(!b||!b.event)continue;if(seen[b.event])continue;seen[b.event]=1;out.push({name:b.event,action:b.action,lane:"page"});}',
    '  return out;',
    '}',
    '// State commits walk the state-only list. Prefix matching has no exact',
    '// index, but this list holds only state bindings and runs only on state',
    '// commits — never on the per-animation page path.',
    'function dispatchStateEvent(path,value,oldValue){',
    '  for(var i=0;i<__stateHandlers.length;i++){',
    '    var b=__stateHandlers[i];',
    '    var watched=b.event.slice(6);',
    '    if(!pathOverlaps(watched,path))continue;',
    '    logEvent({lane:"state",name:b.event,origin:"state",path:path});',
    '    window.__morgana_run(b.action,{}, {name:b.event,origin:"state",element:null,payload:{path:path,value:value,oldValue:oldValue},timestamp:Date.now()});',
    '  }',
    '}',
    '// True when anything listens for a page event — the key bridge only',
    '// takes over a keystroke someone asked for.',
    'function hasPageHandler(event){return __handlers.has(event)||!!(__subs[event]&&__subs[event].call);}',
    'function dispatchPageEvent(event, target, el, raw){',
    '  logEvent({lane:"page",name:event,origin:target||""});',
    '  var ev={name:event,origin:target||"",element:el||null,payload:raw||{},timestamp:Date.now()};',
    '  // Inside a list row: which row, and the record it shows.',
    '  var rowEl=el&&el.closest?el.closest("[data-row-key]"):null;',
    '  if(rowEl){var rl=rowEl.getAttribute("data-row-list"),rk=rowEl.getAttribute("data-row-key");ev.row={list:rl,key:rk,record:window.__morgana_rowRecord?window.__morgana_rowRecord(rl,rk):undefined};}',
    '  var h=__handlers.get(event);',
    '  if(h){try{h(ev);}catch(e){console.error("[Morgana] handler failed:",e);}}',
    '  var s=__subs[event];',
    '  if(s&&s.call){try{s.call(ev.origin,ev.element,ev.payload);}catch(e){console.error("[Morgana] page subscriber failed:",e);}}',
    '}',
    '// Prop mutation: a binding on `object.prop.changed`. Emitted by set(), so',
    '// it is a real change to the object rather than something tied to state —',
    '// `set("label", x)` fires it whether or not a bind() is watching.',
    'function dispatchPropChange(target, prop, value, oldValue, el){',
    '  dispatchPageEvent("prop:changed", target, el, { prop: prop, value: value, oldValue: oldValue });',
    '}',
  ];
}

/**
 * Client actions on `object:<type>/<name>.<event>`: one live subscription per
 * instance (shared with ctx.objects), dispatching matching frames onto the
 * page bus under the selector itself, so they reach the compiled handlers.
 * Parsed here, at build time, so the browser does no selector parsing.
 */
function objectSubscriptions(page: ClientBinding[]): string[] {
  const seen = new Set<string>()
  const subs: Array<{ full: string; type: string; name: string; event: string }> = []
  for (const b of page) {
    const m = /^object:([a-z][a-z0-9-]*)\/([^.\s]+)\.(.+)$/.exec(b.event)
    if (!m || seen.has(b.event)) continue
    seen.add(b.event)
    subs.push({ full: b.event, type: m[1]!, name: decodeURIComponent(m[2]!), event: m[3]! })
  }
  if (!subs.length) return []
  return [
    '// Object events for client actions — one subscription per instance.',
    `(function(subs){if(!window.__morgana_objectEvents)return;var by={};subs.forEach(function(s){var k=s.type+"/"+s.name;(by[k]=by[k]||[]).push(s);});Object.keys(by).forEach(function(k){var list=by[k];window.__morgana_objectEvents(list[0].type,list[0].name,function(e,d){for(var i=0;i<list.length;i++){var s=list[i];if(s.event===e)dispatchPageEvent(s.full,s.name,null,{type:s.type,name:s.name,event:e,data:d});}});});})(${JSON.stringify(subs)});`,
  ]
}
