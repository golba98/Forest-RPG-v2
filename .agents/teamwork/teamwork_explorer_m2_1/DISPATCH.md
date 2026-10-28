## 2026-10-27T23:35:28Z
You are teamwork_explorer_m2_1, a teamwork_explorer subagent.
Your working directory is: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_1/
The original user request is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/ORIGINAL_REQUEST.md
The project scope document is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/PROJECT.md
The architecture survey is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/survey_explorer_arch_1/architecture_and_assets_survey.md

CRITICAL CONSTRAINT: Do NOT write source code. Explorer recommends fix and architecture strategy but does NOT implement.

YOUR TASK:
Milestone 2 focuses on Core Architecture & Simulation Engine (Team Lead domain).
Design the complete TypeScript architecture and specifications for the Game Loop and Interpolation subsystem:
1. `src/core/loop/GameLoop.ts` & `src/core/loop/types.ts`:
   - Authoritative 60Hz fixed simulation timestep (`FIXED_STEP_SEC = 1/60`, `FIXED_STEP_MS = 1000/60`).
   - Frame delta clamping `[0.1, 50]` ms to prevent jumps during tab backgrounding.
   - Spiral-of-death protection: Cap max fixed simulation steps per frame to 5 (100ms accumulator backlog drop).
   - Alpha calculation: `alpha = accumulator / FIXED_STEP_MS` for smooth rendering across variable display refresh rates (60Hz–240Hz+).
   - Lifecycle controls: `start()`, `stop()`, `pause()`, `resume()`, `isRunning`, `isPaused`.
   - Headless deterministic simulation step API (`step(customDeltaMs)` or `simulateTicks(count)`) allowing Vitest unit tests to advance time without a real browser window.
   - Pacing statistics: FPS counter, fixed step count, simulation time vs wall time.

DELIVERABLES:
- Write your comprehensive architecture specifications and code blueprints to `m2_loop_spec.md` in your directory.
- Write `handoff.md` per Handoff Protocol.
- Update `progress.md`.
- Send message to orchestrator when done.
