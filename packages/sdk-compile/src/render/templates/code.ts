/**
 * Code block rendering: line numbers and language-aware token spans.
 *
 * A compact tokenizer covering the languages that appear in UI code. This is
 * presentation, not a compiler — unknown languages render as plain text rather
 * than being guessed at, so nothing is ever mis-highlighted into nonsense.
 */
import { baseAttrs, carryProps, escAttr, escHtml, type RenderNode } from '../html';
import type { ProjectIR } from '../../ir';

type TokenKind = 'comment' | 'string' | 'number' | 'keyword' | 'type' | 'function' | 'punct';

const KEYWORDS: Record<string, string[]> = {
  ts: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'import', 'from', 'export', 'default', 'async', 'await', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'void', 'null', 'undefined', 'true', 'false', 'as', 'public', 'private', 'protected', 'readonly', 'implements', 'satisfies', 'keyof', 'infer', 'declare', 'namespace', 'abstract', 'extends'],
  js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'extends', 'import', 'from', 'export', 'default', 'async', 'await', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'void', 'null', 'undefined', 'true', 'false'],
  py: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is', 'pass', 'yield', 'global', 'nonlocal', 'assert'],
  css: [],
  html: [],
  json: ['true', 'false', 'null'],
  sh: ['if', 'then', 'else', 'fi', 'for', 'in', 'do', 'done', 'while', 'case', 'esac', 'function', 'return', 'export', 'local', 'echo', 'cd', 'set'],
}
KEYWORDS.tsx = KEYWORDS.ts
KEYWORDS.jsx = KEYWORDS.js

/** Map a `language` prop to a tokenizer family. */
function familyFor(language: string): 'ts' | 'js' | 'py' | 'css' | 'html' | 'json' | 'sh' | 'none' {
  const l = language.toLowerCase().replace(/^\./, '')
  if (['ts', 'typescript'].includes(l)) return 'ts'
  if (['js', 'javascript', 'mjs', 'cjs'].includes(l)) return 'js'
  if (['py', 'python'].includes(l)) return 'py'
  if (['css', 'scss', 'less'].includes(l)) return 'css'
  if (['html', 'xml', 'svg', 'vue'].includes(l)) return 'html'
  if (['json', 'json5'].includes(l)) return 'json'
  if (['sh', 'bash', 'zsh', 'shell', 'console'].includes(l)) return 'sh'
  return 'none'
}

/**
 * Tokenize one line into spans. A single regex with named alternatives keeps
 * this linear and avoids the backtracking blowups of nested alternation.
 */
function tokenize(line: string, family: ReturnType<typeof familyFor>): string {
  if (family === 'none') return escHtml(line)

  const out: string[] = []
  let rest = line

  const push = (kind: TokenKind, text: string): void => {
    if (text === '') return
    out.push(`<span data-tok="${kind}">${escHtml(text)}</span>`)
  }

  while (rest.length > 0) {
    // Line comment
    const lineComment = family === 'py' || family === 'sh'
      ? matchAt(rest, /#.*$/)
      : matchAt(rest, /\/\/.*$/)
    if (lineComment !== null) {
      push('comment', lineComment)
      return out.join('')
    }
    // Block comment (C-family)
    if (family === 'ts' || family === 'js') {
      const block = matchAt(rest, /\/\*[\s\S]*?(?:\*\/|$)/)
      if (block !== null) {
        push('comment', block)
        return out.join('')
      }
    }
    // Strings
    const str = matchAt(rest, /"(?:[^"\\]|\\.)*"?|'[^'\\]*(?:\\.[^'\\]*)*'?|`[^`\\]*(?:\\.[^`\\]*)*`?/)
    if (str !== null) {
      push('string', str)
      rest = rest.slice(str.length)
      continue
    }
    // Numbers
    const num = matchAt(rest, /\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b|\b0x[0-9a-fA-F]+\b/)
    if (num !== null) {
      push('number', num)
      rest = rest.slice(num.length)
      continue
    }
    // Identifiers — keyword or plain
    const ident = matchAt(rest, /[A-Za-z_$][\w$]*/)
    if (ident !== null) {
      const isKeyword = (KEYWORDS[family] ?? []).includes(ident)
      if (isKeyword) {
        push('keyword', ident)
      } else if (/^[A-Z]/.test(ident)) {
        push('type', ident)
      } else {
        out.push(escHtml(ident))
      }
      rest = rest.slice(ident.length)
      continue
    }
    // Punctuation run
    const punct = matchAt(rest, /[{}()[\].,;:?!<>=+\-*/%&|^~]+/)
    if (punct !== null) {
      push('punct', punct)
      rest = rest.slice(punct.length)
      continue
    }
    // Whitespace / anything else
    const one = rest[0]!
    out.push(escHtml(one))
    rest = rest.slice(1)
  }
  return out.join('')
}

/** Match a pattern anchored at position 0, returning the matched text. */
function matchAt(rest: string, re: RegExp): string | null {
  const anchored = new RegExp(`^(?:${re.source})`, re.flags.replace('g', ''))
  const m = anchored.exec(rest)
  return m ? m[0] : null
}

export function renderCode(ir: ProjectIR, node: RenderNode): string {
  void ir
  const props = node.props
  const attrList = baseAttrs(node)
  const language = typeof props['language'] === 'string' ? props['language'] : ''
  const family = familyFor(language)
  attrList.push(`data-variant="${escAttr(String(props['variant'] ?? 'light'))}"`)
  if (language !== '') attrList.push(`data-language="${escAttr(language)}"`)
  const showLines = props['showLineNumbers'] !== false
  const skip = new Set([
    'id', 'name', 'placement', 'data', 'address', 'app',
    'content', 'code', 'language', 'variant', 'showLineNumbers', 'highlight', 'wrap', 'icon', 'iconPosition',
  ]);
  attrList.push(...carryProps(props, skip))

  const source = String(props['content'] ?? props['code'] ?? props['text'] ?? '')
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  // A trailing newline should not produce a phantom empty final line.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()

  let html = `<pre ${attrList.join(' ')}>`
  lines.forEach((line, idx) => {
    const n = idx + 1
    const odd = n % 2 === 0 ? 'odd' : 'even'
    html += `<span data-part="line" data-line="${odd}" data-n="${n}">`
    if (showLines) html += `<span data-part="gutter" data-line="${odd}">${n}</span>`
    html += `${tokenize(line, family)}\n</span>`
  })
  html += '</pre>'
  return html
}
