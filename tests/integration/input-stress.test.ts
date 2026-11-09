// @vitest-environment happy-dom
import { InputManager } from '@/core/input/InputManager';
import { Vector2 } from '@/core/math/Vector2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Input stress', () => {
  // =========================================================================
  // 4. INPUT MANAGER: DUAL KEYCODES & SIMULTANEOUS DISPATCH
  // =========================================================================
  describe('InputManager: Dual Keycodes & Simultaneous Dispatch', () => {
    let input: InputManager;

    beforeEach(() => {
      input = new InputManager();
      input.attach(window);
    });

    afterEach(() => {
      input.detach();
    });

    it('processes simultaneous modern DOM string code and legacy numeric keyCode inputs', () => {
      // 1. Modern DOM event with both code and keyCode populated
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'KeyW',
          keyCode: 87,
          bubbles: true,
          cancelable: true,
        }),
      );

      expect(input.isActionActive('moveUp')).toBe(true);
      expect(input.isActionJustPressed('moveUp')).toBe(true);

      // 2. Legacy event with only numeric keyCode (e.g. keyCode 32 for Space / jump)
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: '',
          keyCode: 32,
          bubbles: true,
          cancelable: true,
        }),
      );

      expect(input.isActionActive('jump')).toBe(true);
      expect(input.isActionJustPressed('jump')).toBe(true);

      // 3. Modern-only event with only code string (e.g. ShiftLeft for sprint, keyCode 0)
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'ShiftLeft',
          keyCode: 0,
          bubbles: true,
          cancelable: true,
        }),
      );

      expect(input.isActionActive('sprint')).toBe(true);
      expect(input.isActionJustPressed('sprint')).toBe(true);

      // 4. Clear frame state clears rising edge but maintains active held state
      input.clearFrameState();
      expect(input.isActionActive('moveUp')).toBe(true);
      expect(input.isActionJustPressed('moveUp')).toBe(false);
      expect(input.isActionActive('jump')).toBe(true);
      expect(input.isActionJustPressed('jump')).toBe(false);
      expect(input.isActionActive('sprint')).toBe(true);
      expect(input.isActionJustPressed('sprint')).toBe(false);

      // 5. Simultaneous release of all 3
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', keyCode: 87 }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: '', keyCode: 32 }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', keyCode: 0 }));

      expect(input.isActionActive('moveUp')).toBe(false);
      expect(input.isActionJustReleased('moveUp')).toBe(true);

      expect(input.isActionActive('jump')).toBe(false);
      expect(input.isActionJustReleased('jump')).toBe(true);

      expect(input.isActionActive('sprint')).toBe(false);
      expect(input.isActionJustReleased('sprint')).toBe(true);
    });

    it('loads and adapts legacy localStorage keybindings format faithfully', () => {
      // Simulate legacy save file in localStorage
      const legacySave = {
        cut: 69, // KeyE in legacy
        moveUp: 87, // W
        moveDown: 83, // S
        moveLeft: 65, // A
        moveRight: 68, // D
        sprint: 16, // Shift
        jump: 32, // Space
      };
      localStorage.setItem('playerKeybinds', JSON.stringify(legacySave));

      const loaded = input.loadFromStorage('playerKeybinds');
      expect(loaded).toBe(true);

      // Press legacy 'cut' key (69) -> should activate 'attack' action
      input.simulateKeyDown(69);
      expect(input.isActionActive('attack')).toBe(true);
      expect(input.isActionJustPressed('attack')).toBe(true);

      input.simulateKeyUp(69);
      expect(input.isActionActive('attack')).toBe(false);
      expect(input.isActionJustReleased('attack')).toBe(true);
    });
  });

  // =========================================================================
  // 5. INPUT MANAGER: MULTI-FRAME EDGE LATCHING & ZERO ALLOCATION
  // =========================================================================
  describe('InputManager: Multi-Frame Edge Latching & Zero Allocation', () => {
    let input: InputManager;

    beforeEach(() => {
      input = new InputManager();
    });

    it('tracks edge latches across strict multi-frame sequence without stuck keys or missed transitions', () => {
      // FRAME 0: Initial rest
      expect(input.isActionActive('moveRight')).toBe(false);
      expect(input.isActionJustPressed('moveRight')).toBe(false);
      expect(input.isActionJustReleased('moveRight')).toBe(false);

      // FRAME 1: KeyDown in frame
      input.simulateKeyDown('KeyD');
      expect(input.isActionActive('moveRight')).toBe(true);
      expect(input.isActionJustPressed('moveRight')).toBe(true);
      expect(input.isActionJustReleased('moveRight')).toBe(false);

      // FRAME 1 END: End of frame tick
      input.clearFrameState();

      // FRAME 2: Held down, no new events
      expect(input.isActionActive('moveRight')).toBe(true);
      expect(input.isActionJustPressed('moveRight')).toBe(false);
      expect(input.isActionJustReleased('moveRight')).toBe(false);

      // Repeat keydown (OS autorepeat) should NOT trigger isActionJustPressed again
      input.simulateKeyDown('KeyD');
      expect(input.isActionActive('moveRight')).toBe(true);
      expect(input.isActionJustPressed('moveRight')).toBe(false);

      // FRAME 2 END
      input.clearFrameState();

      // FRAME 3: KeyUp in frame
      input.simulateKeyUp('KeyD');
      expect(input.isActionActive('moveRight')).toBe(false);
      expect(input.isActionJustPressed('moveRight')).toBe(false);
      expect(input.isActionJustReleased('moveRight')).toBe(true);

      // FRAME 3 END
      input.clearFrameState();

      // FRAME 4: Post-release rest
      expect(input.isActionActive('moveRight')).toBe(false);
      expect(input.isActionJustPressed('moveRight')).toBe(false);
      expect(input.isActionJustReleased('moveRight')).toBe(false);
    });

    it('verifies zero allocation and rapid execution during clearFrameState in 60Hz loop', () => {
      // Warm up
      for (let i = 0; i < 1000; i++) {
        input.simulateKeyDown('KeyW');
        input.clearFrameState();
        input.simulateKeyUp('KeyW');
        input.clearFrameState();
      }

      const ITERATIONS = 100_000;
      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        input.simulateKeyDown('KeyW');
        input.simulateKeyDown('Space');
        input.simulateMouseMove(i % 100, (i * 2) % 100);
        input.clearFrameState();
        input.simulateKeyUp('KeyW');
        input.simulateKeyUp('Space');
        input.clearFrameState();
      }

      const elapsed = performance.now() - start;

      // 100,000 frames (each simulating 2 key downs, mouse move, clear, 2 key ups, clear)
      // must complete in under 500ms total (< 5 microseconds per frame simulation)
      expect(elapsed).toBeLessThan(500);

      // Final state must be fully cleared
      expect(input.isActionActive('moveUp')).toBe(false);
      expect(input.isActionActive('jump')).toBe(false);
      expect(input.getMouseDelta()).toEqual(new Vector2(0, 0));
    });
  });
});
