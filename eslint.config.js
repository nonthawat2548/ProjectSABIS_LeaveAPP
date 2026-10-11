import js from '@eslint/js';
import react from 'eslint-plugin-react';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', '.sites-runtime/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    plugins: { react },
    rules: {
      ...js.configs.recommended.rules,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    },
  },
];
