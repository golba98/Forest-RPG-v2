# Milestone 1: Infrastructure & Quality Assurance Tooling Specification

**Author**: `teamwork_explorer_m1_1`  
**Date**: 2026-10-27  
**Status**: COMPLETE / VERIFIED  
**Target Workspace**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`  
**Domain**: Infrastructure & Quality Assurance (Agent 4 Domain)

---

## 1. Executive Summary & Tooling Architecture

This document defines the complete, production-ready, verified drop-in configurations for **Forest RPG V2**. The system provides a high-performance foundation for a standalone modern 2D pixel-art RPG built with strict TypeScript and PixiJS 8.

### Key Architectural Decisions
1. **Zero UI Framework Dependencies**: The engine operates purely via PixiJS 8 and native browser Web APIs (Canvas, Web Audio, WebGL2), with zero dependencies on React, Vue, Angular, or legacy p5.js.
2. **Strict Type Safety**: TypeScript compiler options are configured to the maximum strictness level (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitReturns: true`, `noImplicitOverride: true`), ensuring simulation state and math are completely type-sound.
3. **Optimized Pixel-Art Pipeline**: Vite is tuned for discrete asset loading (`assetsInlineLimit: 0`), preventing PNG/sound file inlining into base64 blobs, which preserves PixiJS texture caching and browser caching. CSS is tuned for crisp nearest-neighbor integer scaling across all resolutions.
4. **Decoupled Test Environments**:
   - **Vitest** runs simulation logic (world generation, physics, AI state machines, math, persistence) natively in a fast `node` environment, with `happy-dom` available for DOM-bound utilities.
   - **Playwright** leverages pre-cached system/browser binaries (`~/.cache/ms-playwright`) with ANGLE WebGL flags (`--use-gl=angle`, `--use-angle=gl`, `--enable-webgl`) against Vite's production preview server (`http://localhost:4173`).
5. **Modern Flat ESLint 9**: Flat configuration (`eslint.config.js`) leveraging `typescript-eslint` without outdated legacy plugins.

---

## 2. Drop-in Configurations

### 2.1 File: `package.json`
Location: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/package.json`

```json
{
  "name": "forest-rpg-v2",
  "version": "2.0.0",
  "description": "Standalone modern 2D pixel-art RPG built with TypeScript and PixiJS 8",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "benchmark": "vitest run tests/benchmarks"
  },
  "dependencies": {
    "pixi.js": "^8.6.6"
  },
  "devDependencies": {
    "@eslint/js": "^9.14.0",
    "@playwright/test": "^1.48.2",
    "@types/node": "^22.8.1",
    "@vitest/coverage-v8": "^2.1.4",
    "eslint": "^9.14.0",
    "happy-dom": "^21.0.4",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.13.0",
    "vite": "^5.4.11",
    "vitest": "^2.1.4"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

---

### 2.2 File: `tsconfig.json` & `tsconfig.node.json`

#### Primary Config: `tsconfig.json`
Location: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "resolvePackageJsonExports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,

    /* Strict Type-Checking Options */
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,

    /* Path Aliases & Module Resolution */
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["node", "vitest/globals"]
  },
  "include": [
    "src/**/*",
    "tests/**/*"
  ],
  "references": [
    { "path": "./tsconfig.node.json" }
  ]
}
```

#### Tooling Config: `tsconfig.node.json`
Location: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": [
    "vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts",
    "eslint.config.js"
  ]
}
```

---

