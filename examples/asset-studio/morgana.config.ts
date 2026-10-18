import { defineConfig } from '@studiomorgana/sdk'

export default defineConfig({
  name: 'asset-studio',
  entry: 'gallery',
  // Reads src/assets/ and builds each definition into files pages can point at: `asset:coin`.
  plugins: ['@studiomorgana/assets'],
})
