import { defineConfig } from '@morgana/sdk'

export default defineConfig({
  name: 'demo-shop',
  entry: 'landing',
  // Ship minified. `compileProject({ minify: false })` overrides this.
  minify: true,
  vars: {
    public: { siteName: 'Demo Shop' },
  },
  apps: {
    main: { displayName: 'Main Storefront' },
    shop: {
      displayName: 'Shop Desktop',
      type: 'desktop',
      platform: { bundleId: 'com.morgana.shop' },
      pages: ['landing'],
    },
  },
  // The desktop lane: the OS groups desktop actions may use. A desktop action
  // reaching for anything outside this list gets a named error, not undefined.
  desktop: { os: ['clipboard', 'notify'] },
  hooks: [
    { on: 'compile', run: ['declare', 'seed'] },
    { on: 'http.get /hello', run: 'hello', auth: 'public' },
    { on: 'cron(* * * * *)', run: 'tick' },
    { on: 'store.orders.created', run: 'onOrder' },
  ],
})
