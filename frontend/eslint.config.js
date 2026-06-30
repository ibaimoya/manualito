// @ts-check
import { defineConfig } from 'eslint/config';
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
export default defineConfig([
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

      ecmaVersion: 'latest',
      sourceType: 'module',

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
    // Suite de tests viviendo en `tests/` (espejando estructura de src).
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Scripts Node que orquestan Playwright
    files: ['scripts/**/*.{mjs,js}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  prettier,
]);
