/**
 * Default styles for datePicker, radioGroup, pagination, collapsible,
 * carousel, colorPicker, contextMenu and commandPalette.
 *
 * Written against the theme variables only, so every theme and dark mode
 * restyles them, and emitted inside the framework layer, so an object's own
 * props always win.
 */
export function wave3Styles(): string[] {
  const field = 'border:1px solid var(--border);border-radius:8px;background:var(--background);color:var(--foreground);font:inherit'
  const panel = 'background:var(--card);color:var(--card-foreground);border:1px solid var(--border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.12)'
  const item = 'display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:8px 10px;border:none;background:transparent;color:inherit;font:inherit;text-align:left;border-radius:6px;cursor:pointer'
  return [
    // datePicker
    '[data-kind="datePicker"]{position:relative;display:inline-block}',
    '[data-kind="datePicker"] [data-part="control"]{display:flex;align-items:center;gap:4px}',
    `[data-kind="datePicker"] [data-part="field"]{${field};padding:8px 10px;min-width:150px;cursor:pointer}`,
    `[data-kind="datePicker"] [data-part="trigger"]{${field};padding:7px 9px;cursor:pointer}`,
    `[data-kind="datePicker"] [data-part="calendar"]{position:absolute;top:calc(100% + 6px);left:0;z-index:40;${panel};padding:10px;width:260px}`,
    '[data-kind="datePicker"] [data-part="cal-head"]{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:600}',
    '[data-kind="datePicker"] [data-part="cal-nav"]{border:none;background:transparent;color:inherit;font-size:18px;cursor:pointer;padding:2px 8px;border-radius:6px}',
    '[data-kind="datePicker"] [data-part="cal-nav"]:hover{background:var(--muted)}',
    '[data-kind="datePicker"] [data-part="cal-grid"]{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}',
    '[data-kind="datePicker"] [data-part="weekday"]{font-size:11px;color:var(--muted-foreground);padding:4px 0}',
    '[data-kind="datePicker"] [data-part="day"]{border:none;background:transparent;color:inherit;font:inherit;padding:6px 0;border-radius:6px;cursor:pointer}',
    '[data-kind="datePicker"] [data-part="day"]:hover:not(:disabled){background:var(--muted)}',
    '[data-kind="datePicker"] [data-part="day"][data-today="true"]{font-weight:700}',
    '[data-kind="datePicker"] [data-part="day"][data-selected="true"]{background:var(--primary);color:var(--primary-foreground)}',
    '[data-kind="datePicker"] [data-part="day"][data-outside="true"]{color:var(--muted-foreground);opacity:.6}',
    '[data-kind="datePicker"] [data-part="day"]:disabled{opacity:.35;cursor:not-allowed}',
    // dateRange — shares the datePicker parts, plus the in-between days
    '[data-kind="dateRange"]{position:relative;display:inline-block}',
    '[data-kind="dateRange"] [data-part="control"]{display:flex;align-items:center;gap:4px}',
    `[data-kind="dateRange"] [data-part="field"]{${field};padding:8px 10px;min-width:220px;cursor:pointer}`,
    `[data-kind="dateRange"] [data-part="trigger"]{${field};padding:7px 9px;cursor:pointer}`,
    `[data-kind="dateRange"] [data-part="calendar"]{position:absolute;top:calc(100% + 6px);left:0;z-index:40;${panel};padding:10px;width:260px}`,
    '[data-kind="dateRange"] [data-part="cal-head"]{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:600}',
    '[data-kind="dateRange"] [data-part="cal-nav"]{border:none;background:transparent;color:inherit;font-size:18px;cursor:pointer;padding:2px 8px;border-radius:6px}',
    '[data-kind="dateRange"] [data-part="cal-grid"]{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}',
    '[data-kind="dateRange"] [data-part="weekday"]{font-size:11px;color:var(--muted-foreground);padding:4px 0}',
    '[data-kind="dateRange"] [data-part="day"]{border:none;background:transparent;color:inherit;font:inherit;padding:6px 0;border-radius:6px;cursor:pointer}',
    '[data-kind="dateRange"] [data-part="day"]:hover:not(:disabled){background:var(--muted)}',
    '[data-kind="dateRange"] [data-part="day"][data-in-range="true"]{background:var(--accent);color:var(--accent-foreground);border-radius:0}',
    '[data-kind="dateRange"] [data-part="day"][data-selected="true"]{background:var(--primary);color:var(--primary-foreground)}',
    '[data-kind="dateRange"] [data-part="day"][data-outside="true"]{color:var(--muted-foreground);opacity:.6}',
    '[data-kind="dateRange"] [data-part="day"]:disabled{opacity:.35;cursor:not-allowed}',
    // radioGroup
    '[data-kind="radioGroup"]{display:flex;flex-direction:column;gap:8px}',
    '[data-kind="radioGroup"][data-orientation="horizontal"]{flex-direction:row;flex-wrap:wrap;gap:16px}',
    '[data-kind="radioGroup"] [data-part="option"]{display:flex;align-items:flex-start;gap:8px;cursor:pointer}',
    '[data-kind="radioGroup"] [data-part="option"][data-disabled="true"]{opacity:.5;cursor:not-allowed}',
    '[data-kind="radioGroup"] [data-part="radio"]{accent-color:var(--primary);margin:3px 0 0;width:16px;height:16px}',
    '[data-kind="radioGroup"] [data-part="option-text"]{display:flex;flex-direction:column}',
    '[data-kind="radioGroup"] [data-part="option-description"]{font-size:13px;color:var(--muted-foreground)}',
    // pagination
    '[data-kind="pagination"]{display:flex;align-items:center;gap:4px}',
    '[data-kind="pagination"] [data-part="pages"]{display:flex;align-items:center;gap:4px}',
    `[data-kind="pagination"] button{${field};min-width:34px;height:34px;padding:0 8px;cursor:pointer}`,
    '[data-kind="pagination"] button:hover:not(:disabled){background:var(--muted)}',
    '[data-kind="pagination"] button:disabled{opacity:.4;cursor:not-allowed}',
    '[data-kind="pagination"] [data-part="page"][data-current="true"]{background:var(--primary);color:var(--primary-foreground);border-color:var(--primary)}',
    '[data-kind="pagination"] [data-part="gap"]{padding:0 4px;color:var(--muted-foreground)}',
    // collapsible
    '[data-kind="collapsible"]{border:1px solid var(--border);border-radius:8px}',
    '[data-kind="collapsible"] [data-part="trigger"]{display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 12px;border:none;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;text-align:left}',
    '[data-kind="collapsible"] [data-part="chevron"]{transition:transform .15s ease}',
    '[data-kind="collapsible"][data-open="true"] [data-part="chevron"]{transform:rotate(180deg)}',
    '[data-kind="collapsible"] [data-part="panel"]{padding:0 12px 12px}',
    '[data-kind="collapsible"] [data-part="trigger"]:disabled{opacity:.5;cursor:not-allowed}',
    // carousel
    '[data-kind="carousel"]{position:relative;overflow:hidden;border-radius:10px}',
    '[data-kind="carousel"] [data-part="viewport"]{overflow:hidden}',
    '[data-kind="carousel"] [data-part="track"]{display:flex;transition:transform .35s ease}',
    '[data-kind="carousel"] [data-part="slide"]{flex:0 0 100%;min-width:0;position:relative}',
    '[data-kind="carousel"] [data-part="slide-image"]{display:block;width:100%;height:100%;object-fit:cover}',
    '[data-kind="carousel"] [data-part="caption"]{position:absolute;left:0;right:0;bottom:0;padding:16px;background:linear-gradient(transparent,rgba(0,0,0,.6));color:#fff}',
    '[data-kind="carousel"] [data-part="caption-title"]{font-weight:600}',
    '[data-kind="carousel"] [data-part="prev"],[data-kind="carousel"] [data-part="next"]{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:9999px;border:none;background:rgba(255,255,255,.85);color:#111;font-size:20px;cursor:pointer}',
    '[data-kind="carousel"] [data-part="prev"]{left:10px}',
    '[data-kind="carousel"] [data-part="next"]{right:10px}',
    '[data-kind="carousel"] [data-part="dots"]{position:absolute;bottom:10px;left:0;right:0;display:flex;justify-content:center;gap:6px}',
    '[data-kind="carousel"] [data-part="dot"]{width:8px;height:8px;padding:0;border-radius:9999px;border:none;background:rgba(255,255,255,.5);cursor:pointer}',
    '[data-kind="carousel"] [data-part="dot"][data-active="true"]{background:#fff}',
    // colorPicker
    '[data-kind="colorPicker"]{display:flex;align-items:center;flex-wrap:wrap;gap:8px}',
    '[data-kind="colorPicker"] [data-part="native"]{width:40px;height:36px;padding:2px;border:1px solid var(--border);border-radius:8px;background:var(--background);cursor:pointer}',
    `[data-kind="colorPicker"] [data-part="hex"]{${field};padding:8px 10px;width:96px;font-family:ui-monospace,monospace}`,
    '[data-kind="colorPicker"] [data-part="swatches"]{display:flex;flex-wrap:wrap;gap:6px}',
    '[data-kind="colorPicker"] [data-part="swatch"]{width:24px;height:24px;border-radius:6px;border:1px solid var(--border);cursor:pointer;padding:0}',
    '[data-kind="colorPicker"] [data-part="swatch"][data-active="true"]{outline:2px solid var(--primary);outline-offset:2px}',
    // contextMenu + commandPalette items
    '[data-kind="contextMenu"]{position:relative}',
    `[data-kind="contextMenu"] [data-part="menu"]{position:fixed;z-index:60;min-width:180px;${panel};padding:4px}`,
    `[data-kind="contextMenu"] [data-part="item"],[data-kind="commandPalette"] [data-part="command"]{${item}}`,
    '[data-kind="contextMenu"] [data-part="item"]:hover:not(:disabled),[data-kind="contextMenu"] [data-part="item"]:focus,[data-kind="commandPalette"] [data-part="command"][data-active="true"]{background:var(--muted);outline:none}',
    '[data-kind="contextMenu"] [data-part="item"]:disabled,[data-kind="commandPalette"] [data-part="command"]:disabled{opacity:.45;cursor:not-allowed}',
    '[data-kind="contextMenu"] [data-part="separator"],[data-kind="commandPalette"] [data-part="separator"]{height:1px;background:var(--border);margin:4px 0}',
    '[data-kind="contextMenu"] [data-part="shortcut"],[data-kind="commandPalette"] [data-part="shortcut"]{font:12px ui-monospace,monospace;color:var(--muted-foreground)}',
    '[data-kind="contextMenu"] [data-part="group-label"],[data-kind="commandPalette"] [data-part="group-label"]{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-foreground);padding:8px 10px 4px}',
    // commandPalette
    '[data-kind="commandPalette"]{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-start;justify-content:center;padding-top:12vh}',
    '[data-kind="commandPalette"][hidden]{display:none}',
    '[data-kind="commandPalette"] [data-part="overlay"]{position:absolute;inset:0;background:rgba(17,24,39,.45)}',
    `[data-kind="commandPalette"] [data-part="panel"]{position:relative;width:min(560px,92vw);${panel};overflow:hidden}`,
    '[data-kind="commandPalette"] [data-part="search"]{width:100%;padding:14px 16px;border:none;border-bottom:1px solid var(--border);background:transparent;color:inherit;font:inherit;font-size:16px;outline:none}',
    '[data-kind="commandPalette"] [data-part="list"]{max-height:50vh;overflow:auto;padding:6px}',
    '[data-kind="commandPalette"] [data-part="command"][hidden]{display:none}',
    '[data-kind="commandPalette"] [data-part="empty"]{padding:20px;text-align:center;color:var(--muted-foreground)}',
  ]
}
