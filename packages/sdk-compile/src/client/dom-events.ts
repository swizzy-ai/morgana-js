/**
 * Generic DOM bridge: document listeners dispatching page events.
 */

export function clickPart(): string[] {
  return [
    'document.addEventListener("click", function(e){',
    '  var el = e.target && e.target.closest ? e.target.closest("[data-entity]") : null;',
    '  if(!el) return;',
    '  var name = el.getAttribute("data-entity");',
    '  dispatchPageEvent("clicked", name, el, e);',
    '});',
  ];
}
export function formPart(): string[] {
  return [
    'document.addEventListener("input", function(e){',
    '  var el = e.target && e.target.closest ? e.target.closest("[data-entity]") : null;',
    '  dispatchPageEvent("changed", el?el.getAttribute("data-entity"):"", el, e);',
    '});',
    'document.addEventListener("submit", function(e){',
    '  var el = e.target && e.target.closest ? e.target.closest("[data-entity]") : null;',
    '  dispatchPageEvent("submitted", el?el.getAttribute("data-entity"):"", el, e);',
    '});',
    'document.addEventListener("reset", function(e){',
    '  var el = e.target && e.target.closest ? e.target.closest("[data-entity]") : null;',
    '  dispatchPageEvent("reset", el?el.getAttribute("data-entity"):"", el, e);',
    '});',
  ];
}

/** Pointer + focus bridge: hover, focus, blur, dblclick per entity. */
export function pointerPart(): string[] {
  return [
    'document.addEventListener("mouseover", function(e){',
    '  var el = e.target && e.target.closest ? e.target.closest("[data-entity]") : null;',
    '  if(!el) return;',
    '  var rel = e.relatedTarget;',
    '  if(rel && rel.closest && el.contains && el.contains(rel)) return;',
    '  dispatchPageEvent("hover", el.getAttribute("data-entity"), el, e);',
    '});',
    'document.addEventListener("focusin", function(e){',
    '  var el = e.target && e.target.closest ? e.target.closest("[data-entity]") : null;',
    '  dispatchPageEvent("focus", el?el.getAttribute("data-entity"):"", el, e);',
    '});',
    'document.addEventListener("focusout", function(e){',
    '  var el = e.target && e.target.closest ? e.target.closest("[data-entity]") : null;',
    '  dispatchPageEvent("blur", el?el.getAttribute("data-entity"):"", el, e);',
    '});',
    'document.addEventListener("dblclick", function(e){',
    '  var el = e.target && e.target.closest ? e.target.closest("[data-entity]") : null;',
    '  dispatchPageEvent("dblclick", el?el.getAttribute("data-entity"):"", el, e);',
    '});',
  ];
}

/** Window/page bridge: scroll, resize, visibility. Falls back to document. */
export function windowPart(): string[] {
  return [
    'var __wl = (typeof window!=="undefined"&&window.addEventListener)?window:document;',
    'function __pageName(){var n="";try{n=document.body?document.body.getAttribute("data-page"):"";}catch(e){}return n||"";}',
    '__wl.addEventListener("scroll", function(e){ dispatchPageEvent("scroll", __pageName(), null, e); }, true);',
    '__wl.addEventListener("resize", function(e){ dispatchPageEvent("resize", __pageName(), null, {w:window.innerWidth,h:window.innerHeight}); });',
    'document.addEventListener("visibilitychange", function(e){ dispatchPageEvent("visibilitychange", __pageName(), null, {visible:document.visibilityState!=="hidden"}); });',
  ];
}
