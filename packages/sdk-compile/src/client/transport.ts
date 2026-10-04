/**
 * The bus transport — the piece that makes `ctx.events` one system instead of
 * two.
 *
 * Without this, `ctx.events.subscribe('channel:lobby')` registers on the page's
 * in-memory bus. Two browser tabs are two buses. Nothing crosses the network,
 * so a channel is a name that only the tab that created it can hear — which is
 * the opposite of what a channel is for, and it fails quietly: the code is
 * correct, the deploy is correct, and the second user sees nothing.
 *
 * The worker side is already complete and verified: per-channel Durable
 * Objects, durable history, an SSE endpoint, and fan-out to every open
 * subscriber. What is missing is the client end, and that is this file.
 *
 * ── Why fetch() and not EventSource ──────────────────────────────────────────
 *
 * The obvious implementation is `new EventSource(url)`, and it does not work
 * here. `EventSource` cannot send request headers, and the only credential a
 * deployed page has is a runtime key carried in `x-morgana-runtime`. The
 * alternatives are both bad:
 *
 *   - put the key in the query string. That works, and it leaks: the key lands
 *     in access logs, proxy logs and `Referer` headers — a project credential
 *     readable by anything in the path. Giving that back is worse than the
 *     problem it solves.
 *   - use a cookie. That needs a real session, and the whole point of the
 *     runtime key is that a static page authenticates without one.
 *
 * So the stream is read with `fetch` + `ReadableStream` and the key stays in a
 * header where it belongs. The cost is parsing `text/event-stream` by hand,
 * which is about forty lines, and two things come back for it:
 *
 *   - the response status is readable *before* the body is consumed, so a 401 is
 *     a refusal we can act on rather than an `error` event indistinguishable
 *     from a dropped connection. With `EventSource`, a stale page looks exactly
 *     like a network blip and retries forever.
 *   - closing is explicit and immediate.
 *
 * ── Other decisions worth stating ────────────────────────────────────────────
 *
 * One stream per channel, refcounted. A connection per subscription would mean
 * a page with a component per conversation exhausts the browser's per-host
 * connection limit — which surfaces as a page that silently stops receiving
 * while every request still reports 200.
 *
 * Frames are delivered twice over: to the channel's subscribers, and onto the
 * page bus. That second dispatch is what makes the feature additive — a page
 * already calling `ctx.ui.events.on('channel:lobby', …)` starts receiving
 * channel traffic without being rewritten.
 */
import type { EventFrame } from '@morgana/sdk'

/** Backoff schedule for a dropped stream, in ms. Capped: a chat should heal fast. */
const RECONNECT_MS = [500, 1000, 2000, 5000, 10000]

/**
 * Query parameters identifying the page's own project.
 *
 * Inlined into the emitted bundle rather than imported, because the transport
 * runs inside the same closure as the page bus — there is no module scope to
 * import from at runtime.
 */
