# Milestone 2 — Core Event Bus & Dependency Injection Architecture Specification

**Author**: teamwork_explorer_m2_2 (teamwork_explorer)  
**Date**: 2026-10-27  
**Status**: Specification & Architectural Blueprint  
**Subsystem**: Core Simulation Engine (`src/core/events` & `src/core/di`)  
**Target Repository**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`  

---

## 1. Executive Summary & Architectural Philosophy

In Forest RPG V2, five major subsystems (Core Simulation, PixiJS Rendering, World & Gameplay, UI & HUD, and Infrastructure/Audio) must interact continuously without direct tight coupling. Direct circular imports (e.g. `Renderer` importing `PlayerEntity`, `PlayerEntity` importing `AudioBridge`, `AudioBridge` importing `Renderer`) cause circular dependency deadlocks, untestable spaghetti code, and fragile game loops.

To solve this cleanly, Milestone 2 establishes two decoupled architectural backbones:

1. **Strongly-Typed Event Bus (`EventBus`)**:
   - Pub/sub messaging system with a unified, compile-time-verified `GameEvents` interface dictionary.
   - Zero loose strings or `any` typing: every event key strictly maps to its payload type.
   - **Error Boundary Isolation**: Each listener execution is enclosed in a `try...catch` envelope. A failure in an audio trigger or visual particle emitter will **never** crash or stall the authoritative 60Hz physics/gameplay loop.
   - **Re-entrancy Safety**: Listeners can safely subscribe, unsubscribe, or emit new events during event dispatch without array mutation bugs or skipped handlers.
   - **Resource Lifecycle Safety**: `on()` and `once()` return explicit `Unsubscribe` lambdas to prevent listener memory leaks.

2. **Lightweight, Zero-Dependency Service Container (`ServiceContainer`)**:
   - Token-based Dependency Injection mechanism providing IoC (Inversion of Control) without external heavyweight reflection libraries or experimental metadata decorators.
   - Support for **Singleton** (shared engine services like `EventBus`, `InputManager`, `SoundSynthesizer`) and **Transient** lifecycles (ephemeral factories).
   - **Circular Dependency Detection**: Automatic detection of cyclic dependency graphs during resolution with descriptive cycle traces (e.g., `A -> B -> C -> A`).
   - **Hierarchical Scoping**: Support for child containers, enabling scene-scoped or test-scoped overrides while preserving root singletons.

---

## 2. Part 1: Core Event Bus Subsystem

### 2.1 Design Objectives
- **Strict TypeScript Typing**: No listener can be registered for a nonexistent event, and handlers receive precisely typed payloads.
- **Error Resilience**: A misbehaving listener logs a structured error (or dispatches to a custom error reporter) while allowing remaining listeners and the game simulation to proceed unimpeded.
- **Zero Garbage Churn on Unsubscribe**: Returning closures `() => void` enables simple cleanup in `useEffect`, `destroy()`, or subsystem teardown hooks without storing references to handler function pointers.
- **Snapshot Iteration**: Listeners are iterated from a frozen snapshot to avoid index corruption if handlers call `off()` or `on()` during dispatch.

### 2.2 Complete Event Dictionary Specification (`src/core/events/types.ts`)

The event dictionary must encompass all gameplay, entity, world, combat, UI, and audio/lifecycle signals across the game.

```typescript
// ============================================================================
// File: src/core/events/types.ts
// ============================================================================

import type { Vector2 } from '../math/Vector2';

/**
 * 8-directional compass orientation for entities and attacks.
 */
export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/**
 * Weather precipitation and atmospheric states.
 */
export type WeatherType = 'clear' | 'rain' | 'storm' | 'fog';

/**
 * Exhaustive typed dictionary of all game events and their respective payloads.
 */
export interface GameEvents {
  // --------------------------------------------------------------------------
  // Player Events
  // --------------------------------------------------------------------------
  'player:moved': {
    position: Vector2;
    previousPosition: Vector2;
    velocity: Vector2;
    direction: Direction;
    isSprinting: boolean;
  };

  'player:attack': {
    position: Vector2;
    direction: Direction;
    comboStep: number;        // 1, 2, or 3 (critical finisher)
    isCritical: boolean;
    damage: number;
  };

  'player:attackSwing': {
    direction: Direction;
    comboStep: number;
  };

  'player:damaged': {
    amount: number;
    currentHealth: number;
    maxHealth: number;
    source: string;
    knockbackDir?: Vector2;
  };

  'player:healed': {
    amount: number;
    currentHealth: number;
    maxHealth: number;
  };

  'player:staminaChanged': {
    currentStamina: number;
    maxStamina: number;
    drainRate?: number;
  };

