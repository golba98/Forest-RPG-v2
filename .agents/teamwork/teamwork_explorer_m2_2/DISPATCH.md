## 2026-10-27T23:35:42Z
You are teamwork_explorer_m2_2, a teamwork_explorer subagent.
Your working directory is: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_2/
The original user request is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/ORIGINAL_REQUEST.md
The project scope document is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/PROJECT.md
The architecture survey is at: /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/survey_explorer_arch_1/architecture_and_assets_survey.md

CRITICAL CONSTRAINT: Do NOT write source code. Explorer recommends fix and architecture strategy but does NOT implement.

YOUR TASK:
Milestone 2 focuses on Core Architecture & Simulation Engine (Team Lead domain).
Design the complete TypeScript architecture and specifications for the Core Event Bus and Dependency Injection container:
1. `src/core/events/EventBus.ts` & `src/core/events/types.ts`:
   - Strongly-typed `GameEvents` interface dictionary mapping every game event to its typed payload:
     - Player events: `player:moved`, `player:attack`, `player:damaged`, `player:healed`, `player:staminaChanged`, `player:manaChanged`, `player:levelUp`, `player:coinCollected`, `player:potionUsed`, `player:died`.
     - Entity events: `entity:spawned`, `entity:damaged`, `entity:died`, `entity:crushed`.
     - World events: `world:generated`, `world:tileChanged`, `portal:activated`, `weather:changed`, `time:cycleTick`.
     - Combat events: `combat:projectileSpawned`, `combat:hit`, `combat:splat`.
     - UI events: `ui:menuToggled`, `ui:dialogShow`, `terminal:commandExecuted`.
   - Methods: `on<K>(event: K, handler: (payload: GameEvents[K]) => void): () => void` (returning unsubscribe callback), `off`, `emit<K>(event: K, payload: GameEvents[K]): void`, `once<K>(event: K, handler: (payload: GameEvents[K]) => void): () => void`, `clear(): void`.
   - Handler error boundary: wrapping callback execution in `try...catch` so an exception in an audio or visual listener does not crash the core game simulation.
2. `src/core/di/ServiceContainer.ts` & `src/core/di/types.ts`:
   - Lightweight, zero-dependency dependency injection container.
   - Token-based registration: `register<T>(token: ServiceToken<T>, factory: (container: ServiceContainer) => T, isSingleton?: boolean): void`.
   - `resolve<T>(token: ServiceToken<T>): T`.

DELIVERABLES:
- Write your comprehensive architecture specifications and code blueprints to `m2_events_di_spec.md` in your directory.
- Write `handoff.md` per Handoff Protocol.
- Update `progress.md`.
- Send message to orchestrator when done.
