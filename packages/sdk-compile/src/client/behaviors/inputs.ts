/**
 * Input behaviors: switches, checkboxes, radios, alerts, badges.
 *
 * Split from the overlay handler so the dialog's early-returns cannot swallow
 * these, and vice versa.
 */
export function inputBehaviors(): string[] {
  return [
    'document.addEventListener("click", function(e){',
    '  var ax = e.target && e.target.closest ? e.target.closest("[data-kind=\\"alert\\"] [data-part=\\"dismiss\\"]") : null;',
    '  if(ax){ var al=ax.closest("[data-kind=\\"alert\\"]"); if(al){al.style.display="none";return;} }',
    '  var rm = e.target && e.target.closest ? e.target.closest("[data-part=\\"remove\\"]") : null;',
    '  if(rm){ var badge=rm.closest("[data-kind=\\"badge\\"]"); if(badge){badge.remove();return;} }',
    '  var track = e.target && e.target.closest ? e.target.closest("[data-part=\\"track\\"]") : null;',
    '  if(track){',
    '    var sw = track.closest("[data-kind=\\"switch\\"],[data-kind=\\"toggle\\"]");',
    '    if(sw && sw.getAttribute("data-disabled")!=="true" && !track.hasAttribute("data-disabled")){',
    '      var on = sw.getAttribute("data-checked")!=="true";',
    '      sw.setAttribute("data-checked", on?"true":"false");',
    '      track.setAttribute("aria-checked", on?"true":"false");',
    '      dispatchPageEvent("changed", sw.getAttribute("data-entity")||"", sw, {checked:on});',
    '    }',
    '  }',
    '});',
    'document.addEventListener("keydown", function(e){',
    '  if(e.key!==" "&&e.key!=="Enter")return;',
    '  var track = e.target && e.target.closest ? e.target.closest("[data-part=\\"track\\"][tabindex]") : null;',
    '  if(track){ e.preventDefault(); track.click(); }',
    '});',
    'document.addEventListener("change", function(e){',
    '  var el = e.target && e.target.closest ? e.target.closest("input[type=\\"checkbox\\"],input[type=\\"radio\\"]") : null;',
    '  if(el){ var host = el.closest("[data-entity]"); dispatchPageEvent("changed", host?host.getAttribute("data-entity"):"", el, {checked:!!el.checked,value:el.value}); }',
    '  // A select inside a form reports its value so FormHandle.getValue works.',
    '  var sel = e.target && e.target.closest ? e.target.closest("select") : null;',
    '  if(sel){ var fsel = sel.closest("[data-kind=\\"form\\"]"); dispatchPageEvent("changed", fsel?fsel.getAttribute("data-entity")||"":(sel.closest("[data-entity]")?sel.closest("[data-entity]").getAttribute("data-entity"):""), sel, { value: sel.value, name: sel.name||"" }); }',
    '});',
  ];
}
