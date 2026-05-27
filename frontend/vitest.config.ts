import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vitest config — separado de vite.config.ts porque Vite 8 ya no permite
 * `test` inline en defineConfig.
 *
 * Solo carga el plugin de React (no Tailwind, no Router, no PWA).
 * Más rápido en startup y evita generar artefactos al correr tests.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.config.{ts,js}',
        '**/*.d.ts',
        'src/test/**',
        'src/main.tsx',
        'src/routeTree.gen.ts',
        'src/shared/api/generated/**',
      ],
    },
  },
});
