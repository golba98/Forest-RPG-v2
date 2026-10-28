# Forest RPG v2 — Target Workspace Analysis

**Date**: 2026-10-27  
**Investigator**: survey_explorer_target_1 (teamwork_explorer subagent)  
**Target Workspace**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`  
**Reference Workspace (Read-Only)**: `/home/k9-vortex/Development/1-JavaScript/3-Game Development`

---

## 1. Executive Summary

A comprehensive forensic and environmental survey of `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2` was conducted. The key conclusions are:
- **Greenfield Repository**: The target repository is an empty initial repository with only `README.md` (16 bytes) and an initialized Git repository on branch `main` with a single initial commit (`faa6f93 first commit`).
- **No Existing Build/Code Contamination**: There is currently no `package.json`, `tsconfig.json`, `vite.config.ts`, `src/`, `public/`, `tests/`, or `.gitignore`. No legacy code from the university project exists in this workspace.
- **Runtime & Tooling Readiness**: The host runs Linux Fedora 44 on a high-performance 13th Gen Intel Core i7-13700 (16 cores, 24 threads) with 31 GiB RAM. Node.js `v22.23.1` (Active LTS) and npm `10.9.8` (as well as pnpm, yarn, and bun) are installed.
- **Hardware-Accelerated WebGL in Headless & Headed Modes**: The machine features a dedicated NVIDIA GeForce RTX 4080 (16 GiB VRAM) with NVIDIA driver 615.78.08 and OpenGL 4.6 / OpenGL ES 3.2. Headless Chrome WebGL2 initialization was directly verified and succeeded (`TEST_WEBGL_RESULT:true`). In addition, `xvfb-run` is available for isolated virtual display testing if required.
- **Playwright Pre-Installed**: The system cache (`~/.cache/ms-playwright`) contains pre-downloaded Chromium and Firefox binaries, eliminating browser download overhead during E2E test setup.

---

## 2. Current Project Files & Repository State

### 2.1 File System Inspection
Directory inspection (`ls -la`) of `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2` reveals:

```text
drwxr-xr-x.  .
drwxr-xr-x.  ..
drwxr-xr-x.  .agents/          (Teamwork coordination metadata)
drwxr-xr-x.  .git/             (Git repository data)
-rw-r--r--.  README.md         (16 bytes: "# Forest-RPG-v2\n")
```

### 2.2 Git State
```bash
$ git status
On branch main
Your branch is up to date with 'origin/main'.
Untracked files:
  .agents/
nothing added to commit but untracked files present

