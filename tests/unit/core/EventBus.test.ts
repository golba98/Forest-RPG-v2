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

    let unsub2: () => void = () => {};

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
