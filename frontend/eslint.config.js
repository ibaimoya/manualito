// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

/**
 * ESLint 9 flat config para Manualito.
 *
 * Orden de la pila importante:
 *  1. Base JS/TS
 *  2. Plugins de React (JSX runtime + hooks + a11y + refresh)
 *  3. Prettier al final → desactiva reglas de formato que chocarían con prettier
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'dev-dist/**',
      'src/routeTree.gen.ts',
      'src/shared/api/generated/**',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      // `'latest'` libera de subir el número cada año cuando sale una
      // nueva edición de ECMAScript — el parser usa lo más reciente
      // que soporta typescript-eslint en cada release.
      ecmaVersion: 'latest',
      sourceType: 'module',
      // ES2025 es el último estándar finalizado (junio 2025): incluye
      // Iterator helpers, `Promise.try`, `Set.union/intersection/...`,
      // `RegExp.escape`.  Mantenemos un step menos que `latest` aquí
      // para evitar marcar como "undefined" builtins que aún sean stage 3.
      globals: { ...globals.browser, ...globals.es2025 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // React + TS
      'react/prop-types': 'off', // TS reemplaza prop-types.
      // react-refresh warning silenciado para ficheros que co-exportan hooks/variants
      // (patrón cva + Context).  HMR sigue funcionando en componentes; lo demás
      // simplemente fuerza full reload, que es aceptable en componentes raíz.
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // A11y específicos relajados — algunos labels los gestiona Radix.
      'jsx-a11y/label-has-associated-control': [
        'error',
        { required: { some: ['nesting', 'id'] } },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Scripts Node que orquestan Playwright — el callback de `page.evaluate`
    // corre en browser, así que mezcla globals de Node + browser.
    files: ['scripts/**/*.{mjs,js}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  prettier,
);
