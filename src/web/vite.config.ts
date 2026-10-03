/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'

// The e2e run serves the build with the same security headers Static Web Apps will send (see public/staticwebapp.config.json),
// so a Content-Security-Policy violation fails the test instead of surprising us in production.
const swaHeaders = process.env.E2E_CSP
  ? (JSON.parse(readFileSync('public/staticwebapp.config.json', 'utf8')).globalHeaders as Record<string, string>)
  : undefined
if (swaHeaders) swaHeaders['Content-Security-Policy'] = swaHeaders['Content-Security-Policy'].replace('__API_ORIGIN__', '')

export default defineConfig(({ command, mode }) => {
  // The paste-a-token sign-in skips real authentication. A build for deployment must never contain it, so refuse to build one
  // (the browser test builds with it on purpose and says so with DAS_ALLOW_DEV_LOGIN_BUILD).
  if (command === 'build' && loadEnv(mode, process.cwd(), 'VITE_').VITE_DEV_LOGIN === 'true' && process.env.DAS_ALLOW_DEV_LOGIN_BUILD !== 'true') {
    throw new Error('Refusing to build: VITE_DEV_LOGIN=true would put the development sign-in (no real authentication) into this build. Remove VITE_DEV_LOGIN from the environment and from .env.local, then build again.')
  }
  return {
  plugins: [react()],
  server: { port: 5173 },
  preview: swaHeaders ? { headers: swaHeaders } : {},
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
  },
}
})
