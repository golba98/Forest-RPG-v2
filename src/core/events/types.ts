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
    comboStep: number; // 1, 2, or 3 (critical finisher)
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
    intensity: number; // 0.0 to 1.0
  };

  'time:cycleTick': {
    timeOfDay: number; // 0.0 to 1.0 (0.0=Midnight, 0.25=Dawn, 0.5=Noon, 0.75=Dusk)
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
 * Handler callback signature for a specific event payload T.
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
