/**
 * First paint + page-load bindings.
 */

export function lifecyclePart(): string[] {
  return [
    '// First paint: index the bound elements (each subscribes to its own path),',
    '// give them their initial value, then fire page-load bindings.',
    'function fireLoaded(){var name="";try{name=document.body?document.body.getAttribute("data-page"):"";}catch(e){}dispatchPageEvent("loaded",name||"",null,{});}',
    'function firstPaint(){indexRoot();paintAllBindings();fireLoaded();}',
    'if(document.readyState==="complete"||document.readyState==="interactive"){setTimeout(firstPaint,0);}',
    'else{document.addEventListener("DOMContentLoaded",firstPaint);}',
  ];
}
