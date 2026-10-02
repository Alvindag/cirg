/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// The e2e run serves the build with the same security headers Static Web Apps will send (see public/staticwebapp.config.json),
// so a Content-Security-Policy violation fails the test instead of surprising us in production.
const swaHeaders = process.env.E2E_CSP
  ? (JSON.parse(readFileSync('public/staticwebapp.config.json', 'utf8')).globalHeaders as Record<string, string>)
  : undefined
if (swaHeaders) swaHeaders['Content-Security-Policy'] = swaHeaders['Content-Security-Policy'].replace('__API_ORIGIN__', '')

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: swaHeaders ? { headers: swaHeaders } : {},
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
  },
})
