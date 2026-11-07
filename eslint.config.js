import js from '@eslint/js';
import globals from 'globals';

export default [
  // Build output, and .astro files (no Astro parser installed — `astro check` covers them).
  { ignores: ['dist/**', '.astro/**', '**/*.astro'] },
  js.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'eqeqeq': 'error',
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
    },
  },
];
