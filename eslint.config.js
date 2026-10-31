import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
    },
  },
  {
    // Simulation layers must stay headless: no PixiJS, renderer, or UI imports.
    files: [
      'src/config/**/*.ts',
      'src/types/**/*.ts',
      'src/world/**/*.ts',
      'src/entities/**/*.ts',
      'src/systems/**/*.ts',
      'src/simulation/**/*.ts',
      'src/persistence/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'pixi.js', message: 'Simulation code must not depend on PixiJS.' }],
          patterns: [
            {
              group: ['**/rendering/**', '**/ui/**', '**/animation/**', '@/rendering/*', '@/ui/*', '@/animation/*'],
              message: 'Simulation code must not depend on presentation layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '**/worktrees/**',
    ],
  }
);