$ git log -n 1 --oneline
faa6f93 (HEAD -> main, origin/main) first commit
```

### 2.3 Status of Standard Project Infrastructure
| Item | Status | Notes |
|---|---|---|
| `package.json` | ❌ Missing | Needs initialization with PixiJS 8, Vite, Vitest, Playwright, TS |
| `tsconfig.json` | ❌ Missing | Needs strict TS compiler configuration (`strict: true`) |
| `vite.config.ts` | ❌ Missing | Needs configuration for asset bundling and pixel-art rendering |
| `vitest.config.ts` | ❌ Missing | Needs test configuration for simulation & integration test suites |
| `playwright.config.ts` | ❌ Missing | Needs E2E test configuration with webServer and headless browser |
| `index.html` | ❌ Missing | Needs canvas container, viewport meta, pixel-art styling |
| `src/` | ❌ Missing | To house decoupled simulation engine, PixiJS 8 rendering, world gen, UI |
| `public/` | ❌ Missing | To house game assets, sound/music, spritesheets, tilesets |
| `tests/` | ❌ Missing | To house unit, integration, and E2E suites |
| `docs/` | ❌ Missing | To house technical architecture and parity documentation |
| `.gitignore` | ❌ Missing | Needs `node_modules`, `dist`, `.agents`, `coverage`, test-results |
| `eslint.config.js` | ❌ Missing | Required for `npm run lint` acceptance criterion |

---

## 3. Dependencies & Tooling Analysis

Per the user requirements in `ORIGINAL_REQUEST.md`:
- Pure TypeScript engine with PixiJS 8 and Vite.
- Decoupled 60 Hz simulation game loop independent of rendering frame rate.
- Vitest for unit & integration testing.
- Playwright for browser E2E testing.
- Strict TypeScript compiler (`npm run typecheck`).
- Zero dependencies on p5.js or frontend frameworks (React, Vue, Angular).

### 3.1 Recommended Package Manifest (`package.json`)
```json
{
  "name": "forest-rpg-v2",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "bench": "vitest run tests/benchmark"
  },
  "dependencies": {
    "pixi.js": "^8.6.6"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.2",
    "@types/node": "^22.8.1",
    "@typescript-eslint/eslint-plugin": "^8.11.0",
    "@typescript-eslint/parser": "^8.11.0",
    "@vitest/coverage-v8": "^2.1.3",
    "eslint": "^9.13.0",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.3"
  }
}
```

### 3.2 Recommended `tsconfig.json`
To satisfy the requirement that `npm run typecheck` passes with zero errors under strict TypeScript compiler options:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "tests/**/*", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

### 3.3 Recommended `vite.config.ts`
Key requirements:
- Asset copying / resolution for sprites, audio, tilemaps.
- Pixel-art nearest-neighbor CSS and canvas rendering flags.
- Fast HMR for development.
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
  },
  server: {
    port: 3000,
    open: false,
    host: 'localhost',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

### 3.4 Recommended `vitest.config.ts`
The simulation architecture decouples game logic (world gen, collision detection, entity state machines, combat, persistence) from rendering. Therefore, the vast majority of tests run lightning-fast in the Node environment without DOM mocks.
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.{test,spec}.ts', 'tests/integration/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

### 3.5 Recommended `playwright.config.ts`
Configured to spin up the local Vite dev server and test real browser rendering with Chromium:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=gl',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 4. Build & Test Readiness Assessment

| Aspect | Current Status | Readiness Rating | Action Required |
|---|---|---|---|
| **Source Directory** | Non-existent | 0% | Create `src/` modular layout: `core/`, `render/`, `world/`, `entities/`, `combat/`, `ui/`, `storage/`, `bench/` |
| **Asset Directory** | Non-existent | 0% | Create `public/assets/` organized cleanly for Vite static serving |
| **Build System** | Greenfield | Ready to scaffold | Add `package.json`, `tsconfig.json`, `vite.config.ts` |
| **Lint System** | Greenfield | Ready to scaffold | Add ESLint configuration adhering to zero-lint tolerance |
| **Unit/Integration Testing** | Greenfield | High | Fast Vitest runner, isolated headless simulation |
| **E2E Testing** | Greenfield | High | Playwright browsers pre-cached in `~/.cache/ms-playwright` |
| **Performance Benchmarking** | Greenfield | High | Direct access to hardware high-resolution timer (`performance.now()`) |

---

## 5. Environment & Runtime Analysis

### 5.1 Host Hardware & Operating System
- **Operating System**: Linux Fedora 44 (Workstation Edition), x86_64
- **Kernel Version**: `Linux JordanV 7.2.12-200.fc44.x86_64 #1 SMP PREEMPT_DYNAMIC`
- **CPU**: 13th Gen Intel(R) Core(TM) i7-13700 (16 physical cores: 8 P-cores + 8 E-cores, 24 hardware threads)
- **RAM**: 31 GiB physical RAM, 14 GiB available buffer/cache, 8.0 GiB swap (2.3 GiB free)

### 5.2 Node.js & Package Managers
- **Node.js**: `v22.23.1` (Active LTS, native ES modules, top-level await, fetch, crypto)
- **npm**: `10.9.8`
- **Other Package Managers Available**: `pnpm` (installed at `~/.local/share/npm/bin/pnpm`), `yarn` (installed at `~/.local/share/npm/bin/yarn`), `bun` (installed at `~/.local/bin/bun`). All standard package management operations will succeed seamlessly.

