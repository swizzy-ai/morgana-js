/**
 * Markdown → HTML.
 *
 * A compact CommonMark subset: headings, emphasis, inline code, fenced code,
 * links, images, blockquotes, ordered/unordered lists, rules, and tables. The
 * `markdown` kind previously rendered its source as literal text, so this is
 * the whole feature — written small and dependency-free to match the rest of
 * the compiler.
 *
 * All output is escaped; the only raw HTML that survives is what this file
 * itself emits.
 */
import { escAttr, escHtml } from './html';

interface Inline {
  html: string;
}

/** Escape, then apply inline spans. Order matters: code first, so its contents
 *  are not re-processed for emphasis or links. */
function inline(src: string): Inline {
  const codes: string[] = []
  // Pull inline code out first so nothing inside it is interpreted.
  let work = src.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code)
    return `\u0000C${codes.length - 1}\u0000`
  })

  // Images before links — both are bracket-anchored, image has the leading !.
  work = work.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, alt: string, url: string, title?: string) => {
    return `<img src="${escAttr(url)}" alt="${escAttr(alt)}"${title ? ` title="${escAttr(title)}"` : ''} />`
  })
  work = work.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, label: string, url: string, title?: string) => {
    return `<a href="${escAttr(url)}"${title ? ` title="${escAttr(title)}"` : ''}>${label}</a>`
  })

  // Autolinks: <https://…>
  work = work.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_m, url: string) => `<a href="${escAttr(url)}">${url}</a>`)

  work = escHtml(work)
  work = work.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  work = work.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  work = work.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  work = work.replace(/(^|[^_])__([^_]+)__/g, '$1<strong>$2</strong>')
  work = work.replace(/(^|[^_\w])_([^_]+)_/g, '$1<em>$2</em>')
  work = work.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  // Restore inline code, escaped.
  work = work.replace(/\u0000C(\d+)\u0000/g, (_m, idx: string) => {
    return `<code>${escHtml(codes[Number(idx)] ?? '')}</code>`
  })
  return { html: work }
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const FENCE_RE = /^(```|~~~)(.*)$/
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/
const UL_RE = /^[-*+]\s+(.*)$/
const OL_RE = /^\d+[.)]\s+(.*)$/
const QUOTE_RE = /^>\s?(.*)$/
const TABLE_SEP_RE = /^\|?[\s:|-]+\|[\s:|-]*$/

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // Fenced code block
    const fence = FENCE_RE.exec(line)
    if (fence) {
      const marker = fence[1]!
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE_RE.test(lines[i]!)) {
        body.push(lines[i]!)
        i++
      }
      i++ // consume closing fence (or run off the end)
      out.push(`<pre data-part="pre"><code>${escHtml(body.join('\n'))}</code></pre>`)
      continue
    }

    // Blank
    if (line.trim() === '') {
      i++
      continue
    }

    // Heading
    const heading = HEADING_RE.exec(line)
    if (heading) {
      const level = heading[1]!.length
      out.push(`<h${level} data-part="h${level}">${inline(heading[2]!).html}</h${level}>`)
      i++
      continue
    }

    // Thematic break
    if (HR_RE.test(line)) {
      out.push('<hr data-part="hr" />')
      i++
      continue
    }

    // Blockquote — recurse so nested content renders.
    if (QUOTE_RE.test(line)) {
      const body: string[] = []
      while (i < lines.length && (QUOTE_RE.test(lines[i]!) || (body.length && lines[i]!.trim() !== '' && !isBlockStart(lines[i]!)))) {
        const m = QUOTE_RE.exec(lines[i]!)
        body.push(m ? m[1]! : lines[i]!)
        i++
      }
      out.push(`<blockquote data-part="blockquote">${renderMarkdown(body.join('\n'))}</blockquote>`)
      continue
    }

    // Table: a header row followed by a separator row.
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]!)) {
      const headerCells = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        rows.push(splitRow(lines[i]!))
        i++
      }
      const thead = `<thead><tr>${headerCells.map((c) => `<th>${inline(c).html}</th>`).join('')}</tr></thead>`
      const tbody = rows.length
        ? `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c).html}</td>`).join('')}</tr>`).join('')}</tbody>`
        : ''
      out.push(`<table data-part="table">${thead}${tbody}</table>`)
      continue
    }

    // Lists — consecutive items of the same marker form one list.
    if (UL_RE.test(line) || OL_RE.test(line)) {
      const ordered = OL_RE.test(line)
      const re = ordered ? OL_RE : UL_RE
      const items: string[] = []
      while (i < lines.length && re.test(lines[i]!)) {
        const m = re.exec(lines[i]!)!
        items.push(`<li data-part="li">${inline(m[1]!).html}</li>`)
        i++
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag} data-part="${tag}">${items.join('')}</${tag}>`)
      continue
    }

    // Paragraph — consume until a blank line or the start of another block.
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() !== '' && !isBlockStart(lines[i]!)) {
      para.push(lines[i]!)
      i++
    }
    if (para.length) {
      out.push(`<p data-part="p">${inline(para.join(' ')).html}</p>`)
    } else {
      // isBlockStart matched immediately — emit it as a paragraph and advance,
      // otherwise this would loop forever.
      out.push(`<p data-part="p">${inline(lines[i]!).html}</p>`)
      i++
    }
  }

  return out.join('\n')
}

function isBlockStart(line: string): boolean {
  return (
    HEADING_RE.test(line) ||
    FENCE_RE.test(line) ||
    HR_RE.test(line) ||
    UL_RE.test(line) ||
    OL_RE.test(line) ||
    QUOTE_RE.test(line)
  )
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
}
