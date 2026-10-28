# Original User Request

## Initial Request — 2026-10-27T22:10:00Z

Use a team coordinated as: Team Lead (Technical Architecture and Integration), Agent 1 (Rendering Engine), Agent 2 (Gameplay and World Systems), Agent 3 (Visual Design and User Interface), and Agent 4 (Infrastructure and Quality Assurance). Develop Forest RPG V2, a standalone, modern, production-quality 2D pixel-art RPG using TypeScript and PixiJS 8 as the successor to the original university JavaScript game, demonstrating significant advancements in software engineering, architecture, rendering technology, visual quality, maintainability, and performance.

Working directory: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2
Integrity mode: demo
The team must NOT: copy code from existing open-source projects for core logic, run external scripts or delegate execution to other tools

Reference material:
- Original university project reference (STRICTLY READ ONLY): `/home/k9-vortex/Development/1-JavaScript/3-Game Development`

## Requirements

### R1. Standalone TypeScript Engine and Rendering Architecture
Build an independent game engine using strict TypeScript, PixiJS 8, and Vite, featuring a single authoritative fixed-timestep simulation game loop (60 Hz) decoupled from variable rendering frame rates, a 2D camera system supporting player tracking, zoom, coordinate transforms, and camera shake, and an independent keyboard input system.

### R2. Cohesive Pixel-Art Presentation and World Rendering
Implement high-fidelity pixel-art rendering with nearest-neighbor sampling, high-DPI awareness, chunked terrain rendering with viewport culling, depth-sorted entity layers, a typed sprite animation framework, configurable day/night lighting transitions, ambient weather effects, and a responsive pixel-art HUD and menu system.

### R3. Comprehensive RPG Systems, Simulation, and Persistence
Implement deterministic seeded procedural world generation with terrain connectivity, top-down collision detection, responsive player mechanics (movement, sprint, stamina, mana, leveling), diverse enemy types with lightweight AI state machines, real-time combat, loot, portals, tutorial flow, in-game debug terminal commands, and versioned JSON persistence with a legacy save adapter.

### R4. Automated Testing, Performance Benchmarking, and Documentation
Provide comprehensive Vitest unit and integration tests, Playwright browser E2E tests, reproducible performance benchmarking targeting stable 60 FPS across standard and high-refresh displays, production build verification, and complete technical documentation covering architecture, subsystems, and feature parity against the original game.

### R5. Strict Workspace Boundary and Safety Constraints
Ensure the original university project at `/home/k9-vortex/Development/1-JavaScript/3-Game Development` remains strictly read-only and unmodified in every respect, conducting all new development, asset organization, testing, and Git commits exclusively within `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`.

## Acceptance Criteria

### Engine & Build System
- [ ] `npm run typecheck` passes with zero errors under strict TypeScript compiler options.
- [ ] `npm run lint` passes with no errors.
- [ ] `npm test` passes all Vitest unit and integration test suites.
- [ ] `npm run build` succeeds, generating a production-ready bundle with working static asset resolution.
- [ ] The runtime operates with zero dependencies on p5.js or frontend frameworks (React, Vue, Angular).

### Rendering & Visuals
- [ ] PixiJS 8 initializes correctly and renders pixel-art sprites and terrain without blur, seam artifacts, or texture bleeding.
- [ ] Camera smoothly tracks the player, clamps to world bounds, handles window resizing, and performs correct screen/world coordinate conversions.
- [ ] Dynamic day/night ambient lighting and particle weather effects render correctly while keeping gameplay elements legible.
- [ ] UI and HUD adaptively scale across standard resolutions (1080p, 1440p, 4K) and window resizes without losing pixel clarity.

### Gameplay & RPG Mechanics
- [ ] Procedural world generator deterministically generates navigable terrain with rivers, bridges, forests, and spawn safety from a given seed.
- [ ] Fixed-timestep simulation maintains consistent movement speed, stamina consumption, and collision response regardless of display refresh rate.
- [ ] Enemy types (mantis, maggot, beetle, and others from the original game) patrol, detect, chase, attack, and take damage via state-machine AI.
- [ ] Combat mechanics correctly register attacks, projectiles, damage cooldowns, XP gains, level-up stat distribution, and item drops.
- [ ] Tutorial progression, portal victory sequence, and debug console commands operate as specified.
- [ ] Game state saves and loads reliably via versioned JSON in browser localStorage, and the legacy adapter parses original save fixtures without data corruption.

### Testing & Verification
- [ ] Benchmarking harness measures and reports startup time, world generation duration, average FPS, and p95/p99 frame times.
- [ ] Playwright E2E tests execute and verify main menu interaction, game startup, controls, pause/resume, and settings (or log specific headless environment constraints).
- [ ] Complete technical documentation is provided in `docs/` covering architecture, rendering, world generation, gameplay systems, save format, performance benchmarks, and original game audit/feature parity.

### Safety & Workspace Integrity
- [ ] The original repository `/home/k9-vortex/Development/1-JavaScript/3-Game Development` has zero modified, added, or deleted files, and unchanged Git status.
- [ ] All new implementation files, tests, documentation, and Git commits exist exclusively in `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`.
