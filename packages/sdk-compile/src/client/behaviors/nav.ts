/**
 * Navigation behaviors: breadcrumbs and links.
 *
 * A breadcrumb marks the deepest ancestor as the current page, and any
 * breadcrumb declared as a link navigates.
 */
export function navBehaviors(): string[] {
  return [
    '// Breadcrumbs: mark the last item current, and let crumb links navigate.',
    'document.addEventListener("DOMContentLoaded", function(){',
    '  var crumbs = document.querySelectorAll("[data-kind=\\"breadcrumbs\\"]");',
    '  for(var i=0;i<crumbs.length;i++){',
    '    var items = crumbs[i].querySelectorAll("[data-part=\\"crumb\\"]");',
    '    for(var j=0;j<items.length;j++){',
    '      var last = j===items.length-1;',
    '      if(last){ items[j].setAttribute("data-current","true"); var l=items[j].querySelector("a"); if(l) l.removeAttribute("href"); }',
    '      else { items[j].setAttribute("data-current","false"); }',
    '    }',
    '  }',
    '});',
  ];
}
