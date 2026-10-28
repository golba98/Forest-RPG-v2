## 2026-10-27T22:28:01Z
You are teamwork_test_writer_e2e_1, a teamwork_test_writer subagent.
Your working directory is: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_test_writer_e2e_1/
The original user request is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/ORIGINAL_REQUEST.md
The E2E test infra document is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/TEST_INFRA.md
The project scope document is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/PROJECT.md

CRITICAL CONSTRAINT: Do NOT modify implementation source code. Your focus is designing and authoring comprehensive, opaque-box, requirement-driven tests and test scaffolding.

YOUR TASK:
E2E Testing Track Orchestration & Test Creation.
Based on `TEST_INFRA.md` and `PROJECT.md`:
1. Design the test harness and test structure under `tests/e2e/`:
   - `tests/e2e/helpers/`: game driver utilities (canvas interaction, keyboard event dispatch, screenshot compare, state inspection helper via window.__GAME__ or DOM elements).
   - `tests/e2e/tier1-feature/`: Feature coverage tests (≥5 test cases per feature across the 25 inventoried features).
   - `tests/e2e/tier2-boundary/`: Boundary and corner cases (empty inputs, extreme coords, max HP, zero stamina, viewport edges).
2. Author the initial suites for Tier 1 and Tier 2:
   - Menu & Boot E2E tests: page loads, canvas renders, 60fps ticker starts, menu buttons work, audio toggle works.
   - Fixed-timestep simulation tests: consistent movement, stamina drain, jump duration across simulated time.
   - Persistence & Legacy Save tests: saving state to localStorage, parsing legacy `maps/active_map.json` fixture without corruption.
   - Combat & AI tests: damage calculations, attack combos, beetle boss phase behaviors.
3. Prepare the checklist and publish readiness status for `TEST_READY.md`.

DELIVERABLES:
- Write test files into `tests/e2e/` (test code only — no implementation code).
- Write `e2e_test_plan.md` in your working directory.
- Write `handoff.md` per Handoff Protocol.
- Update `progress.md`.
- Send message to orchestrator with summary and file path when done.