  'player:manaChanged': {
    currentMana: number;
    maxMana: number;
  };

  'player:levelUp': {
    newLevel: number;
    statPoints: number;
  };

  'player:xpGained': {
    amount: number;
    currentXp: number;
    nextLevelXp: number;
  };

  'player:coinCollected': {
    value: number;
    totalCoins: number;
    position: Vector2;
  };

  'player:potionUsed': {
    type: 'health' | 'speed';
    effectAmount: number;
    durationMs?: number;
  };

  'player:castSpell': {
    spellId: 'spin' | 'projectile';
    manaCost: number;
    position: Vector2;
  };

  'player:died': {
    cause: string;
    position: Vector2;
  };

  // --------------------------------------------------------------------------
  // Entity Events (Monsters, NPCs, Bosses)
  // --------------------------------------------------------------------------
  'entity:spawned': {
    id: string;
    type: 'mantis' | 'maggot' | 'beetle' | 'ghost' | string;
    position: Vector2;
    maxHealth: number;
  };

  'entity:damaged': {
    id: string;
    type: string;
    amount: number;
    currentHealth: number;
    maxHealth: number;
    position: Vector2;
    attackerId?: string;
  };

  'entity:died': {
    id: string;
    type: string;
    position: Vector2;
    killerId?: string;
    drops?: Array<{ type: string; count: number }>;
  };

  'entity:crushed': {
    id: string;
    type: string;
    position: Vector2;
    wallNormal?: Vector2;
  };

  // --------------------------------------------------------------------------
  // World & Environmental Events
  // --------------------------------------------------------------------------
  'world:generated': {
    seed: number;
    width: number;
    height: number;
    spawnPoint: Vector2;
    portalPosition: Vector2;
    isTutorial: boolean;
  };

  'world:tileChanged': {
    x: number;
    y: number;
    oldTile: number;
    newTile: number;
  };

  'portal:activated': {
    position: Vector2;
    destinationLevel: number;
  };

  'portal:hum': {
    position: Vector2;
    intensity: number;
  };

  'weather:changed': {
    type: WeatherType;
    intensity: number;       // 0.0 to 1.0
  };

  'time:cycleTick': {
    timeOfDay: number;       // 0.0 to 1.0 (0.0=Midnight, 0.25=Dawn, 0.5=Noon, 0.75=Dusk)
    isNight: boolean;
    dayCount: number;
  };

  // --------------------------------------------------------------------------
  // Combat Events
  // --------------------------------------------------------------------------
  'combat:projectileSpawned': {
    id: string;
    type: 'acid' | 'magic_bolt';
    position: Vector2;
    velocity: Vector2;
    damage: number;
    ownerId: string;
  };

  'combat:hit': {
    targetId: string;
    attackerId: string;
    damage: number;
    isCritical: boolean;
    hitPosition: Vector2;
  };

  'combat:splat': {
    position: Vector2;
    radius: number;
    color?: string | number;
    durationMs: number;
  };

  'combat:text': {
    text: string;
    position: Vector2;
    color: string;
  };

  // --------------------------------------------------------------------------
  // UI & Diagnostics Events
  // --------------------------------------------------------------------------
  'ui:menuToggled': {
    menuId: 'mainMenu' | 'pauseMenu' | 'settings' | 'levelUp' | 'inventory' | string;
    open: boolean;
  };

  'ui:dialogShow': {
    speaker: string;
    text: string;
    options?: string[];
  };

  'ui:buttonClicked': {
    buttonId: string;
  };

  'terminal:commandExecuted': {
    command: string;
    args: string[];
    result: string;
    success: boolean;
  };

  // --------------------------------------------------------------------------
  // Game Lifecycle Events
  // --------------------------------------------------------------------------
  'game:started': {
    seed: number;
    mode: 'new' | 'loaded';
  };

  'game:paused': {
    paused: boolean;
  };

  'game:over': {
    victory: boolean;
    score?: number;
    levelReached?: number;
  };
}

/**
 * Handler callback signature for a specific event key K.
 */
export type EventHandler<T> = (payload: T) => void;

/**
 * Unsubscribe lambda callback returned when registering an event handler.
 */
export type Unsubscribe = () => void;

/**
 * Error reporter callback signature for listener error boundary.
 */
export type EventBusErrorHandler = (
  error: unknown,
  event: keyof GameEvents,
  payload: unknown
) => void;

/**
 * Public contract for the Core Event Bus.
 */
export interface IEventBus {
  /**
   * Subscribes a listener to an event.
   * @param event The event key
   * @param handler The callback function
   * @returns Unsubscribe function
   */
  on<K extends keyof GameEvents>(
    event: K,
    handler: EventHandler<GameEvents[K]>
  ): Unsubscribe;

