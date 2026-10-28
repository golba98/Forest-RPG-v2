import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputManager } from '@/core/input/InputManager';
import { Vector2 } from '@/core/math/Vector2';

describe('InputManager Unit Tests', () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
  });

  it('detects active, just pressed, and just released key events', () => {
    expect(input.isActionActive('moveUp')).toBe(false);
    expect(input.isActionJustPressed('moveUp')).toBe(false);

    input.simulateKeyDown('KeyW');
    expect(input.isActionActive('moveUp')).toBe(true);
    expect(input.isActionJustPressed('moveUp')).toBe(true);

    // Frame end clears rising edge
    input.clearFrameState();
    expect(input.isActionActive('moveUp')).toBe(true);
    expect(input.isActionJustPressed('moveUp')).toBe(false);

    // Key up creates falling edge
    input.simulateKeyUp('KeyW');
    expect(input.isActionActive('moveUp')).toBe(false);
    expect(input.isActionJustReleased('moveUp')).toBe(true);

    input.clearFrameState();
    expect(input.isActionJustReleased('moveUp')).toBe(false);
  });

  it('calculates normalized 8-directional movement vectors', () => {
    expect(input.getMovementVector()).toEqual(new Vector2(0, 0));

    input.simulateKeyDown('KeyD');
    expect(input.getMovementVector()).toEqual(new Vector2(1, 0));

    // Diagonal movement (D + S) must be normalized
    input.simulateKeyDown('KeyS');
    const diag = input.getMovementVector();
    expect(diag.x).toBeCloseTo(Math.SQRT1_2, 4);
    expect(diag.y).toBeCloseTo(Math.SQRT1_2, 4);

    // Opposing keys cancel out
    input.simulateKeyDown('KeyA');
    expect(input.getMovementVector()).toEqual(new Vector2(0, 1));
  });

  it('handles legacy numeric keyCodes seamlessly', () => {
    // 87 = W, 83 = S, 65 = A, 68 = D, 32 = Space
    input.simulateKeyDown(87);
    expect(input.isActionActive('moveUp')).toBe(true);

    input.simulateKeyDown(32);
    expect(input.isActionActive('jump')).toBe(true);
  });

  it('handles mouse button attacks and mouse coordinates', () => {
    input.simulateMouseMove(250, 180);
    expect(input.getMousePosition()).toEqual(new Vector2(250, 180));
    expect(input.getMouseDelta()).toEqual(new Vector2(250, 180));

    input.clearFrameState();
    expect(input.getMouseDelta()).toEqual(new Vector2(0, 0));

    input.simulateMouseDown(0); // Left Click
    expect(input.isActionActive('attack')).toBe(true);
    expect(input.isActionJustPressed('attack')).toBe(true);

    input.simulateMouseUp(0);
    expect(input.isActionActive('attack')).toBe(false);
    expect(input.isActionJustReleased('attack')).toBe(true);
  });

  describe('storage persistence', () => {
    let store: Map<string, string>;

    beforeEach(() => {
      store = new Map();
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('persists and restores keybinds from storage, replacing defaults', () => {
      input.setKeybinds({ jump: ['KeyJ', 74] });
      expect(input.saveToStorage()).toBe(true);

      const restored = new InputManager();
      expect(restored.loadFromStorage()).toBe(true);

      restored.simulateKeyDown('KeyJ');
      expect(restored.isActionActive('jump')).toBe(true);
      restored.simulateKeyUp('KeyJ');

      // Default jump key was overridden and must no longer be bound
      restored.simulateKeyDown('Space');
      expect(restored.isActionActive('jump')).toBe(false);
    });

    it('keeps full attack bindings when the legacy "cut" alias is also stored', () => {
      expect(input.saveToStorage()).toBe(true);
      const saved = JSON.parse(store.get('playerKeybinds')!) as Record<string, unknown>;
      expect(saved['cut']).toBe(69);

      const restored = new InputManager();
      expect(restored.loadFromStorage()).toBe(true);

      restored.simulateMouseDown(0);
      expect(restored.isActionActive('attack')).toBe(true);
    });

    it('merges a legacy-only "cut" code with default attack bindings', () => {
      store.set('playerKeybinds', JSON.stringify({ cut: 70 }));

      const restored = new InputManager();
      expect(restored.loadFromStorage()).toBe(true);

      restored.simulateKeyDown(70);
      expect(restored.isActionActive('attack')).toBe(true);
      restored.simulateKeyUp(70);

      restored.simulateMouseDown(0);
      expect(restored.isActionActive('attack')).toBe(true);
    });
  });

  it('binds and unbinds actions dynamically', () => {
    input.bindAction('dash', 'KeyX');
    input.simulateKeyDown('KeyX');
    expect(input.isActionActive('dash')).toBe(true);

    input.unbindAction('dash', 'KeyX');
    expect(input.isActionActive('dash')).toBe(false);
  });

  it('resets to defaults cleanly', () => {
    input.bindAction('jump', 'KeyZ');
    input.resetToDefaults();
    input.simulateKeyDown('KeyZ');
    expect(input.isActionActive('jump')).toBe(false);
  });
});
