import type { RenderEntityView } from '../types/render';
import type { Direction } from '../types/entities';
import metadata from './playerFluidMetadata.json';
const directionSuffix = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
} as const;
export type PlayerClip = keyof typeof metadata.counts;
export interface PoseLayer {
  clip: PlayerClip;
  frame: number;
  facing: Direction;
  join?: 'out' | 'in';
}
export interface PlayerPose {
  upper: PoseLayer;
  lower: PoseLayer;
  transition?: {
    id: number;
    step: number;
    fromClip: PlayerClip;
    toClip: PlayerClip;
    from: PlayerPose;
  };
}
export function poseFrame(clip: PlayerClip, time: number): number {
  const ds = metadata.durations[clip];
  const total = ds.reduce((a, b) => a + b, 0);
  let t = Math.max(0, time);
  if (clip === 'idle' || clip === 'walk' || clip === 'run') t %= total;
  for (let i = 0; i < ds.length; i++) {
    t -= ds[i] ?? 0;
    if (t < 0) return i;
  }
  return ds.length - 1;
}
/** Independent locomotion/jump and locked attack clocks; presentation only. */
export function playerPose(view: RenderEntityView, distance: number): PlayerPose {
  const facing = view.attack?.direction ?? view.facing;
  const gait: PlayerClip = view.isSprinting ? 'run' : 'walk';
  const moving = Math.hypot(view.vx ?? 0, view.vy ?? 0) > 0;
  const base: PoseLayer = view.isJumping
    ? {
        clip: 'jump',
        frame: poseFrame('jump', (view.jumpProgress ?? 0) * 500),
        facing,
      }
    : moving
      ? {
          clip: gait,
          frame:
            (Math.floor(((((distance % 64) + 64) % 64) / 64) * metadata.counts[gait]) +
              (gait === 'run' ? metadata.gaitOffsets[directionSuffix[facing]] : 0)) %
            metadata.counts[gait],
          facing,
        }
      : { clip: 'idle', frame: poseFrame('idle', view.animTimeMs), facing };
  const attack = view.attack;
  const clip: PlayerClip =
    attack?.comboStep === 2 ? 'attack2' : attack?.comboStep === 3 ? 'attack3' : 'attack';
  const full = attack ? { clip, frame: poseFrame(clip, attack.elapsedMs), facing } : base;
  return { lower: full, upper: full };
}

/** Direct native-pixel pose transitions; authoritative clocks continue underneath. */
export class PlayerPoseController {
  private previous: PoseLayer | undefined;
  private displayed: PlayerPose | undefined;
  private bridge:
    | { id: number; fromClip: PlayerClip; elapsed: number; duration: number; from: PlayerPose }
    | undefined;
  private nextId = 0;

  update(view: RenderEntityView, distance: number, dt: number, reset = false): PlayerPose {
    const desired = playerPose(view, distance),
      target = desired.upper;
    const changedFacing = this.previous?.facing !== target.facing;
    if (reset || changedFacing || (view.attack && view.attack.elapsedMs >= 60)) {
      this.bridge = undefined;
    } else if (dt <= 0 && this.displayed) {
      return this.displayed;
    } else if (this.previous && this.previous.clip !== target.clip) {
      // Retarget from the last DISPLAYED complete pixels, without extending
      // the original deadline when inputs change rapidly.
      const duration = this.bridge
        ? this.bridge.duration - this.bridge.elapsed
        : target.clip === 'idle'
          ? 80
          : 60;
      this.bridge = {
        id: ++this.nextId,
        fromClip: this.previous.clip,
        elapsed: 0,
        duration,
        from: this.displayed ?? desired,
      };
    }
    this.previous = target;
    let pose = desired;
    const bridge = this.bridge;
    if (bridge) {
      bridge.elapsed += Math.max(0, dt);
      if (bridge.elapsed >= bridge.duration) this.bridge = undefined;
      else
        pose = {
          ...desired,
          transition: {
            id: bridge.id,
            step: Math.min(3, Math.max(1, Math.floor((bridge.elapsed / bridge.duration) * 4))),
            fromClip: bridge.fromClip,
            toClip: target.clip,
            from: bridge.from,
          },
        };
    }
    this.displayed = pose;
    return pose;
  }
}
