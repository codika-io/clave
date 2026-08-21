import { defineConfig } from 'vitest/config'

/**
 * The exchange-capture conformance and unit tests: the contract mirror
 * against its copied fixtures, the transcript reader over real files, the
 * store, and the shared state mapping. Scoped on purpose — nothing here boots
 * Electron or the renderer; the running app is verified through the
 * Playwright Electron workflow (CLAUDE.md).
 */
export default defineConfig({
  test: {
    include: ['src/main/exchange-capture/**/*.test.ts', 'src/shared/**/*.test.ts'],
    environment: 'node'
  }
})