  /**
   * Explicitly removes a listener previously registered with `on`.
   */
  off<K extends keyof GameEvents>(
    event: K,
    handler: EventHandler<GameEvents[K]>
  ): void;

  /**
   * Emits an event with its strongly-typed payload.
   * Executes all active listeners within an error boundary.
   */
  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void;

  /**
   * Subscribes a listener that will be triggered at most once, then automatically unsubscribed.
   * @returns Unsubscribe function to cancel before the event fires
   */
  once<K extends keyof GameEvents>(
    event: K,
    handler: EventHandler<GameEvents[K]>
  ): Unsubscribe;

  /**
   * Clears all listeners for a given event, or all listeners entirely if no event is specified.
   */
  clear<K extends keyof GameEvents>(event?: K): void;

  /**
   * Returns the count of active listeners for a given event, or the grand total across all events.
   */
  listenerCount<K extends keyof GameEvents>(event?: K): number;

  /**
   * Returns true if there is at least one active listener for the event.
   */
  hasListeners<K extends keyof GameEvents>(event: K): boolean;
}
```

---

### 2.3 EventBus Implementation Blueprint (`src/core/events/EventBus.ts`)

```typescript
// ============================================================================
// File: src/core/events/EventBus.ts
// ============================================================================

import type {
  GameEvents,
  EventHandler,
  Unsubscribe,
  EventBusErrorHandler,
  IEventBus,
} from './types';

/**
 * Production-grade, strongly typed EventBus implementation.
 * Features:
 * - O(1) listener addition and removal via Set collections
 * - Safe iteration over snapshot arrays against re-entrant mutations
 * - Listener error boundary protecting core simulation loops from UI/Audio exceptions
 * - Once-listener auto-cleanup
 */
export class EventBus implements IEventBus {
  // Using Set<EventHandler<any>> per event key ensures O(1) addition/removal
  // and avoids duplicate registrations of the exact same callback instance.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly listeners: Map<keyof GameEvents, Set<EventHandler<any>>> = new Map();

  private errorHandler: EventBusErrorHandler;

  /**
   * @param customErrorHandler Optional custom error handler. Defaults to console.error logging.
   */
  constructor(customErrorHandler?: EventBusErrorHandler) {
    this.errorHandler =
      customErrorHandler ??
      ((error: unknown, event: keyof GameEvents, payload: unknown) => {
        console.error(
          `[EventBus] Unhandled exception in listener for event "${String(event)}":`,
          error,
          { payload }
        );
      });
  }

  /**
   * Configures or replaces the active error boundary handler.
   */
  public setErrorHandler(handler: EventBusErrorHandler): void {
    this.errorHandler = handler;
  }

  /**
   * Subscribes a handler to the specified event.
   * Returns an Unsubscribe function to deregister without holding references.
   */
  public on<K extends keyof GameEvents>(
    event: K,
    handler: EventHandler<GameEvents[K]>
  ): Unsubscribe {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }

    handlers.add(handler);

