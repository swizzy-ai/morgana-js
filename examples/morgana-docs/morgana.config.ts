import { defineConfig } from '@morgana/sdk'

export default defineConfig({
  name: 'morgana-docs',
  entry: 'home',
  minify: false,
  vars: {
    public: { siteName: 'morgana-docs' },
  },
  hooks: [
    // One entry per docs page — each compile action shapes exactly one page.
    // (Discovery runs every compile action regardless; this pins the order.)
    {
      on: 'compile',
      run: [
        'declareDocsStores',
        'gradients',
        'home',
        'objectsBasic',
        'objectsInput',
        'objectsData',
        'objectsDisplay',
        'objectsStructure',
        'objectsMore',
        'themesPage',
        'motion',
        'style',
        'lanes',
        'backend',
        'stream',
      ],
    },
  ],
})
