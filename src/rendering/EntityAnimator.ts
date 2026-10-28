import type { AnimState, Direction } from '../types/entities';
import type { RenderEntityView } from '../types/render';
import { getAnimationDurationMs } from '../animation/resolveSpriteFrame';
import type { SpriteFrameInput } from '../animation/resolveSpriteFrame';

/** A displayed facing must persist this long before the sprite row flips (enemies). */
export const FACING_HOLD_MS = 120;
/** Pause between repeated attack clips while an enemy stays in its attack state. */
export const ATTACK_REPEAT_GAP_MS = 350;
/** Wind-up telegraph shown at the start of every enemy attack clip. */
export const TELEGRAPH_MS = 220;
/** Below this, a fresh `animTimeMs` after an anim change is treated as already reset by the simulation. */
const RESET_SLACK_MS = 50;

interface Track {
  anim: AnimState;
  /** `animTimeMs` value at which the current anim started (when the sim does not reset it). */
  offsetMs: number;
  lastAnimTimeMs: number;
  facing: Direction;
  pendingFacing: Direction;
  pendingMs: number;
  seenAt: number;
}

export interface AnimatedView extends SpriteFrameInput {
  /** 0..1 strength of the attack wind-up telegraph (0 when none). */
  readonly telegraph: number;
}

/**
 * Per-entity presentation clock and facing filter, owned by the renderer.
 *
 * - Restarts the clip clock whenever `anim` changes. The simulation only ever
 *   increments enemy `animTimeMs`, so one-shot clips (attack) were already
 *   "finished" on entry and froze on their last frame.
 * - Repeats an enemy's attack clip with a short idle gap while it stays in the
 *   attack state, instead of holding the final pose.
 * - Smooths enemy facing flips at exact diagonals.
 * Simulation state is never modified.
 */
export class EntityAnimator {
  private readonly tracks = new Map<string, Track>();
  private frame = 0;

  /** Call once per rendered frame before `resolve`. */
  beginFrame(): void {
    this.frame++;
  }

  resolve(view: RenderEntityView, dtMs: number): AnimatedView {
    let track = this.tracks.get(view.id);
    if (!track) {
      track = {
        anim: view.anim,
        offsetMs: view.animStartedAtMs ?? 0,
        lastAnimTimeMs: view.animTimeMs,
        facing: view.facing,
        pendingFacing: view.facing,
        pendingMs: 0,
        seenAt: this.frame,
      };
      this.tracks.set(view.id, track);
    }
    track.seenAt = this.frame;

    if (view.animStartedAtMs !== undefined) track.offsetMs = view.animStartedAtMs;
    else if (view.anim !== track.anim) track.offsetMs = view.animTimeMs < RESET_SLACK_MS ? 0 : view.animTimeMs;
    else if (view.animTimeMs < track.lastAnimTimeMs) track.offsetMs = 0; // simulation restarted the same anim
    track.anim = view.anim;
    track.lastAnimTimeMs = view.animTimeMs;
    const local = Math.max(0, view.animTimeMs - track.offsetMs);

    let facing = view.facing;
    if (view.kind === 'enemy') {
      if (view.facing === track.facing) track.pendingMs = 0;
      else {
        if (view.facing !== track.pendingFacing) {
          track.pendingFacing = view.facing;
          track.pendingMs = 0;
        }
        track.pendingMs += dtMs;
        if (track.pendingMs >= FACING_HOLD_MS) {
          track.facing = view.facing;
          track.pendingMs = 0;
        }
      }
      facing = track.facing;
    } else track.facing = view.facing;

    let anim: AnimState = view.anim;
    let time = local;
    let telegraph = 0;
    if (view.moving === false && (anim === 'walk' || anim === 'run')) {
      anim = 'idle';
      time = 0;
    }
    if (view.kind === 'enemy' && view.anim === 'attack' && view.attackPhase !== undefined) {
      // Authoritative phases from the AI: telegraph the wind-up, rest after the strike.
      telegraph = view.attackPhase === 'windup' ? 1 : 0;
      if (view.attackPhase === 'recover' || view.attackPhase === 'none') {
        anim = 'idle';
        time = 0;
      }
    } else if (view.kind === 'enemy' && view.anim === 'attack') {
      const clip = getAnimationDurationMs(view.spriteKey, 'attack');
      if (clip > 0) {
        const t = local % (clip + ATTACK_REPEAT_GAP_MS);
        if (t >= clip) {
          anim = 'idle';
          time = 0;
        } else time = t;
        if (t < TELEGRAPH_MS) telegraph = 1 - t / TELEGRAPH_MS;
      }
    }
    return { spriteKey: view.spriteKey, anim, facing, animTimeMs: time, telegraph, ...(view.active === undefined ? {} : { active: view.active }) };
  }

  /** Drops state for entities not seen this frame; returns their ids. */
  sweep(): string[] {
    const gone: string[] = [];
    for (const [id, track] of this.tracks) {
      if (track.seenAt !== this.frame) {
        this.tracks.delete(id);
        gone.push(id);
      }
    }
    return gone;
  }

  clear(): void {
    this.tracks.clear();
  }
}
