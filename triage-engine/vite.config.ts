import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0, // no data:/inline assets -> keeps style-src/script-src strict
    modulePreload: { polyfill: false }, // the polyfill injects inline code
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