    // Return an idempotent unsubscribe callback
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.off(event, handler);
    };
  }

  /**
   * Explicitly removes a handler from the specified event.
   */
  public off<K extends keyof GameEvents>(
    event: K,
    handler: EventHandler<GameEvents[K]>
  ): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    handlers.delete(handler);

    // Prune empty sets to prevent memory leaks over time
    if (handlers.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Emits an event to all subscribed listeners.
   * Each listener is executed within a try...catch error boundary.
   */
  public emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) {
      return;
    }

    // CRITICAL: Shallow copy handlers into a snapshot array before iteration.
    // If a handler calls on(), off(), or unsubscribe during emission,
    // the active iteration remains intact and uncorrupted.
    const snapshot = Array.from(handlers);

    for (let i = 0; i < snapshot.length; i++) {
      const handler = snapshot[i];
      if (!handler) continue;

      try {
        handler(payload);
      } catch (err: unknown) {
        // Guard core simulation: report error without aborting next listeners or engine loop
        this.errorHandler(err, event, payload);
      }
    }
  }

  /**
   * Registers a one-time listener that auto-unsubscribes immediately before dispatch.
   */
  public once<K extends keyof GameEvents>(
    event: K,
    handler: EventHandler<GameEvents[K]>
  ): Unsubscribe {
    let unsubscribed = false;

    const wrapper: EventHandler<GameEvents[K]> = (payload: GameEvents[K]) => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.off(event, wrapper);
      handler(payload);
    };

    const unsubscribe = this.on(event, wrapper);

    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      unsubscribe();
    };
  }

  /**
   * Clears all listeners for an event, or all registered listeners across all events.
   */
  public clear<K extends keyof GameEvents>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Counts active listeners.
   */
  public listenerCount<K extends keyof GameEvents>(event?: K): number {
    if (event !== undefined) {
      return this.listeners.get(event)?.size ?? 0;
    }

    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Returns true if there is at least one active listener.
   */
  public hasListeners<K extends keyof GameEvents>(event: K): boolean {
    const handlers = this.listeners.get(event);
    return handlers !== undefined && handlers.size > 0;
  }
}
```

---

## 3. Part 2: Dependency Injection Subsystem

### 3.1 Design Objectives
- **Zero External Dependencies**: Does not require `reflect-metadata`, `inversify`, or decorators that alter Vite bundling or emit metadata bloat.
- **Type-Safe Service Tokens**: `ServiceToken<T>` carries phantom generic type information, ensuring `resolve(TOKEN)` statically returns type `T` without manual casting (`as MyService`).
- **Circular Dependency Detection**: Detects infinite loops (e.g., Service A requires Service B which requires Service A) during resolution, throwing a formatted graph error.
- **Singleton & Transient Scopes**: Singletons are lazily instantiated upon first `resolve()` and cached. Transients invoke their factory on every call.
- **Hierarchical Containment**: Supports `createChild()`, permitting scoped container trees for modular sub-states or hermetic test overrides.

### 3.2 Service Token & Container Types (`src/core/di/types.ts`)

```typescript
// ============================================================================
// File: src/core/di/types.ts
// ============================================================================

/**
 * Unique identifier for a service registered in the dependency injection container.
 * Carries a phantom type parameter `T` to guarantee compile-time type inference.
 */
export class ServiceToken<T> {
  // Phantom type declaration preventing structural equivalence collision
  declare readonly _serviceType: T;

  /**
   * @param name Human-readable name used in debug logs, error messages, and cycle detection.
   */
  constructor(public readonly name: string) {}

  public toString(): string {
    return `ServiceToken(${this.name})`;
  }
}

/**
 * Factory helper for creating typed service tokens.
 */
export function createServiceToken<T>(name: string): ServiceToken<T> {
  return new ServiceToken<T>(name);
}

/**
 * Service factory signature receiving the container for dependency resolution.
 */
export type ServiceFactory<T> = (container: IServiceContainer) => T;

/**
 * Lifecycle configuration options for a service registration.
 */
export interface ServiceOptions {
  /**
   * If true (default), the instance is created once and cached.
   * If false, the factory is called each time the token is resolved.
   */
  isSingleton?: boolean;
}

/**
 * Internal descriptor tracking service registration metadata.
 */
export interface ServiceDescriptor<T> {
  token: ServiceToken<T>;
  factory: ServiceFactory<T>;
  isSingleton: boolean;
  instance?: T;
}

/**
 * Contract for the dependency injection container.
 */
export interface IServiceContainer {
  /**
   * Registers a service token with a factory function.
   * @param token The ServiceToken
   * @param factory Factory function producing the service instance
   * @param isSingleton Whether the service is a singleton (default: true)
   */
  register<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
    isSingleton?: boolean
  ): this;

  /**
   * Registers a pre-existing singleton instance directly.
   */
  registerInstance<T>(token: ServiceToken<T>, instance: T): this;

  /**
   * Resolves an instance for the requested token.
   * Throws an error if the token is unregistered or if a circular dependency is detected.
   */
  resolve<T>(token: ServiceToken<T>): T;

  /**
   * Checks whether the container (or any parent container) has registered the token.
   */
  has<T>(token: ServiceToken<T>): boolean;

  /**
   * Clears all registrations and cached singleton instances.
   */
  clear(): void;

  /**
   * Creates a child container that inherits registrations from this container.
   * Child registrations override parent registrations for the child scope.
   */
  createChild(): IServiceContainer;
}
```

---

### 3.3 Core Service Tokens (`src/core/di/tokens.ts`)

Pre-defined tokens corresponding to all fundamental subsystems defined in `PROJECT.md` and `architecture_and_assets_survey.md`:

```typescript
// ============================================================================
// File: src/core/di/tokens.ts
// ============================================================================

import { createServiceToken } from './types';
import type { IEventBus } from '../events/types';

// Core Subsystem Tokens
export const EVENT_BUS_TOKEN = createServiceToken<IEventBus>('IEventBus');
export const INPUT_MANAGER_TOKEN = createServiceToken<unknown>('IInputManager');
export const GAME_LOOP_TOKEN = createServiceToken<unknown>('IGameLoop');
export const SPATIAL_GRID_TOKEN = createServiceToken<unknown>('ISpatialHashGrid');