### 5.3 Display & Graphics Environment
- **Active Displays**:
  - `DISPLAY=:0` (Active X11 display / Xwayland)
  - `WAYLAND_DISPLAY=wayland-0`
  - `XDG_SESSION_TYPE=wayland`
- **Dedicated GPU**:
  - Model: NVIDIA GeForce RTX 4080 (PCIe)
  - VRAM: 16,376 MB dedicated GDDR6X, ~14,170 MB currently free
  - Driver: NVIDIA proprietary driver `615.78.08`
  - OpenGL Core Profile: `4.6.0 NVIDIA 615.78.08`
  - OpenGL ES: `OpenGL ES 3.2 NVIDIA 615.78.08`
  - Direct Rendering: `Yes`
- **Headless WebGL Execution Verified**:
  - Command: `google-chrome --headless=new --enable-logging=stderr --use-gl=angle --use-angle=gl`
  - Output observed: `TEST_WEBGL_RESULT:true`
  - Result: Hardware-accelerated WebGL2 initializes properly in headless Chrome.
- **Headless Display Utilities**:
  - `/usr/bin/xvfb-run` is present, allowing isolated X11 virtual framebuffers for automated CI/testing if desired.
- **Installed System Browsers**:
  - Google Chrome: `/usr/bin/google-chrome`
  - Mozilla Firefox: `/usr/bin/firefox`
- **Playwright Browser Cache**:
  - Located at: `~/.cache/ms-playwright`
  - Contents: `chromium-1228`, `chromium-1243`, `chromium-1248`, `chromium_headless_shell-1228`, `chromium_headless_shell-1243`, `chromium_headless_shell-1248`, `ffmpeg-1011`, `ffmpeg-1013`, `firefox-1532`.
  - Conclusion: Playwright tests will execute without requiring additional browser downloads.

---

## 6. Workspace Integrity & Isolation Check

- **Target Workspace**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2` is completely clean. Only `.agents/`, `.git/`, and `README.md` exist.
- **Original Project Safety**: The university project directory at `/home/k9-vortex/Development/1-JavaScript/3-Game Development` was inspected strictly read-only. No files were written, modified, or deleted in that path.
- **Git State**: Clean on branch `main`.

---

## 7. Recommended Next Steps for Team Lead / Scaffold Agent

1. **Scaffold Project Configs**:
   - Write `package.json` with PixiJS 8, Vite, Vitest, Playwright, ESLint, TypeScript.
   - Run `npm install` in `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`.
   - Write `.gitignore` excluding `node_modules`, `dist`, `.agents`, `coverage`, and Playwright test artifacts.
   - Write `tsconfig.json` with strict compilation flags.
   - Write `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, and `eslint.config.js`.
2. **Scaffold Directory Structure**:
   - `src/core/` (Simulation loop, input, camera, math/events)
   - `src/render/` (PixiJS 8 application, layers, viewport culling, lighting, weather)
   - `src/world/` (Procedural generator, tilemap, collision grid)
   - `src/entities/` (Player, enemies: mantis, maggot, beetle; AI state machines)
   - `src/combat/` (Damage calculations, projectiles, XP, loot, level up)
   - `src/storage/` (Persistence, versioned JSON, legacy save adapter)
   - `src/ui/` (Pixel-art HUD, menu, debug console)
   - `src/bench/` (Benchmarking harness)
   - `public/` (Pixel-art assets, audio, favicon)
   - `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/benchmark/`
   - `docs/` (Architecture, rendering, worldgen, save adapter, benchmarks, parity)
3. **Verify Baseline Pipeline**:
   - Execute `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` immediately on initial scaffold to confirm pipeline integrity.
