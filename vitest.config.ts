import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    // Bound CPU contention in multi-seed generation and timing-sensitive stress tests.
    maxWorkers: 4,
    // Core game simulation (world gen, physics, AI state machines, math, combat, persistence)
    // runs lightning-fast in pure Node without heavy DOM overhead.
    // DOM-specific test files can override per-file via: // @vitest-environment happy-dom
    environment: 'node',
    include: [
      'tests/unit/**/*.{test,spec}.ts',
      'tests/integration/**/*.{test,spec}.ts',
    ],
    benchmark: {
      include: ['tests/benchmarks/**/*.{bench,benchmark,test}.ts'],
      reporters: ['default', 'verbose'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.ts',
        'src/types/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
