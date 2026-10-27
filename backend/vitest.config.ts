// Vitest configuration file
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
