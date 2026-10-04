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
  },
  hooks: [
    { on: 'compile', run: ['declare', 'seed'] },
    { on: 'http.get /hello', run: 'hello', auth: 'public' },
    { on: 'cron(* * * * *)', run: 'tick' },
    { on: 'store.orders.created', run: 'onOrder' },
  ],
})