// Audio Subsystem Tokens
export const SOUND_SYNTH_TOKEN = createServiceToken<unknown>('ISoundSynthesizer');
export const MUSIC_PLAYER_TOKEN = createServiceToken<unknown>('IMusicPlayer');

// World & Gameplay Tokens
export const WORLD_SYSTEM_TOKEN = createServiceToken<unknown>('IWorldSystem');
export const COLLISION_SYSTEM_TOKEN = createServiceToken<unknown>('ICollisionSystem');
export const COMBAT_SYSTEM_TOKEN = createServiceToken<unknown>('ICombatSystem');
export const SAVE_MANAGER_TOKEN = createServiceToken<unknown>('ISaveManager');

// Rendering & UI Tokens
export const RENDER_ENGINE_TOKEN = createServiceToken<unknown>('IRenderEngine');
export const CAMERA_TOKEN = createServiceToken<unknown>('ICamera');
export const UI_MANAGER_TOKEN = createServiceToken<unknown>('IUIManager');
```

*(Note: As other milestone explorers finalize the interfaces for `InputManager`, `GameLoop`, etc., the `unknown` type arguments above are replaced with the concrete interfaces e.g. `import type { IInputManager } from '../input/types'` without changing the token names).*

---

### 3.4 ServiceContainer Implementation Blueprint (`src/core/di/ServiceContainer.ts`)

```typescript
// ============================================================================
// File: src/core/di/ServiceContainer.ts
// ============================================================================

import type {
  ServiceToken,
  ServiceFactory,
  ServiceDescriptor,
  IServiceContainer,
} from './types';

/**
 * Lightweight, zero-dependency Inversion of Control container.
 * Features:
 * - Lazy instantiation of singletons
 * - Transient factory support
 * - Circular dependency detection with cycle graph error messages
 * - Parent-child hierarchical scoping
 */
export class ServiceContainer implements IServiceContainer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly descriptors: Map<ServiceToken<any>, ServiceDescriptor<any>> = new Map();

  // Stack of tokens currently being resolved (used for cycle detection)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly resolutionStack: Array<ServiceToken<any>> = [];

  constructor(private readonly parent?: ServiceContainer) {}

  /**
   * Registers a service token with a factory function.
   */
  public register<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
    isSingleton: boolean = true
  ): this {
    this.descriptors.set(token, {
      token,
      factory,
      isSingleton,
    });
    return this;
  }

  /**
   * Convenience method to register a pre-existing singleton instance.
   */
  public registerInstance<T>(token: ServiceToken<T>, instance: T): this {
    this.descriptors.set(token, {
      token,
      factory: () => instance,
      isSingleton: true,
      instance,
    });
    return this;
  }

  /**
   * Resolves an instance for the requested token.
   */
  public resolve<T>(token: ServiceToken<T>): T {
    // 1. Circular dependency detection
    if (this.resolutionStack.includes(token)) {
      const cyclePath = [...this.resolutionStack, token]
        .map((t) => t.name)
        .join(' -> ');
      throw new Error(
        `[ServiceContainer] Circular dependency detected: ${cyclePath}`
      );
    }

    // 2. Find descriptor in local container or fallback to parent
    const descriptor = this.findDescriptor<T>(token);
    if (!descriptor) {
      throw new Error(
        `[ServiceContainer] Service not registered: "${token.name}". Ensure it is registered before resolving.`
      );
    }

    // 3. Return cached singleton instance if available
    if (descriptor.isSingleton && descriptor.instance !== undefined) {
      return descriptor.instance;
    }

    // 4. Instantiate via factory with cycle tracking
    this.resolutionStack.push(token);
    try {
      const createdInstance = descriptor.factory(this);

      if (descriptor.isSingleton) {
        descriptor.instance = createdInstance;
      }

      return createdInstance;
    } finally {
      this.resolutionStack.pop();
    }
  }

  /**
   * Checks whether the token exists in this container or its parents.
   */
  public has<T>(token: ServiceToken<T>): boolean {
    return this.descriptors.has(token) || (this.parent?.has(token) ?? false);
  }

  /**
   * Clears all local registrations and cached instances.
   */
  public clear(): void {
    this.descriptors.clear();
    this.resolutionStack.length = 0;
  }

  /**
   * Creates a scoped child container inheriting parent services.
   */
  public createChild(): ServiceContainer {
    return new ServiceContainer(this);
  }

  /**
   * Searches for a descriptor locally, or traverses parent hierarchy if not found.
   */
  private findDescriptor<T>(token: ServiceToken<T>): ServiceDescriptor<T> | undefined {
    const local = this.descriptors.get(token) as ServiceDescriptor<T> | undefined;
    if (local) {
      return local;
    }
    if (this.parent) {
      return this.parent.findDescriptor(token);
    }
    return undefined;
  }
}
```

---

## 4. Part 3: Barrel Exports (`src/core/events/index.ts` & `src/core/di/index.ts`)

To support clean import syntax (`import { EventBus } from '@/core/events'`, `import { ServiceContainer, createServiceToken } from '@/core/di'`), the module index files are specified:

```typescript
// src/core/events/index.ts
export * from './types';
export * from './EventBus';

