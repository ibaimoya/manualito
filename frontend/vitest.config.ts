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
      '@tests': resolve(__dirname, './tests'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/_helpers/setup.ts'],
    // Glob explícito porque los tests ya no viven dentro de src/.
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // include explícito → vitest mide la cobertura de toda la carpeta
      // src/ aunque no haya tests que lo importen.  Sin esto, sólo cuenta
      // lo que el árbol de tests llega a tocar, lo que oculta ficheros sin
      // tests.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.config.{ts,js}',
        '**/*.d.ts',
        'src/main.tsx',
        'src/routeTree.gen.ts',
        'src/shared/api/generated/**',
        // Re-exports puros no aportan branches significativos.
        'src/vite-env.d.ts',
      ],
    },
  },
});
