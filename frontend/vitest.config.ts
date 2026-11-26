import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

// Unit and component tests (npm test). Same plugins as the app; see README "Tests".
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      // Components are tested for behaviour, not looks: CSS imports are ignored.
      css: false,
      restoreMocks: true,
    },
  }),
)
