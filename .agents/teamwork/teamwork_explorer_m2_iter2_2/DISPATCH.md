# Dispatch: teamwork_explorer_m2_iter2_2

## Task Objective
Investigate and design exact fix blueprints for Milestone 2 Iteration 2:
1. **InputManager Storage Loading & Key Rebinding**:
   - Location: `src/core/input/InputManager.ts:269-297` (`loadFromStorage`)
   - Problem: When custom keybindings are loaded from storage, `InputManager.loadFromStorage()` calls `this.bindAction()`. Because `InputManager` initializes with `DEFAULT_KEYBINDS`, this merely appends custom keys without clearing the original default keys for that action. As a result, default keys cannot be rebound or unbound.
   - Goal: Design the exact mechanism so that loading keybinds for an action replaces the existing keybindings for that action rather than appending to them, while preserving unmentioned actions with their defaults.
2. **Eliminate Facade Test in `InputManager.test.ts`**:
   - Location: `tests/unit/core/InputManager.test.ts:77-86`
   - Problem: The test `'persists and restores keybinds from storage'` only calls in-memory `setKeybinds()` and never tests `saveToStorage()` or `loadFromStorage()`.
   - Goal: Design a genuine, rigorous unit test that mocks `localStorage`, calls `saveToStorage()`, verifies the JSON payload, creates a fresh `InputManager`, calls `loadFromStorage()`, and asserts that the custom keybind is active and the old default keybind is NO LONGER active.

## Deliverables
Write your full 5-section report and TypeScript blueprints to:
`/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_iter2_2/m2_input_fix_spec.md`
and `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_iter2_2/handoff.md`.

## 2026-10-28T00:13:06Z
You are teamwork_explorer_m2_iter2_2, Explorer 2 for Milestone 2 Iteration 2.
Your working directory is:
/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_iter2_2/

Before starting, read:
1. /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/PROJECT.md
3. /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_iter2_2/DISPATCH.md
4. /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_reviewer_m2_2/handoff.md

Investigate and produce concrete TypeScript fix blueprints for:
1. `src/core/input/InputManager.ts`: Fix `loadFromStorage` so that loading keybindings replaces existing keybindings for that action rather than appending to them, allowing default keys to be rebound or unbound.
2. `tests/unit/core/InputManager.test.ts`: Fix the test `'persists and restores keybinds from storage'` by removing the facade and writing a genuine unit test that mocks `localStorage`, calls `saveToStorage()`, instantiates a new `InputManager`, calls `loadFromStorage()`, and asserts that custom keybinds replace default ones.

Write your report and blueprints to:
/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_iter2_2/m2_input_fix_spec.md
and /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_iter2_2/handoff.md
Update progress.md and send a message back to the orchestrator when completed.
