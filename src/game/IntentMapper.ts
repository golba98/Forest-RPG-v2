import type { InputAction } from '../core/input/types';
import type { PlayerIntent } from '../types/entities';

/** Minimal read-only view of InputManager needed to build intents. */
export interface IntentInputSource {
  isActionActive(action: InputAction): boolean;
  isActionJustPressed(action: InputAction): boolean;
}

type EdgeAction = 'attack' | 'skillQ' | 'skillE' | 'jump' | 'dash' | 'potionHealth' | 'potionSpeed';

const EDGE_ACTIONS: ReadonlyArray<readonly [EdgeAction, InputAction]> = [
  ['attack', 'attack'],
  ['skillQ', 'skillQ'],
  ['skillE', 'skillE'],
  ['jump', 'jump'],
  ['dash', 'dash'],
  ['potionHealth', 'potionHealth'],
  ['potionSpeed', 'potionSpeed'],
];

/**
 * Converts InputManager state into per-fixed-step PlayerIntents.
 *
 * InputManager's "just pressed" flags live for one render frame, but a render
 * frame can run zero fixed steps (high refresh rates) or several (catch-up).
 * Edges are therefore latched here and consumed by exactly one simulation step,
 * so a quick tap is never dropped or applied twice.
 */
export class IntentMapper {
  private readonly pending = new Set<EdgeAction>();
  /** Edges already latched during the current render frame (each press latches once). */
  private readonly latchedThisFrame = new Set<EdgeAction>();

  /** Latches edge presses from the current frame. Idempotent within a frame. */
  public collect(input: IntentInputSource): void {
    for (const [edge, action] of EDGE_ACTIONS) {
      if (input.isActionJustPressed(action) && !this.latchedThisFrame.has(edge)) {
        this.latchedThisFrame.add(edge);
        this.pending.add(edge);
      }
    }
  }

  /** Call when InputManager's per-frame edge state is cleared. */
  public endFrame(): void {
    this.latchedThisFrame.clear();
  }

  /** Builds the intent for one fixed step and consumes latched edges. */
  public nextIntent(input: IntentInputSource): PlayerIntent {
    this.collect(input);
    const intent: PlayerIntent = {
      moveX: axis(input.isActionActive('moveRight'), input.isActionActive('moveLeft')),
      moveY: axis(input.isActionActive('moveDown'), input.isActionActive('moveUp')),
      sprint: input.isActionActive('sprint'),
      attack: this.pending.has('attack'),
      skillQ: this.pending.has('skillQ'),
      skillE: this.pending.has('skillE'),
      jump: this.pending.has('jump'),
      dash: this.pending.has('dash'),
      potionHealth: this.pending.has('potionHealth'),
      potionSpeed: this.pending.has('potionSpeed'),
    };
    this.pending.clear();
    return intent;
  }

  public reset(): void {
    this.pending.clear();
    this.latchedThisFrame.clear();
  }
}

function axis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}