export function transportPart(): string[] {
  return [
    'var RECONNECT_MS = [500, 1000, 2000, 5000, 10000];',
    // ── connection registry ──────────────────────────────────────────────
    // One map, one stream per channel, refcounted.
    'var __channels = {};',
    'function __channelConn(name){',
    '  var c = __channels[name];',
    '  if(!c){ c = __channels[name] = { abort:null, refs:0, handlers:[], retries:0, stopped:false }; }',
    '  return c;',
    '}',
    // This page's own project/env, read from the metas the worker injects. Used
    // as query parameters so every runtime call is scoped to the page's project
    // rather than the worker\'s default.
    // The meta name and the query parameter name are different things, and pairing',
    '// them wrongly is silent: the lookup returns nothing, no params are added,',
    '// and every call quietly falls back to the worker\'s default project. The',
    '// metas are `morgana-project` / `morgana-env`; the params are `projectId` /',
    '// `env`.',
    'function __projectParams(){',
    '  var pairs = [["morgana-project", "projectId"], ["morgana-env", "env"]];',
    '  var out = [];',
    '  for(var i=0;i<pairs.length;i++){',
    '    var el = document.querySelector(\'meta[name="\'+pairs[i][0]+\'"]\');',
    '    var v = el ? el.getAttribute("content") : "";',
    '    if(v) out.push(pairs[i][1]+"="+encodeURIComponent(v));',
    '  }',
    '  return out;',
    '}',
    '// Append params to a path that may already carry a query string.',
    'function __withProject(path){',
    '  var q = __projectParams();',
    '  if(!q.length) return path;',
    '  return path + (path.indexOf("?")>=0 ? "&" : "?") + q.join("&");',
    '}',
    'function __runtimeHeaders(){',
    '  var h = { "Accept": "text/event-stream" };',
    '  var meta = document.querySelector(\'meta[name="morgana-runtime-key"]\');',
    '  var key = meta ? meta.getAttribute("content") : "";',
    '  // The runtime key travels in a header, never in the query string — see the',
    '  // note at the top of this file.',
    '  if(key) h["x-morgana-runtime"] = key;',
    '  return h;',
    '}',
    // ── frame handling ──────────────────────────────────────────────────
    // The worker wraps a published payload as { channel, payload }. A subscriber
    // handed the wrapper would need to know the transport to read a message,
    // which is the opposite of the point — so it is unwrapped here.
    'function __unwrapFrame(d){',
    '  if(!d || typeof d !== "object") return null;',
    '  var payload = d.payload;',
    '  if(payload && typeof payload === "object" && payload.payload !== undefined && payload.channel !== undefined){',
    '    payload = payload.payload;',
    '  }',
    '  return { stream: d.event || "", event: d.event || "", op: d.op, data: payload, timestamp: d.timestamp };',
    '}',
    '// Frames go onto the page bus as well as to the channel handlers. The bus is',
    '// the join point between the two halves, so nothing has to be rewritten to',
    '// become live.',
    'function __deliver(name, f){',
    '  var eventName = "channel:" + name;',
    '  try{ dispatchPageEvent(eventName, name, null, { channel:name, payload:f.data, frame:f }); }catch(e){}',
    '  try{ dispatchPageEvent("channel", name, null, { channel:name, payload:f.data, frame:f }); }catch(e){}',
    '  logEvent({lane:"channel", name:eventName, origin:name, payload:f.data});',
    '}',
    'function __fanout(name, f){',
    '  __deliver(name, f);',
    '  var c = __channels[name];',
    '  if(!c) return;',
    '  var hs = c.handlers.slice();',
    '  for(var i=0;i<hs.length;i++){ try{ hs[i](f); }catch(e){ console.error("[Morgana] channel handler failed:",e); } }',
    '}',
    // ── the stream ──────────────────────────────────────────────────────',
    // `text/event-stream` parsed by hand: events are separated by a blank line,
    // and a chunk can end mid-event, so bytes are buffered until a separator is
    // actually present rather than assumed.
    'function __parseEventBlock(block){',
    '  var eventName = "message", dataLines = [];',
    '  var lines = block.split(/\\r?\\n/);',
    '  for(var i=0;i<lines.length;i++){',
    '    var line = lines[i];',
    '    if(!line || line.charAt(0)===":") continue; // keepalive comment',
    '    var colon = line.indexOf(":");',
    '    var field = colon < 0 ? line : line.slice(0, colon);',
    '    var value = colon < 0 ? "" : line.slice(colon+1).replace(/^ /, "");',
    '    if(field === "event") eventName = value;',
    '    else if(field === "data") dataLines.push(value);',
    '  }',
    '  if(!dataLines.length) return null;',
    '  var parsed = null;',
    '  try{ parsed = JSON.parse(dataLines.join("\\n")); }catch(e){ return null; }',
    '  return { eventName: eventName, frame: parsed };',
    '}',
    'function __stopChannel(name){',
    '  var c = __channels[name];',
    '  if(!c) return;',
    '  c.stopped = true;',
    '  if(c.abort){ try{ c.abort.abort(); }catch(e){} c.abort = null; }',
    '}',
    'function __openChannel(name){',
    '  var c = __channelConn(name);',
    '  if(c.abort || c.refs <= 0) return;',
    '  c.stopped = false;',
    '  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;',
    '  c.abort = ctrl;',
    '  var url = __withProject("/api/events?channel=" + encodeURIComponent(name));',
    '  fetch(url, { headers: __runtimeHeaders(), signal: ctrl ? ctrl.signal : undefined })',
    '    .then(function(res){',
    '      // The status is readable before the body, which is the whole reason',
    '      // this is not an EventSource: a refusal is distinguishable from a',
    '      // dropped connection, so a stale page stops retrying instead of',
    '      // hammering a server that will never accept it.',
    '      if(res.status === 401 || res.status === 403){',
    '        c.stopped = true;',
    '        console.error("[Morgana] channel "+name+" refused ("+res.status+") — this page is stale, reload it to pick up the current runtime key");',
    '        return null;',
    '      }',
    '      if(!res.ok || !res.body){',
    '        console.error("[Morgana] channel "+name+" stream unavailable ("+res.status+")");',
    '        return null;',
    '      }',
    '      // The retries counter is deliberately NOT reset here. Resetting on a',
    '      // successful connect means a server that accepts and then immediately',
    '      // drops flaps at the shortest delay forever — the counter never climbs.',
    '      // It resets when a frame actually arrives, which is proof the stream',
    '      // worked rather than merely that it opened.',
    '      return __readStream(name, res.body, c);',
    '    })',
    '    .catch(function(e){',
    '      if(c.stopped) return;',
    '      var attempt = ++c.retries;',
    '      if(attempt > RECONNECT_MS.length){',
    '        c.stopped = true;',
    '        console.error("[Morgana] channel "+name+" stream gave up after "+attempt+" attempts");',
    '        return;',
    '      }',
    '      setTimeout(function(){ if(!c.stopped && c.refs > 0) __openChannel(name); }, RECONNECT_MS[attempt-1]);',
    '    });',
    '}',
    'function __readStream(name, body, c){',
    '  var reader = body.getReader();',
    '  var decoder = new TextDecoder();',
    '  var buf = "";',
    '  function pump(){',
    '    return reader.read().then(function(r){',
    '      if(r.done){ if(!c.stopped) __reopen(name, c); return; }',
    '      buf += decoder.decode(r.value, { stream: true });',
    '      // Only complete blocks are consumed; a partial one stays buffered for',
    '      // the next chunk, so a frame split across two reads is not lost.',
    '      var idx;',
    '      while((idx = buf.search(/\\r?\\n\\r?\\n/)) >= 0){',
    '        var match = /\\r?\\n\\r?\\n/.exec(buf.slice(idx));',
    '        var sepLen = match ? match[0].length : 2;',
    '        var block = buf.slice(0, idx);',
    '        buf = buf.slice(idx + sepLen);',
    '        var parsed = __parseEventBlock(block);',
    '        if(parsed && parsed.eventName === "connected"){ continue; }',
    '        if(parsed){',
    '          var f = __unwrapFrame(parsed.frame);',
    '          if(f){',
    '            // A frame proves the stream works, so the backoff starts over.',
    '            c.retries = 0;',
    '            __fanout(name, f);',
    '            if(c.onFrame) c.onFrame(f);',
    '          }',
    '        }',
    '      }',
    '      return pump();',
    '    }).catch(function(){',
    '      if(!c.stopped) __reopen(name, c);',
    '    });',
    '  }',
    '  return pump();',
    '}',
    'function __reopen(name, c){',
    '  c.abort = null;',
    '  var attempt = ++c.retries;',
    '  if(attempt > RECONNECT_MS.length){',
    '    c.stopped = true;',
    '    console.error("[Morgana] channel "+name+" stream gave up after "+attempt+" attempts");',
    '    return;',
    '  }',
    '  setTimeout(function(){ if(!c.stopped && c.refs > 0) __openChannel(name); }, RECONNECT_MS[attempt-1]);',
    '}',
    // ── subscription surface ─────────────────────────────────────────────
    // Local page-bus events stay on the page bus — they were never meant to
    // leave the tab, and routing a click handler through the network would make
    // every click depend on a server round trip.
    'function __subscribe(event, scope, handler){',
    '  var name = String(event || "").replace(/^channel:/, "");',
    '  var isChannel = name && name !== event;',
    '  if(!isChannel){',
    '    var off = onPageEvent(function(n, origin, el, payload){',
    '      if(n !== event) return;',
    '      if(handler) handler(payload, n);',
    '      if(scope && typeof scope === "object" && typeof scope.onFrame === "function"){',
    '        scope.onFrame({ stream:"page:"+n, event:n, data:payload, timestamp:Date.now() });',
    '      }',
    '    });',
    '    return off;',
    '  }',
    '  var c = __channelConn(name);',
    '  var entry = typeof handler === "function" ? function(f){ handler(f.data, f.event); } : function(){};',
    '  c.handlers.push(entry);',
    '  c.refs += 1;',
    '  __openChannel(name);',
    '  var released = false;',
    '  return function(){',
    '    // Guarded: an unsubscribe called twice would otherwise decrement past',
    '    // zero and close a stream another subscriber is still using.',
    '    if(released) return;',
    '    released = true;',
    '    var i = c.handlers.indexOf(entry);',
    '    if(i >= 0) c.handlers.splice(i, 1);',
    '    c.refs -= 1;',
    '    if(c.refs <= 0){ c.refs = 0; __stopChannel(name); delete __channels[name]; }',
    '  };',
    '}',
    'function __attach(stream, ticket, opts){',
    '  var name = String(stream || "").replace(/^channel:/, "");',
    '  if(!name) throw new Error(\'[Morgana] attach() takes a stream name, e.g. channel:lobby\');',
    '  var off = __subscribe("channel:" + name, null, null);',
    '  if(opts && typeof opts.onFrame === "function"){',
    '    var c = __channelConn(name);',
    '    c.onFrame = function(f){ opts.onFrame({ stream:stream, event:f.event, data:f.data, timestamp:f.timestamp || Date.now() }); };',
    '  }',
    '  if(opts && typeof opts.into === "string"){',
    '    var path = opts.into;',
    '    // The handler receives the payload, not the frame — `__subscribe` already',
    '    // unwrapped it. Unwrapping a second time here read `undefined` and every',
    '    // `into` binding silently wrote nothing.',
    '    var off2 = __subscribe("channel:" + name, null, function(data){',
    '      if(data && data.__op === "created"){ makeState().append(path, data); }',
    '      else { makeState().set(path, data); }',
    '    });',
    '    return function(){ off(); off2(); };',
    '  }',
    '  return off;',
    '}',
    // The transport declares these in the same closure as the page bus (the',
    '// emitted bundle is one IIFE, so a function declaration here is hoisted and',
    '// callable from the action part above). Exposed on window so a test can drive',
    '// them, and so they are not dead weight when the transport is absent.',
    'window.__morgana_withProject = __withProject;',
    'window.__morgana_projectParams = __projectParams;',
    'window.__morgana_runtimeHeaders = __runtimeHeaders;',
    'window.__morgana_events = {',
    '  subscribe: __subscribe,',
    '  attach: __attach,',
    '  detach: function(stream){',
    '    var name = String(stream || "").replace(/^channel:/, "");',
    '    var c = __channels[name];',
    '    if(c){ c.refs = 0; __stopChannel(name); delete __channels[name]; }',
    '  },',
    '  channels: function(){ return Object.keys(__channels); },',
    '  projectParams: __projectParams,',
    '};',
  ]
}