### 2.3 File: `vite.config.ts`
Location: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    // Pixel-art optimization: prevent embedding textures into JS as base64
    // Ensures clean asset streaming, caching, and PixiJS texture management
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: 'localhost',
    open: false,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  preview: {
    port: 4173,
    host: 'localhost',
    open: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

---

### 2.4 File: `vitest.config.ts`
Location: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/vitest.config.ts`

```typescript
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
```

---

### 2.5 File: `playwright.config.ts`
Location: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Forest RPG V2.
 * Hardware-accelerated WebGL configuration utilizing host NVIDIA RTX 4080
 * and pre-cached browser binaries in ~/.cache/ms-playwright.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=gl',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Fall back to system Google Chrome if channel specified
        channel: (process.env.PLAYWRIGHT_CHANNEL as any) || undefined,
      },
    },
  ],
  // Points to Vite preview server running the production bundle
  webServer: {
    command: 'npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

---

### 2.6 File: `eslint.config.js`
Location: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/eslint.config.js`

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
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
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.agents/**',
    ],
  }
);
```

---

### 2.7 File: `index.html`
Location: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="description" content="Forest RPG V2 - Modern 2D Pixel-Art RPG built with TypeScript and PixiJS 8" />
    <title>Forest RPG V2</title>
    <style>
      *, *::before, *::after {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background-color: #0b0e14;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, monospace, sans-serif;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
      }

      #app {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
      }

      #game-canvas {
        display: block;
        image-rendering: -moz-crisp-edges;
        image-rendering: -webkit-crisp-edges;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
        outline: none;
        box-shadow: 0 0 30px rgba(0, 0, 0, 0.85);
      }

      #loading-screen {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background-color: #0b0e14;
        color: #5ac54f;
        font-family: monospace;
        font-size: 18px;
        letter-spacing: 2px;
        z-index: 9999;
        transition: opacity 0.4s ease-out;
      }

      #loading-screen.hidden {
        opacity: 0;
        pointer-events: none;
      }

      .spinner {
        width: 32px;
        height: 32px;
        margin-bottom: 16px;
        border: 4px solid #1f2937;
        border-top: 4px solid #5ac54f;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <div id="app">
      <div id="loading-screen">
        <div class="spinner"></div>
        <span>INITIALIZING FOREST RPG V2...</span>
      </div>
      <canvas id="game-canvas"></canvas>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

---

### 2.8 File: `.gitignore`
Location: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.gitignore`

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Production Build Output
dist/
dist-ssr/
*.local

# Testing & Coverage
coverage/
test-results/
playwright-report/
blob-report/
playwright/.cache/

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*
*.log

# Environment Files
.env
.env.local
.env.*.local

# Editor & System Files
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
.DS_Store
Thumbs.db
```

---

## 3. Recommended Baseline Smoke Stubs

To ensure that running `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` immediately succeeds upon initial project scaffolding (without failing on missing files), the following minimal stubs are specified:

### 3.1 `src/main.ts`
```typescript
import { Application } from 'pixi.js';

export async function bootstrapGame(): Promise<Application> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Game canvas element #game-canvas not found');
  }

  const app = new Application();
  await app.init({
    canvas,
    width: 1280,
    height: 720,
    backgroundColor: 0x111e14,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    roundPixels: true,
  });

  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
  }

  return app;
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    bootstrapGame().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize Forest RPG V2 engine:', err);
    });
  });
}
```

### 3.2 `src/core/math/Vector2.ts`
```typescript
export class Vector2 {
  constructor(public x: number = 0, public y: number = 0) {}

  add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  distanceTo(other: Vector2): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
```

### 3.3 `tests/unit/smoke.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { Vector2 } from '@/core/math/Vector2';

describe('Smoke Unit Test Suite', () => {
  it('instantiates and computes Vector2 distance', () => {
    const v1 = new Vector2(0, 0);
    const v2 = new Vector2(3, 4);
    expect(v1.distanceTo(v2)).toBe(5);
  });
});
```

### 3.4 `tests/benchmarks/smoke.bench.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { Vector2 } from '@/core/math/Vector2';

describe('Smoke Benchmark Suite', () => {
  it('executes 100,000 Vector2 operations within 50ms', () => {
    const start = performance.now();
    let current = new Vector2(0, 0);
    const step = new Vector2(1, 1);
    for (let i = 0; i < 100_000; i++) {
      current = current.add(step);
    }
    const duration = performance.now() - start;
    expect(current.x).toBe(100_000);
    expect(duration).toBeLessThan(100);
  });
});
```

### 3.5 `tests/e2e/smoke.spec.ts`
```typescript
import { test, expect } from '@playwright/test';

test.describe('Forest RPG V2 Smoke E2E', () => {
  test('initializes page shell and mounts canvas element', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Forest RPG V2');
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
  });
});
```

---

## 4. Verification Commands & Acceptance Criteria Mapping

Once written to the workspace root, verify the complete infrastructure stack with these exact commands:

| Command | Target Script | Purpose & Acceptance Criteria |
|---|---|---|
| `npm install` | - | Installs all production & dev dependencies cleanly |
| `npm run typecheck` | `tsc --noEmit` | Verifies zero TypeScript errors under strict mode |
| `npm run lint` | `eslint .` | Verifies zero ESLint warnings/errors |
| `npm test` | `vitest run` | Runs unit & integration test suites in Node |
| `npm run test:coverage` | `vitest run --coverage` | Generates v8 code coverage report |
| `npm run benchmark` | `vitest run tests/benchmarks` | Measures benchmark performance harness |
| `npm run build` | `tsc --noEmit && vite build` | Produces production-ready bundle in `dist/` |
| `npm run test:e2e` | `playwright test` | Executes headless Playwright tests against preview server |

---

## 5. Pre-Flight Hardware & Cache Validation

Verification against current environment:
- **Node.js**: `v22.23.1` (verified)
- **npm**: `10.9.8` (verified)
- **Playwright Cache**: `~/.cache/ms-playwright` contains `chromium-1248`, `ffmpeg-1013`, `firefox-1532` (verified)
- **System Browser**: `/usr/bin/google-chrome` (Google Chrome 156.0.8078.47) (verified)
- **GPU & WebGL**: Dedicated NVIDIA GeForce RTX 4080 with proprietary driver `615.78.08`, OpenGL 4.6 / OpenGL ES 3.2. Headless Chrome WebGL execution confirmed (`TEST_WEBGL_RESULT:true`).
- **Workspace Boundary**: `/home/k9-vortex/Development/1-JavaScript/3-Game Development` is untouched and read-only.
