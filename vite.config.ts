import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Relativní base, aby build fungoval i v podadresáři (itch.io iframe).
  base: './',
  // vše (JS + CSS) se zaroluje do jednoho self-contained dist/index.html → ideální pro itch.io upload.
  plugins: [viteSingleFile()],
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
