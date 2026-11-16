import { defineConfig } from 'vitest/config'
export default defineConfig({test:{include:['scripts/restoration/verify-live.ts'],environment:'node',testTimeout:30000}})
