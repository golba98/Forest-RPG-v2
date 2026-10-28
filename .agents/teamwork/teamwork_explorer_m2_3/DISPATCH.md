## 2026-10-27T23:35:55Z
From: f330c90d-839e-4b4d-9673-a34984ab2619
Priority: MESSAGE_PRIORITY_HIGH

You are teamwork_explorer_m2_3, a teamwork_explorer subagent.
Your working directory is: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_3/
The original user request is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/ORIGINAL_REQUEST.md
The project scope document is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/PROJECT.md
The legacy game specification is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/survey_spec_miner_1/legacy_game_spec.md

CRITICAL CONSTRAINT: Do NOT write source code. Explorer recommends fix and architecture strategy but does NOT implement.

YOUR TASK:
Milestone 2 focuses on Core Architecture & Simulation Engine (Team Lead domain).
Design the complete TypeScript architecture and specifications for Input Management and Spatial Partitioning:
1. `src/core/input/InputManager.ts` & `src/core/input/types.ts`:
   - Keyboard & mouse event listening with clean window attachment/teardown.
   - Action bindings: `moveUp`, `moveDown`, `moveLeft`, `moveRight`, `sprint`, `jump`, `dash`, `attack`, `skillQ` (spin), `skillE` (projectile), `potionHealth` (key 1), `potionSpeed` (key 2), `toggleTerminal` (backtick/tilde), `pause` (Escape).
   - Rebindable key configuration with default legacy mapping and localStorage save/load (`playerKeybinds`).
   - Query API: `isActionActive(action)`, `isActionJustPressed(action)`, `isActionJustReleased(action)`, `getMovementVector(): Vector2`, `getMousePosition(): Vector2`, `clearFrameState()`.
   - Headless testing simulation API: `simulateKeyDown(code)`, `simulateKeyUp(code)`, `simulateMouseMove(x, y)`.
2. `src/core/math/AABB.ts`:
   - Axis-Aligned Bounding Box class with `intersects(other)`, `containsPoint(point)`, `expand(margin)`, `center`, `min`, `max`.
3. `src/core/spatial/SpatialHashGrid.ts` & `src/core/spatial/types.ts`:
   - 2D Spatial Hash Grid with configurable cell size (e.g. 64px or 128px) for fast collision and entity proximity queries.
   - Methods: `insert(entity)`, `update(entity)`, `remove(entity)`, `queryAABB(bounds)`, `queryRadius(center, radius)`, `clear()`.
   - Handles multi-cell spanning entities without duplicate results (via unique Set or query ID tag).

DELIVERABLES:
- Write your comprehensive architecture specifications and code blueprints to `m2_input_spatial_spec.md` in your directory.
- Write `handoff.md` per Handoff Protocol.
- Update `progress.md`.
- Send message to orchestrator when done.
