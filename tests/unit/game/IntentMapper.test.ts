import { describe, it, expect, beforeEach } from 'vitest';
import { InputManager } from '@/core/input/InputManager';
import { IntentMapper } from '@/game/IntentMapper';

describe('IntentMapper', () => {
  let input: InputManager;
  let mapper: IntentMapper;

  beforeEach(() => {
    input = new InputManager();
    mapper = new IntentMapper();
  });

  it('maps held movement keys to raw axes', () => {
    input.simulateKeyDown('KeyD');
    input.simulateKeyDown('KeyW');
    const intent = mapper.nextIntent(input);
    expect(intent.moveX).toBe(1);
    expect(intent.moveY).toBe(-1);
  });

  it('cancels opposite directions', () => {
    input.simulateKeyDown('KeyA');
    input.simulateKeyDown('KeyD');
    expect(mapper.nextIntent(input).moveX).toBe(0);
  });

  it('applies a tap to exactly one step when a frame runs several steps', () => {
    input.simulateKeyDown('KeyE');
    expect(mapper.nextIntent(input).attack).toBe(true);
    // Same frame, second catch-up step: just-pressed flag is still set but must not re-fire
    expect(mapper.nextIntent(input).attack).toBe(false);
    // End of frame: render collects again, then edge state is cleared
    mapper.collect(input);
    input.clearFrameState();
    mapper.endFrame();
    expect(mapper.nextIntent(input).attack).toBe(false);
  });

  it('latches a new press of the same key in a later frame', () => {
    input.simulateKeyDown('KeyE');
    expect(mapper.nextIntent(input).attack).toBe(true);
    input.clearFrameState();
    mapper.endFrame();
    input.simulateKeyUp('KeyE');
    input.simulateKeyDown('KeyE');
    expect(mapper.nextIntent(input).attack).toBe(true);
  });

  it('keeps a tap latched across frames that ran zero steps', () => {
    input.simulateKeyDown('KeyQ');
    mapper.collect(input); // render frame with no fixed step
    input.clearFrameState();
    mapper.endFrame();
    input.simulateKeyUp('KeyQ');

    expect(mapper.nextIntent(input).skillQ).toBe(true);
    expect(mapper.nextIntent(input).skillQ).toBe(false);
  });

  it('reports sprint as a held state', () => {
    input.simulateKeyDown('ShiftLeft');
    expect(mapper.nextIntent(input).sprint).toBe(true);
    expect(mapper.nextIntent(input).sprint).toBe(true);
  });
});
