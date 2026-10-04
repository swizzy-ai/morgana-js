/**
 * Console test hooks.
 */

export function debugPart(): string[] {
  return [
    '// Console test hooks: inspect and drive state without clicking.',
    'window.__morgana_state=function(){return readState();};',
    'window.__morgana_set=function(path,value){return makeState().set(path,value);};',
    'window.__morgana_pages=function(){var els=document.querySelectorAll?document.querySelectorAll("[data-entity]"):[];var out=[];for(var i=0;i<els.length;i++){var n=els[i].getAttribute?els[i].getAttribute("data-entity"):null;if(n)out.push(n);}return out;};',
    '// Binding index: how many records are live, and the add/remove hooks the',
    '// repeat machinery uses to mount and unmount rows.',
    'window.__morgana_bindings=function(){return __bindRecs.length;};',
    'window.__morgana_index=function(el){return indexElement(el);};',
    'window.__morgana_forget=function(el){forgetElement(el);};',
    '// Event log inspection: every dispatch + action lifecycle entry.',
    'window.__morgana_log=function(){return __eventLog.slice();};',
    // Distinct from the transport's `window.__morgana_events`. These two
    // collided: the transport published an object and this then overwrote it
    // with a function, so `subscribe` silently became a call to a log reader and
    // every channel subscription died without an error. Both are named
    // `__morgana_*` for consistency with the hooks above, so the distinguishing
    // word has to carry the meaning: this one reads what has been seen.
    'window.__morgana_seenEvents=function(){var seen={};for(var i=0;i<__eventLog.length;i++){seen[__eventLog[i].name]=true;}return Object.keys(seen).sort();};',
  ];
}
