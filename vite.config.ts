import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relativní base, aby build fungoval i v podadresáři (itch.io iframe).
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    // Doménová vrstva je čistá – stačí node prostředí.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
