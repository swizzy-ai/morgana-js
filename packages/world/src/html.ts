/**
 * A world as one self-contained HTML file: the shader, the scene and the
 * runtime, nothing loaded from anywhere. Plays on open; `?t=4.5` shows one
 * frame; `window.__mgRender(t)` draws a frame for the renderer.
 */
import type { Scene } from './compile'
import { mountWorld } from './runtime'
import { FRAGMENT, VERTEX } from './shader'

/** The shader without comments or spare whitespace. */
export function minifyGlsl(src: string): string {
  return src
    .replace(/\/\/[^\n]*/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('#') ? `\n${l}\n` : l))
    .join(' ')
    .replace(/\s*([{}();,=+\-*/<>!?:&|])\s*/g, '$1')
    .replace(/\n /g, '\n')
    .trim()
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export function worldHtml(scene: Scene, opts: { title?: string } = {}): string {
  const data = JSON.stringify({ scene, vertex: VERTEX, fragment: minifyGlsl(FRAGMENT) }).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title ?? scene.name)}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style></head>
<body><canvas id="c"></canvas><script>
const D=${data};
const mountWorld=${mountWorld.toString()};
const v=mountWorld(document.getElementById('c'),D.scene,{vertex:D.vertex,fragment:D.fragment});
const q=new URLSearchParams(location.search);
window.__mgRender=(t)=>{v.render(t);return true};
if(q.has('t'))v.render(+q.get('t'));
else{let stop=v.play(0),paused=false;addEventListener('keydown',e=>{if(e.code==='Space'){paused?stop=v.play(0):stop();paused=!paused}})}
</script></body></html>`
}
