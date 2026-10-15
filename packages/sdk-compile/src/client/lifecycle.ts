/**
 * First paint + page-load bindings.
 */

export function lifecyclePart(): string[] {
  return [
    '// First paint: index the bound elements (each subscribes to its own path),',
    '// give them their initial value, then fire page-load bindings.',
    'function fireLoaded(){var name="";try{name=document.body?document.body.getAttribute("data-page"):"";}catch(e){}dispatchPageEvent("loaded",name||"",null,{});}',
    '// The live layer first: restored state, reflected keys and list templates',
    '// are in place before bindings take their first value.',
    'function bootLive(){var rt=window.__morgana_runtime;if(!rt||typeof rt.bootLive!=="function")return;try{rt.bootLive({readState:readState,commitMany:commitMany,subscribePath:subscribePath,dispatchPageEvent:dispatchPageEvent,hasPageHandler:hasPageHandler});}catch(e){console.error("[Morgana] live page failed to start:",e);}}',
    'function firstPaint(){bootLive();indexRoot();paintAllBindings();fireLoaded();}',
    'if(document.readyState==="complete"||document.readyState==="interactive"){setTimeout(firstPaint,0);}',
    'else{document.addEventListener("DOMContentLoaded",firstPaint);}',
  ];
}
