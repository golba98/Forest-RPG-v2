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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly listeners: Map<string, Set<EventHandler<any>>> = new Map();

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
  ): Unsubscribe;
  public on(
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: EventHandler<any>
  ): Unsubscribe;
  public on(
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: EventHandler<any>
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
  ): void;
  public off(
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: EventHandler<any>
  ): void;
  public off(
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: EventHandler<any>
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
  public emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public emit(event: string, payload?: any): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public emit(event: string, payload?: any): void {
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
        this.errorHandler(err, event as keyof GameEvents, payload);
      }
    }
  }

  /**
   * Registers a one-time listener that auto-unsubscribes immediately before dispatch.
   */
  public once<K extends keyof GameEvents>(
    event: K,
    handler: EventHandler<GameEvents[K]>
  ): Unsubscribe;
  public once(
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: EventHandler<any>
  ): Unsubscribe;
  public once(
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: EventHandler<any>
  ): Unsubscribe {
    let unsubscribed = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapper: EventHandler<any> = (payload: any) => {
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
  public clear<K extends keyof GameEvents>(event?: K): void;
  public clear(event?: string): void;
  public clear(event?: string): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Counts active listeners.
   */
  public listenerCount<K extends keyof GameEvents>(event?: K): number;
  public listenerCount(event?: string): number;
  public listenerCount(event?: string): number {
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
  public hasListeners<K extends keyof GameEvents>(event: K): boolean;
  public hasListeners(event: string): boolean;
  public hasListeners(event: string): boolean {
    const handlers = this.listeners.get(event);
    return handlers !== undefined && handlers.size > 0;
  }
}
