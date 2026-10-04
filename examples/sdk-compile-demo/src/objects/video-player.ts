/**
 * video-player — a custom object composed entirely from built-in kinds.
 *
 * This is the shadcn pattern: no bespoke renderer, no hand-written HTML, no
 * client JavaScript. The component places the `video` and `button` objects Morgana
 * already ships, so they arrive with real CSS, real behaviors and working
 * `bind()` — the interior is not a mock-up of a video player, it *is* one.
 *
 * Because it declares no `on*` hook and no `methods`, this component ships
 **zero bytes** to the browser. It is a build-time composition.
 */
import { createCustomObject } from '@morgana/sdk'

export default createCustomObject({
  name: 'video-player',

  defaultProps: {
    src: '',
    poster: '',
    autoPlay: false,
    loop: false,
    accent: 'brand',
  },

  events: ['played', 'paused', 'ended'],

  define: (handle, ctx) => {
    const props = ctx.props

    // The real video object, not a lookalike.
    const video = ctx.ui.video({
      id: 'video',
      src: String(props['src'] ?? ''),
      poster: String(props['poster'] ?? ''),
      autoPlay: props['autoPlay'] === true,
      loop: props['loop'] === true,
      controls: true,
      radius: 'lg',
      bg: 'black',
      overflow: 'hidden',
    })

    // A caption, placed underneath.
    const caption = ctx.ui.text({
      id: 'caption',
      content: '',
      font: 'body-sm',
      color: 'muted',
      align: 'center',
    })

    // The shell. `handle` is this component's own object, so the interior hangs
    // off it exactly as a `card` or `dialog` would.
    const shell = ctx.ui.box({
      id: 'shell',
      layout: 'column',
      gap: 2,
      surface: 'card',
      radius: 'lg',
      pad: 2,
      border: true,
    })
    shell.place(video)
    shell.place(caption)

    handle.place(shell)
  },
})
