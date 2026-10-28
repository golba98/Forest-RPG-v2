import type { PortalVisualState } from '../types/render';

// Fallback timings match the simulation's PORTAL_RULES (codex/gameplay-repair),
// so derived and authoritative states look identical.
/** Player distance (tiles) at which a locked portal reacts. */
export const PORTAL_REACT_ENTER_TILES = 2.5;
/** The reaction re-arms only after the player moves beyond this distance. */
export const PORTAL_REACT_EXIT_TILES = 3;
export const PORTAL_REACT_MS = 600;
export const PORTAL_TRANSITION_MS = 650;
/**
 * Entry radius used by Game.fixedUpdate (a literal there). Only used to decide
 * whether a world swap came from walking into the portal; see
 * docs/contracts/visual-contract.md.
 */
export const PORTAL_ENTER_RADIUS_ASSUMED = 0.8;

export interface PortalVisualInput {
  /** Authoritative usability from the simulation. */
  readonly active: boolean;
  /** Optional explicit state from the simulation; wins when present. */
  readonly explicit?: PortalVisualState | undefined;
  readonly playerDistance: number;
  readonly dtMs: number;
}

/**
 * Presentation-only portal state machine. It never decides usability: `open`
 * mirrors `active`, and `reacting` is a one-shot flare when the player first
 * approaches a locked portal (re-armed by walking away).
 */
export class PortalVisualMachine {
  private current: PortalVisualState = 'locked';
  private reactRemainingMs = 0;
  private near = false;
  private armed = true;
  private stateMs = 0;

  get state(): PortalVisualState {
    return this.current;
  }

  /** Time spent in the current state (ms). */
  get elapsedMs(): number {
    return this.stateMs;
  }

  /** 0 → 1 over the reaction; 0 when not reacting. */
  get reactProgress(): number {
    if (this.current !== 'reacting') return 0;
    // An explicit simulation state may outlive the derived timer; use time in state then.
    const derived = this.reactRemainingMs > 0 ? 1 - this.reactRemainingMs / PORTAL_REACT_MS : this.stateMs / PORTAL_REACT_MS;
    return Math.min(1, Math.max(0, derived));
  }

  update(input: PortalVisualInput): PortalVisualState {
    const dt = Math.max(0, input.dtMs);
    if (!this.near && input.playerDistance <= PORTAL_REACT_ENTER_TILES) {
      this.near = true;
      if (this.armed && !input.active) {
        this.armed = false;
        this.reactRemainingMs = PORTAL_REACT_MS;
      }
    } else if (this.near && input.playerDistance > PORTAL_REACT_EXIT_TILES) {
      this.near = false;
      this.armed = true;
    }
    this.reactRemainingMs = Math.max(0, this.reactRemainingMs - dt);

    let next: PortalVisualState;
    if (input.explicit) next = input.explicit;
    else if (input.active) next = 'open';
    else next = this.reactRemainingMs > 0 ? 'reacting' : 'locked';
    if (next === 'open') this.reactRemainingMs = 0;

    if (next === this.current) this.stateMs += dt;
    else {
      this.current = next;
      this.stateMs = 0;
    }
    return next;
  }
}
