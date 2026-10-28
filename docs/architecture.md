# Architecture

The Vite entry point composes the event bus, input manager, game, simulation, renderer, audio and DOM shell. `Game` owns scene transitions and a fixed-step loop; `IntentMapper` turns frame-based input into fixed-step intents. Gameplay is measured in tile units, while the renderer interpolates previous and current entity positions.

`src/types` defines the simulation and renderer boundaries. `src/world`, `src/systems`, `src/simulation` and `src/persistence` are headless; an ESLint restriction prevents them importing Pixi or UI code. The Pixi renderer consumes snapshots and does not decide combat, movement or portal rules. Menus, settings and the debug terminal use DOM overlays.

Generated world data, entities and runtime state can be saved locally. `window.__GAME__` is installed only in development or when the debug query parameter is enabled; its commands are for inspection, not an authentication boundary.
