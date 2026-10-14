/**
 * Behaviours for datePicker, radioGroup, pagination, collapsible, carousel,
 * colorPicker, contextMenu and commandPalette.
 *
 * Every state change goes through one painter per kind, exposed as
 * `window.__mg3`, so a user interaction and a handle method (handles/wave3.ts)
 * paint identically and emit the same event. Plain ES5: this text is inlined
 * into client.js as-is.
 */
const SOURCE = String.raw`
// ── wave 3 components ────────────────────────────────────────────────────
(function(){
  if (typeof document === "undefined") return;
  function ent(el){ return el ? (el.getAttribute("data-entity") || "") : ""; }
  function emit(el, name, payload){ dispatchPageEvent(name, ent(el), el, payload || {}); }
  function kindOf(t, kind){ return t && t.closest ? t.closest('[data-kind="' + kind + '"]') : null; }
  function part(el, name){ return el.querySelector('[data-part="' + name + '"]'); }
  function parts(el, name){ return el.querySelectorAll('[data-part="' + name + '"]'); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }

  // ── datePicker ──
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  function pad2(n){ return (n < 10 ? "0" : "") + n; }
  function fmt(y, m, d){ return y + "-" + pad2(m + 1) + "-" + pad2(d); }
  function parseDate(s){
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if(!m) return null;
    var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if(dt.getFullYear() !== Number(m[1]) || dt.getMonth() !== Number(m[2]) - 1 || dt.getDate() !== Number(m[3])) return null;
    return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
  }
  function todayStr(){ var t = new Date(); return fmt(t.getFullYear(), t.getMonth(), t.getDate()); }
  function dpRender(el){
    var cal = part(el, "calendar"); if(!cal) return;
    var view = el.__mgView; var value = el.getAttribute("data-value") || "";
    var min = el.getAttribute("data-min") || "", max = el.getAttribute("data-max") || "";
    var start = el.getAttribute("data-week-start") === "1" ? 1 : 0;
    var first = new Date(view.y, view.m, 1);
    var lead = (first.getDay() - start + 7) % 7;
    var html = '<div data-part="cal-head"><button type="button" data-part="cal-nav" data-dir="-1" aria-label="Previous month">‹</button>'
      + '<span data-part="cal-label">' + MONTHS[view.m] + " " + view.y + '</span>'
      + '<button type="button" data-part="cal-nav" data-dir="1" aria-label="Next month">›</button></div><div data-part="cal-grid" role="grid">';
    for(var w = 0; w < 7; w++) html += '<span data-part="weekday">' + DAYS[(w + start) % 7] + '</span>';
    var today = todayStr();
    for(var i = 0; i < 42; i++){
      var dt = new Date(view.y, view.m, 1 - lead + i);
      var ds = fmt(dt.getFullYear(), dt.getMonth(), dt.getDate());
      var off = (min && ds < min) || (max && ds > max);
      html += '<button type="button" data-part="day" data-date="' + ds + '"'
        + (dt.getMonth() !== view.m ? ' data-outside="true"' : '')
        + (ds === value ? ' data-selected="true" aria-selected="true"' : '')
        + (ds === today ? ' data-today="true"' : '')
        + (off ? ' disabled' : '') + '>' + dt.getDate() + '</button>';
    }
    cal.innerHTML = html + '</div>';
  }
  function dpOpen(el){
    if(el.getAttribute("data-disabled") === "true" || el.getAttribute("data-open") === "true") return;
    var v = parseDate(el.getAttribute("data-value")) || parseDate(todayStr());
    el.__mgView = { y: v.y, m: v.m };
    dpRender(el);
    part(el, "calendar").removeAttribute("hidden");
    el.setAttribute("data-open", "true");
    emit(el, "opened");
  }
  function dpClose(el){
    if(el.getAttribute("data-open") !== "true") return;
    part(el, "calendar").setAttribute("hidden", "");
    el.setAttribute("data-open", "false");
    emit(el, "closed");
  }
  function dpSet(el, v, notify){
    var s = parseDate(v) ? String(v) : "";
    el.setAttribute("data-value", s);
    var f = part(el, "field"); if(f) f.value = s;
    if(el.getAttribute("data-open") === "true") dpRender(el);
    if(notify !== false) emit(el, "changed", { value: s });
    return s;
  }

  // ── radioGroup ──
  function rgSet(el, v, notify){
    var s = v === null || v === undefined ? "" : String(v);
    var radios = parts(el, "radio"), hit = false;
    for(var i = 0; i < radios.length; i++){ var on = radios[i].value === s; radios[i].checked = on; if(on) hit = true; }
    if(!hit) s = "";
    el.setAttribute("data-value", s);
    if(notify !== false) emit(el, "changed", { value: s });
    return s;
  }
  function rgOptions(el, options){
    var name = (el.querySelector('[data-part="radio"]') || {}).name || ("rg-" + ent(el));
    var cur = el.getAttribute("data-value") || "", html = "";
    for(var i = 0; i < (options || []).length; i++){
      var o = options[i] || {}; var v = String(o.value !== undefined ? o.value : o.label);
      var off = el.getAttribute("data-disabled") === "true" || o.disabled === true;
      html += '<label data-part="option" data-value="' + esc(v) + '"' + (off ? ' data-disabled="true"' : '') + '>'
        + '<input type="radio" data-part="radio" name="' + esc(name) + '" value="' + esc(v) + '"' + (v === cur ? ' checked' : '') + (off ? ' disabled' : '') + ' />'
        + '<span data-part="option-text"><span data-part="option-label">' + esc(o.label !== undefined ? o.label : v) + '</span>'
        + (o.description ? '<span data-part="option-description">' + esc(o.description) + '</span>' : '') + '</span></label>';
    }
    el.innerHTML = html;
    rgSet(el, cur, false);
  }

  // ── pagination ──
  function pageItems(page, pages, sib){
    if(pages <= 1) return [1];
    var out = [1], lo = Math.max(2, page - sib), hi = Math.min(pages - 1, page + sib);
    if(lo > 2) out.push("gap");
    for(var i = lo; i <= hi; i++) out.push(i);
    if(hi < pages - 1) out.push("gap");
    out.push(pages);
    return out;
  }
  function pgPaint(el, page, pages, notify){
    pages = Math.max(1, Math.floor(Number(pages !== undefined ? pages : el.getAttribute("data-pages")) || 1));
    page = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)));
    var before = Number(el.getAttribute("data-page") || 1);
    el.setAttribute("data-page", String(page)); el.setAttribute("data-pages", String(pages));
    var sib = Number(el.getAttribute("data-siblings") || 1), items = pageItems(page, pages, sib), html = "";
    for(var i = 0; i < items.length; i++){
      html += items[i] === "gap" ? '<span data-part="gap">…</span>'
        : '<button type="button" data-part="page" data-page="' + items[i] + '"' + (items[i] === page ? ' data-current="true" aria-current="page"' : '') + '>' + items[i] + '</button>';
    }
    part(el, "pages").innerHTML = html;
    part(el, "prev").disabled = page <= 1;
    part(el, "next").disabled = page >= pages;
    if(notify !== false && page !== before) emit(el, "changed", { page: page });
    return page;
  }

  // ── collapsible ──
  function clSet(el, open, notify){
    if(el.getAttribute("data-disabled") === "true" && notify !== false) return el.getAttribute("data-open") === "true";
    var was = el.getAttribute("data-open") === "true";
    el.setAttribute("data-open", open ? "true" : "false");
    var p = part(el, "panel"); if(p){ if(open) p.removeAttribute("hidden"); else p.setAttribute("hidden", ""); }
    var t = part(el, "trigger"); if(t) t.setAttribute("aria-expanded", open ? "true" : "false");
    if(notify !== false && was !== open) emit(el, open ? "opened" : "closed");
    return open;
  }

  // ── carousel ──
  function crGo(el, index, notify){
    var count = Number(el.getAttribute("data-count") || 0); if(!count) return 0;
    var loop = el.getAttribute("data-loop") !== "false", i = Math.floor(Number(index) || 0);
    if(loop) i = ((i % count) + count) % count; else i = Math.max(0, Math.min(count - 1, i));
    var before = Number(el.getAttribute("data-index") || 0);
    el.setAttribute("data-index", String(i));
    var track = part(el, "track"); if(track) track.style.transform = "translateX(-" + (i * 100) + "%)";
    var slides = parts(el, "slide");
    for(var s = 0; s < slides.length; s++){
      if(s === i){ slides[s].setAttribute("data-active", "true"); slides[s].removeAttribute("aria-hidden"); }
      else { slides[s].removeAttribute("data-active"); slides[s].setAttribute("aria-hidden", "true"); }
    }
    var dots = parts(el, "dot");
    for(var d = 0; d < dots.length; d++){ if(d === i) dots[d].setAttribute("data-active", "true"); else dots[d].removeAttribute("data-active"); }
    if(notify !== false && i !== before) emit(el, "changed", { index: i });
    return i;
  }

  // ── colorPicker ──
  function hex(v){
    var s = String(v || "").trim().toLowerCase();
    if(/^#[0-9a-f]{6}$/.test(s)) return s;
    var m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s); if(m) return "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    m = /^([0-9a-f]{6})$/.exec(s); return m ? "#" + m[1] : "";
  }
  function cpSet(el, v, notify){
    var s = hex(v); if(!s) return el.getAttribute("data-value") || "";
    var before = el.getAttribute("data-value");
    el.setAttribute("data-value", s);
    var n = part(el, "native"); if(n) n.value = s;
    var h = part(el, "hex"); if(h && h !== document.activeElement) h.value = s;
    var sw = parts(el, "swatch");
    for(var i = 0; i < sw.length; i++){ if(sw[i].getAttribute("data-value") === s) sw[i].setAttribute("data-active", "true"); else sw[i].removeAttribute("data-active"); }
    if(notify !== false && s !== before) emit(el, "changed", { value: s });
    return s;
  }

  // ── contextMenu ──
  var openCtx = null;
  function cmOpen(el, x, y){
    var menu = part(el, "menu"); if(!menu) return;
    if(openCtx && openCtx !== el) cmClose(openCtx);
    menu.removeAttribute("hidden");
    var w = menu.offsetWidth, h = menu.offsetHeight;
    var vx = Math.max(4, Math.min(Number(x) || 0, window.innerWidth - w - 4));
    var vy = Math.max(4, Math.min(Number(y) || 0, window.innerHeight - h - 4));
    menu.style.left = vx + "px"; menu.style.top = vy + "px";
    el.setAttribute("data-open", "true"); openCtx = el;
    var first = menu.querySelector('[data-part="item"]:not(:disabled)'); if(first) first.focus();
    emit(el, "opened", { x: vx, y: vy });
  }
  function cmClose(el){
    if(!el || el.getAttribute("data-open") !== "true") return;
    part(el, "menu").setAttribute("hidden", "");
    el.setAttribute("data-open", "false");
    if(openCtx === el) openCtx = null;
    emit(el, "closed");
  }
  function menuItemsHtml(items, partName){
    var html = "", group = null;
    for(var i = 0; i < (items || []).length; i++){
      var it = items[i] || {};
      if(it.separator === true){ html += '<div data-part="separator" role="separator"></div>'; continue; }
      if(it.group !== undefined && String(it.group) !== group){ group = String(it.group); html += '<div data-part="group-label">' + esc(group) + '</div>'; }
      var v = String(it.value !== undefined ? it.value : it.label), label = String(it.label !== undefined ? it.label : v);
      html += '<button type="button" data-part="' + partName + '" role="menuitem" data-value="' + esc(v) + '" data-label="' + esc(label) + '"' + (it.disabled === true ? ' disabled' : '') + '>'
        + '<span data-part="item-label">' + esc(label) + '</span>' + (it.shortcut ? '<kbd data-part="shortcut">' + esc(it.shortcut) + '</kbd>' : '') + '</button>';
    }
    return html;
  }

  // ── commandPalette ──
  function cpaVisible(el){ return Array.prototype.filter.call(parts(el, "command"), function(c){ return !c.hidden && !c.disabled; }); }
  function cpaActive(el, cmd){
    var all = parts(el, "command");
    for(var i = 0; i < all.length; i++){ if(all[i] === cmd) all[i].setAttribute("data-active", "true"); else all[i].removeAttribute("data-active"); }
    if(cmd && cmd.scrollIntoView) cmd.scrollIntoView({ block: "nearest" });
  }
  function cpaFilter(el){
    var q = (part(el, "search").value || "").trim().toLowerCase(), all = parts(el, "command"), shown = 0;
    for(var i = 0; i < all.length; i++){
      var hit = !q || (all[i].getAttribute("data-label") || "").toLowerCase().indexOf(q) >= 0 || (all[i].getAttribute("data-value") || "").toLowerCase().indexOf(q) >= 0;
      if(hit){ all[i].removeAttribute("hidden"); shown++; } else all[i].setAttribute("hidden", "");
    }
    var labels = parts(el, "group-label");
    for(var g = 0; g < labels.length; g++){ if(q) labels[g].setAttribute("hidden", ""); else labels[g].removeAttribute("hidden"); }
    var empty = part(el, "empty"); if(empty){ if(shown) empty.setAttribute("hidden", ""); else empty.removeAttribute("hidden"); }
    cpaActive(el, cpaVisible(el)[0] || null);
  }
  function cpaOpen(el){
    if(el.getAttribute("data-open") === "true") return;
    el.removeAttribute("hidden"); el.setAttribute("data-open", "true");
    el.__mgReturn = document.activeElement;
    var s = part(el, "search"); s.value = ""; cpaFilter(el); s.focus();
    emit(el, "opened");
  }
  function cpaClose(el){
    if(el.getAttribute("data-open") !== "true") return;
    el.setAttribute("hidden", ""); el.setAttribute("data-open", "false");
    if(el.__mgReturn && el.__mgReturn.focus) try{ el.__mgReturn.focus(); }catch(e){}
    emit(el, "closed");
  }
  function cpaPick(el, cmd){
    if(!cmd || cmd.disabled) return;
    var v = cmd.getAttribute("data-value") || "";
    cpaClose(el);
    emit(el, "selected", { value: v, label: cmd.getAttribute("data-label") || "" });
  }

  window.__mg3 = {
    dpOpen: dpOpen, dpClose: dpClose, dpSet: dpSet,
    rgSet: rgSet, rgOptions: rgOptions,
    pgPaint: pgPaint,
    clSet: clSet,
    crGo: crGo,
    cpSet: cpSet,
    cmOpen: cmOpen, cmClose: cmClose, cmItems: function(el, items){ part(el, "menu").innerHTML = menuItemsHtml(items, "item"); },
    cpaOpen: cpaOpen, cpaClose: cpaClose, cpaItems: function(el, items){ part(el, "list").innerHTML = menuItemsHtml(items, "command"); if(el.getAttribute("data-open") === "true") cpaFilter(el); }
  };

  // ── delegation ──
  document.addEventListener("click", function(e){
    var t = e.target;
    var dp = kindOf(t, "datePicker");
    if(dp){
      var day = t.closest('[data-part="day"]');
      if(day && !day.disabled){ dpSet(dp, day.getAttribute("data-date")); dpClose(dp); return; }
      var nav = t.closest('[data-part="cal-nav"]');
      if(nav){ var dir = Number(nav.getAttribute("data-dir")); var nv = new Date(dp.__mgView.y, dp.__mgView.m + dir, 1); dp.__mgView = { y: nv.getFullYear(), m: nv.getMonth() }; dpRender(dp); return; }
      if(t.closest('[data-part="field"]') || t.closest('[data-part="trigger"]')){ if(dp.getAttribute("data-open") === "true") dpClose(dp); else dpOpen(dp); return; }
    }
    var openDps = document.querySelectorAll('[data-kind="datePicker"][data-open="true"]');
    for(var i = 0; i < openDps.length; i++) if(openDps[i] !== dp) dpClose(openDps[i]);

    var pg = kindOf(t, "pagination");
    if(pg){
      var b = t.closest("button"); if(b && !b.disabled){
        var cur = Number(pg.getAttribute("data-page") || 1);
        if(b.getAttribute("data-part") === "prev") pgPaint(pg, cur - 1);
        else if(b.getAttribute("data-part") === "next") pgPaint(pg, cur + 1);
        else if(b.getAttribute("data-part") === "page") pgPaint(pg, Number(b.getAttribute("data-page")));
      }
      return;
    }
    var cl = kindOf(t, "collapsible");
    if(cl && t.closest('[data-part="trigger"]') && kindOf(t.closest('[data-part="trigger"]'), "collapsible") === cl){
      clSet(cl, cl.getAttribute("data-open") !== "true"); return;
    }
    var cr = kindOf(t, "carousel");
    if(cr){
      var crb = t.closest('[data-part="prev"],[data-part="next"],[data-part="dot"]');
      if(crb && kindOf(crb, "carousel") === cr){
        var ci = Number(cr.getAttribute("data-index") || 0), cp = crb.getAttribute("data-part");
        crGo(cr, cp === "prev" ? ci - 1 : cp === "next" ? ci + 1 : Number(crb.getAttribute("data-slide")));
        return;
      }
    }
    var cpk = kindOf(t, "colorPicker");
    if(cpk){ var sw = t.closest('[data-part="swatch"]'); if(sw && !sw.disabled){ cpSet(cpk, sw.getAttribute("data-value")); return; } }

    var cm = kindOf(t, "contextMenu");
    var cmItem = t.closest('[data-part="item"]');
    if(cm && cmItem && !cmItem.disabled){ var cv = cmItem.getAttribute("data-value") || ""; cmClose(cm); emit(cm, "selected", { value: cv }); return; }
    if(openCtx && !(cm === openCtx && t.closest('[data-part="menu"]'))) cmClose(openCtx);

    var pal = kindOf(t, "commandPalette");
    if(pal){
      var cmd = t.closest('[data-part="command"]'); if(cmd){ cpaPick(pal, cmd); return; }
      if(t.closest('[data-part="overlay"]')){ cpaClose(pal); return; }
    }
  });

  document.addEventListener("change", function(e){
    var t = e.target;
    var rg = kindOf(t, "radioGroup");
    if(rg && t.getAttribute("data-part") === "radio"){ rgSet(rg, t.value); return; }
    var cpk = kindOf(t, "colorPicker");
    if(cpk && t.getAttribute("data-part") === "native"){ cpSet(cpk, t.value); return; }
    if(cpk && t.getAttribute("data-part") === "hex"){ var ok = cpSet(cpk, t.value); t.value = ok; return; }
  });
  document.addEventListener("input", function(e){
    var t = e.target;
    var cpk = kindOf(t, "colorPicker");
    // Live preview while dragging the native picker; "changed" fires on commit.
    if(cpk && t.getAttribute("data-part") === "native"){ var h = part(cpk, "hex"); if(h) h.value = t.value; }
    var pal = kindOf(t, "commandPalette");
    if(pal && t.getAttribute("data-part") === "search") cpaFilter(pal);
  });

  document.addEventListener("contextmenu", function(e){
    var area = e.target && e.target.closest ? e.target.closest('[data-part="area"]') : null;
    var cm = area ? kindOf(area, "contextMenu") : null;
    if(!cm || cm.getAttribute("data-disabled") === "true") return;
    e.preventDefault();
    cmOpen(cm, e.clientX, e.clientY);
  });

  function isMod(e){ return e.ctrlKey || e.metaKey; }
  document.addEventListener("keydown", function(e){
    // Escape closes the innermost open surface of these kinds.
    if(e.key === "Escape"){
      var openPal = document.querySelector('[data-kind="commandPalette"][data-open="true"]');
      if(openPal){ cpaClose(openPal); e.preventDefault(); return; }
      if(openCtx){ cmClose(openCtx); return; }
      var dps = document.querySelectorAll('[data-kind="datePicker"][data-open="true"]');
      for(var i = 0; i < dps.length; i++) dpClose(dps[i]);
      return;
    }
    var pal = e.target && e.target.closest ? kindOf(e.target, "commandPalette") : null;
    if(pal && pal.getAttribute("data-open") === "true"){
      var vis = cpaVisible(pal), act = pal.querySelector('[data-part="command"][data-active="true"]'), idx = vis.indexOf(act);
      if(e.key === "ArrowDown"){ cpaActive(pal, vis[Math.min(vis.length - 1, idx + 1)] || null); e.preventDefault(); return; }
      if(e.key === "ArrowUp"){ cpaActive(pal, vis[Math.max(0, idx - 1)] || null); e.preventDefault(); return; }
      if(e.key === "Enter"){ cpaPick(pal, act); e.preventDefault(); return; }
      return;
    }
    // Hotkeys: "mod+k" (Ctrl or ⌘) and friends.
    var pals = document.querySelectorAll('[data-kind="commandPalette"]');
    for(var p = 0; p < pals.length; p++){
      var hk = String(pals[p].getAttribute("data-hotkey") || "").toLowerCase().split("+");
      var key = hk[hk.length - 1], needMod = hk.indexOf("mod") >= 0, needShift = hk.indexOf("shift") >= 0;
      if(key && e.key && e.key.toLowerCase() === key && (!needMod || isMod(e)) && (needShift === e.shiftKey)){
        e.preventDefault();
        if(pals[p].getAttribute("data-open") === "true") cpaClose(pals[p]); else cpaOpen(pals[p]);
        return;
      }
    }
    var cmEl = openCtx;
    if(cmEl && (e.key === "ArrowDown" || e.key === "ArrowUp")){
      var items = Array.prototype.filter.call(cmEl.querySelectorAll('[data-part="item"]'), function(b){ return !b.disabled; });
      var at = items.indexOf(document.activeElement);
      var next = items[e.key === "ArrowDown" ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1)];
      if(next) next.focus(); e.preventDefault();
    }
  });
  if(typeof window.addEventListener === "function") window.addEventListener("scroll", function(){ if(openCtx) cmClose(openCtx); }, true);

  // Carousel autoplay — paused while hovered or focused, and for reduced motion.
  function autoplay(){
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var all = document.querySelectorAll('[data-kind="carousel"][data-autoplay]');
    for(var i = 0; i < all.length; i++){
      (function(el){
        if(reduce || el.__mgAuto) return;
        var ms = Math.max(1000, Number(el.getAttribute("data-autoplay")) || 0), paused = false;
        el.addEventListener("mouseenter", function(){ paused = true; });
        el.addEventListener("mouseleave", function(){ paused = false; });
        el.addEventListener("focusin", function(){ paused = true; });
        el.addEventListener("focusout", function(){ paused = false; });
        el.__mgAuto = setInterval(function(){ if(!paused && document.visibilityState !== "hidden") crGo(el, Number(el.getAttribute("data-index") || 0) + 1); }, ms);
      })(all[i]);
    }
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoplay); else autoplay();
})();
`

export function wave3Behaviors(): string[] {
  return SOURCE.split('\n')
}
