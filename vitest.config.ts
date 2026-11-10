import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts', 'src/data/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
