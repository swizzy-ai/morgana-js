import { defineConfig } from '@studiomorgana/sdk'

/**
 * The project's settings. Everything an agent needs to know about fonts and
 * the type scale lives here, so nothing is decided in the pages themselves.
 */
export default defineConfig({
  name: 'kanban-ai',
  // The page the visitor lands on. Pages are created in src/actions/compile/.
  entry: 'board',
  // Fonts are downloaded at build time and served from /assets. Visitors never
  // call Google. Pick any family on fonts.google.com and list its weights.
  fonts: {
    brand: { google: 'IBM Plex Sans', weights: [400, 500] },
    display: { google: 'Fraunces', weights: [600, 700] },
  },
  // Body text uses `brand`; every heading step (h1–h6, display…) uses `display`.
  text: { body: 'brand', headings: 'display' },
})