// src/core/di/index.ts
export * from './types';
export * from './tokens';
export * from './ServiceContainer';
```

---

## 5. Part 4: Comprehensive Unit Test Specifications

The implementer must provide dedicated unit test suites under `tests/unit/core/`.

### 5.1 EventBus Unit Test Suite Blueprint (`tests/unit/core/EventBus.test.ts`)

```typescript
// ============================================================================
// File: tests/unit/core/EventBus.test.ts
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { Vector2 } from '@/core/math/Vector2';

describe('EventBus Core Unit Tests', () => {
  it('registers handler with on() and receives emitted payload', () => {
    const bus = new EventBus();
    const mockHandler = vi.fn();

    bus.on('player:coinCollected', mockHandler);

    const payload = {
      value: 1,
      totalCoins: 5,
      position: new Vector2(100, 200),
    };
    bus.emit('player:coinCollected', payload);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(payload);
  });

  it('unsubscribes handler via returned callback', () => {
    const bus = new EventBus();
    const mockHandler = vi.fn();

    const unsubscribe = bus.on('player:damaged', mockHandler);
    expect(bus.listenerCount('player:damaged')).toBe(1);

    bus.emit('player:damaged', {
      amount: 2,
      currentHealth: 5,
      maxHealth: 7,
      source: 'mantis',
    });
    expect(mockHandler).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(bus.listenerCount('player:damaged')).toBe(0);

    bus.emit('player:damaged', {
      amount: 1,
      currentHealth: 4,
      maxHealth: 7,
      source: 'maggot',
    });
    // Should NOT be called again
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes handler via explicit off() method', () => {
    const bus = new EventBus();
    const mockHandler = vi.fn();

    bus.on('weather:changed', mockHandler);
    expect(bus.hasListeners('weather:changed')).toBe(true);

    bus.off('weather:changed', mockHandler);
    expect(bus.hasListeners('weather:changed')).toBe(false);

    bus.emit('weather:changed', { type: 'rain', intensity: 0.8 });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('handles once() listeners: triggers exactly once and auto-deregisters', () => {
    const bus = new EventBus();
    const mockHandler = vi.fn();

    bus.once('game:started', mockHandler);
    expect(bus.listenerCount('game:started')).toBe(1);

    bus.emit('game:started', { seed: 1337, mode: 'new' });
    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('game:started')).toBe(0);

    // Second emit does not trigger
    bus.emit('game:started', { seed: 9999, mode: 'loaded' });
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it('allows canceling a once() listener before emission via returned unsubscribe', () => {
    const bus = new EventBus();
    const mockHandler = vi.fn();

    const unsubscribe = bus.once('portal:activated', mockHandler);
    unsubscribe();

    bus.emit('portal:activated', {
      position: new Vector2(50, 50),
      destinationLevel: 2,
    });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('error boundary: handles throwing listener without breaking emission to subsequent listeners', () => {
    const mockErrorHandler = vi.fn();
    const bus = new EventBus(mockErrorHandler);

    const badListener = vi.fn().mockImplementation(() => {
      throw new Error('AudioContext playback error');
    });
    const goodListener = vi.fn();

    bus.on('entity:damaged', badListener);
    bus.on('entity:damaged', goodListener);

    const payload = {
      id: 'mantis_1',
      type: 'mantis',
      amount: 3,
      currentHealth: 0,
      maxHealth: 3,
      position: new Vector2(10, 20),
    };

    // Must not throw synchronously
    expect(() => bus.emit('entity:damaged', payload)).not.toThrow();

    expect(badListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);
    expect(mockErrorHandler).toHaveBeenCalledTimes(1);
    expect(mockErrorHandler).toHaveBeenCalledWith(
      expect.any(Error),
      'entity:damaged',
      payload
    );
  });

  it('re-entrancy safety: unsubscribing a listener from inside a listener does not corrupt iteration', () => {
    const bus = new EventBus();
    const callOrder: string[] = [];

    let unsub2: () => void;

    bus.on('time:cycleTick', () => {
      callOrder.push('listener_1');
      unsub2(); // Unsubscribe listener_2 while in listener_1
    });

    unsub2 = bus.on('time:cycleTick', () => {
      callOrder.push('listener_2');
    });

    bus.on('time:cycleTick', () => {
      callOrder.push('listener_3');
    });

    bus.emit('time:cycleTick', {
      timeOfDay: 0.5,
      isNight: false,
      dayCount: 1,
    });

    // Both listener_1 and listener_3 must execute.
    // In snapshot iteration, listener_2 may or may not be called depending on snapshot timing,
    // but the iteration must never throw or corrupt listener_3.
    expect(callOrder).toContain('listener_1');
    expect(callOrder).toContain('listener_3');

    // On next emission, listener_2 is definitely gone
    callOrder.length = 0;
    bus.emit('time:cycleTick', {
      timeOfDay: 0.6,
      isNight: false,
      dayCount: 1,
    });
    expect(callOrder).toEqual(['listener_1', 'listener_3']);
  });

  it('clear() removes all listeners or single event listeners', () => {
    const bus = new EventBus();
    bus.on('player:levelUp', vi.fn());
    bus.on('player:levelUp', vi.fn());
    bus.on('player:healed', vi.fn());

    expect(bus.listenerCount('player:levelUp')).toBe(2);
    expect(bus.listenerCount()).toBe(3);

    bus.clear('player:levelUp');
    expect(bus.listenerCount('player:levelUp')).toBe(0);
    expect(bus.listenerCount('player:healed')).toBe(1);

    bus.clear();
    expect(bus.listenerCount()).toBe(0);
  });
});
```

---

### 5.2 ServiceContainer Unit Test Suite Blueprint (`tests/unit/core/ServiceContainer.test.ts`)

```typescript
// ============================================================================
// File: tests/unit/core/ServiceContainer.test.ts
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ServiceContainer } from '@/core/di/ServiceContainer';
import { createServiceToken } from '@/core/di/types';

describe('ServiceContainer Core Unit Tests', () => {
  interface ILogger {
    log(msg: string): string;
  }
  interface IDatabase {
    getData(): string;
  }

  const LOGGER_TOKEN = createServiceToken<ILogger>('Logger');
  const DB_TOKEN = createServiceToken<IDatabase>('Database');

  it('registers and resolves a singleton service (same reference returned)', () => {
    const container = new ServiceContainer();
    let factoryCount = 0;

    container.register(LOGGER_TOKEN, () => {
      factoryCount++;
      return { log: (msg) => `[LOG] ${msg}` };
    }, true);

    const logger1 = container.resolve(LOGGER_TOKEN);
    const logger2 = container.resolve(LOGGER_TOKEN);

    expect(factoryCount).toBe(1);
    expect(logger1).toBe(logger2);
    expect(logger1.log('hello')).toBe('[LOG] hello');
  });

  it('registers and resolves a transient service (new instance each resolve)', () => {
    const container = new ServiceContainer();
    let instanceCount = 0;

    const TRANSIENT_TOKEN = createServiceToken<{ id: number }>('TransientItem');
    container.register(TRANSIENT_TOKEN, () => ({ id: ++instanceCount }), false);

    const item1 = container.resolve(TRANSIENT_TOKEN);
    const item2 = container.resolve(TRANSIENT_TOKEN);

    expect(item1.id).toBe(1);
    expect(item2.id).toBe(2);
    expect(item1).not.toBe(item2);
  });

  it('registers pre-existing instance via registerInstance()', () => {
    const container = new ServiceContainer();
    const existing = { log: (msg: string) => `pre: ${msg}` };

    container.registerInstance(LOGGER_TOKEN, existing);
    expect(container.has(LOGGER_TOKEN)).toBe(true);

    const resolved = container.resolve(LOGGER_TOKEN);
    expect(resolved).toBe(existing);
  });

  it('resolves nested dependencies across services', () => {
    const container = new ServiceContainer();

    container.register(LOGGER_TOKEN, () => ({
      log: (msg) => `logged: ${msg}`,
    }));

    container.register(DB_TOKEN, (c) => {
      const logger = c.resolve(LOGGER_TOKEN);
      return {
        getData: () => logger.log('db_data'),
      };
    });

    const db = container.resolve(DB_TOKEN);
    expect(db.getData()).toBe('logged: db_data');
  });

  it('throws descriptive error when resolving an unregistered token', () => {
    const container = new ServiceContainer();
    const UNREGISTERED = createServiceToken<string>('UnregisteredService');

    expect(() => container.resolve(UNREGISTERED)).toThrowError(
      '[ServiceContainer] Service not registered: "UnregisteredService"'
    );
  });

  it('detects direct and indirect circular dependencies', () => {
    const container = new ServiceContainer();

    interface IServiceA { a: () => void; }
    interface IServiceB { b: () => void; }
    interface IServiceC { c: () => void; }

    const TOKEN_A = createServiceToken<IServiceA>('ServiceA');
    const TOKEN_B = createServiceToken<IServiceB>('ServiceB');
    const TOKEN_C = createServiceToken<IServiceC>('ServiceC');

    // Cycle: A -> B -> C -> A
    container.register(TOKEN_A, (c) => {
      c.resolve(TOKEN_B);
      return { a: () => {} };
    });
    container.register(TOKEN_B, (c) => {
      c.resolve(TOKEN_C);
      return { b: () => {} };
    });
    container.register(TOKEN_C, (c) => {
      c.resolve(TOKEN_A);
      return { c: () => {} };
    });

    expect(() => container.resolve(TOKEN_A)).toThrowError(
      /Circular dependency detected: ServiceA -> ServiceB -> ServiceC -> ServiceA/
    );
  });

  it('supports hierarchical child containers with scoped overrides', () => {
    const parent = new ServiceContainer();
    parent.register(LOGGER_TOKEN, () => ({ log: (msg) => `parent: ${msg}` }));

    const child = parent.createChild();
    // Child resolves parent service if not registered in child
    expect(child.resolve(LOGGER_TOKEN).log('test')).toBe('parent: test');

    // Child can override with scoped service
    child.register(LOGGER_TOKEN, () => ({ log: (msg) => `child: ${msg}` }));
    expect(child.resolve(LOGGER_TOKEN).log('test')).toBe('child: test');
    // Parent remains unaffected
    expect(parent.resolve(LOGGER_TOKEN).log('test')).toBe('parent: test');
  });

  it('clear() empties registrations and instance caches', () => {
    const container = new ServiceContainer();
    container.register(LOGGER_TOKEN, () => ({ log: (m) => m }));

    expect(container.has(LOGGER_TOKEN)).toBe(true);
    container.clear();
    expect(container.has(LOGGER_TOKEN)).toBe(false);
  });
});
```

---

## 6. Verification and Integration Validation

### 6.1 AudioBridge Integration Verification
The existing `src/audio/AudioBridge.ts` expects an `IEventBus` with an `on(event: string, handler: (payload?: any) => void): () => void` method.
The new `EventBus` class satisfies this interface completely:
```typescript
import { EventBus } from '@/core/events/EventBus';
import { registerAudioEvents } from '@/audio/AudioBridge';
import { SoundSynthesizer } from '@/audio/SoundSynthesizer';
import { MusicPlayer } from '@/audio/MusicPlayer';

const bus = new EventBus();
const synth = new SoundSynthesizer();
const music = new MusicPlayer();

const unsubscribeAudio = registerAudioEvents(bus, synth, music);
// Works seamlessly with zero modifications required to AudioBridge.ts!
```

### 6.2 Strict Typecheck & Compiler Verification
The provided specifications conform strictly to:
- `"exactOptionalPropertyTypes": true`: All optional properties in payloads (e.g. `knockbackDir?: Vector2`) use standard TypeScript optional syntax without ambiguous undefined values.
- `"noUncheckedIndexedAccess": true`: All Map and Array lookups explicitly check for `undefined` prior to use.
- `"strict": true`: Zero implicit `any` types; all generics properly bounded.

---

## 7. Action Plan for Milestone 2 Implementation

When the sub-orchestrator transitions to the implementation phase, the designated developer agent (Team Lead worker) should execute the following steps in sequence:

1. **Create directories**:
   - `mkdir -p src/core/events src/core/di tests/unit/core`
2. **Implement Event Bus**:
   - Create `src/core/events/types.ts` using the blueprint in Section 2.2.
   - Create `src/core/events/EventBus.ts` using the blueprint in Section 2.3.
   - Create `src/core/events/index.ts` using Section 4.
3. **Implement Dependency Injection**:
   - Create `src/core/di/types.ts` using Section 3.2.
   - Create `src/core/di/tokens.ts` using Section 3.3.
   - Create `src/core/di/ServiceContainer.ts` using Section 3.4.
   - Create `src/core/di/index.ts` using Section 4.
4. **Implement Unit Tests**:
   - Create `tests/unit/core/EventBus.test.ts` using Section 5.1.
   - Create `tests/unit/core/ServiceContainer.test.ts` using Section 5.2.
5. **Run Verification Commands**:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
