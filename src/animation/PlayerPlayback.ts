import type { AnimState, Direction } from '../types/entities';
import settleSteps from './playerSettleSteps.json';

// The review-only Vite transform can disable this for a same-art comparison.
// Production is always enabled and has no URL-dependent behaviour.
export const PLAYER_FLOW_ENABLED = true;
export const PLAYER_SETTLE_MS = 80;
// Wind-up and strike start are unchanged. Hold impact for 60 ms, then ease
// through recovery, reaching the existing ready drawing before the next swing.
export const PLAYER_PUNCH_FRAME_MS = [40, 40, 40, 60, 40, 30, 30, 40, 40] as const;

type Gait = 'walk' | 'run';
interface Settle {
  clip: Gait;
  frame: number;
  steps: number;
  elapsed: number;
  facing: Direction;
}
export interface PlayerFlowState {
  previous: AnimState;
  previousTime: number;
  previousFacing: Direction;
  settle: Settle | undefined;
  idleElapsed: number;
}
export function createPlayerFlow(facing: Direction): PlayerFlowState {
  return {
    previous: 'idle',
    previousTime: 0,
    previousFacing: facing,
    settle: undefined,
    idleElapsed: 0,
  };
}

/** Applies only a bounded stop/ready transition. Never defers action or facing. */
export function settlePlayerMotion(
  state: PlayerFlowState,
  anim: AnimState,
  time: number,
  facing: Direction,
  dtMs: number,
  discontinuity: boolean,
): { anim: AnimState; time: number } {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  if (discontinuity || facing !== state.previousFacing) state.settle = undefined;
  if (anim !== 'idle') {
    state.settle = undefined;
    state.idleElapsed = 0;
  } else {
    if (state.previous !== 'idle') {
      state.idleElapsed = 0;
      if (
        !discontinuity &&
        facing === state.previousFacing &&
        (state.previous === 'walk' || state.previous === 'run')
      ) {
        const clip = state.previous;
        const duration = clip === 'walk' ? 40 : 1000 / 34;
        const frame = Math.floor(state.previousTime / duration) % 8;
        state.settle = {
          clip,
          frame,
          steps: settleSteps[clip][facing][frame] ?? 0,
          elapsed: 0,
          facing,
        };
      }
    } else state.idleElapsed += dt;
  }
  const requested = anim;
  if (state.settle && anim === 'idle') {
    state.settle.elapsed += dt;
    if (state.settle.elapsed < (state.settle.steps === 0 ? 40 : PLAYER_SETTLE_MS)) {
      const s = state.settle;
      // Briefly retain the contact pose, then ease through up to two poses.
      const step = Math.min(s.steps, s.elapsed < 20 ? 0 : s.elapsed < 50 ? 1 : 2);
      anim = s.clip;
      time = ((s.frame + step) % 8) * (s.clip === 'walk' ? 40 : 1000 / 34) + 0.001;
    } else {
      state.settle = undefined;
      state.idleElapsed = 0;
      time = 0;
    }
  } else if (anim === 'idle') time = state.idleElapsed;
  // Remember the requested state so the settle cannot restart itself.
  state.previous = requested;
  state.previousTime = time;
  state.previousFacing = facing;
  return { anim, time };
}
