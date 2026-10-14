import { defineConfig } from '@studiomorgana/sdk'

export default defineConfig({
  name: 'team-board',
  entry: 'board',
  // Downloaded at build and served from /assets — visitors never call Google.
  fonts: {
    brand: { google: 'Inter', weights: [400, 600] },
    display: { google: 'Space Grotesk', weights: [600, 700] },
  },
  // Body text uses `brand`; every heading word of the scale (h1–h6, display…) `display`.
  text: { body: 'brand', headings: 'display' },
})
