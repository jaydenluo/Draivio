import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { providerRelayPlugin } from './dev/providerRelay.ts'

export default defineConfig({
  plugins: [react(), providerRelayPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/dist/**'],
  },
})
