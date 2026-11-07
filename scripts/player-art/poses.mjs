// Integer-pixel key poses. These are presentation only: no combat clocks, range,
// direction locks, velocity, collision or world coordinates are changed here.
export const directions = {
  north: [0, -1],
  northeast: [Math.SQRT1_2, -Math.SQRT1_2],
  east: [1, 0],
  southeast: [Math.SQRT1_2, Math.SQRT1_2],
  south: [0, 1],
  southwest: [-Math.SQRT1_2, Math.SQRT1_2],
  west: [-1, 0],
  northwest: [-Math.SQRT1_2, -Math.SQRT1_2],
};
export const counts = { idle: 6, walk: 8, run: 8, jump: 8, attack: 9, attack2: 9, attack3: 9 };

export function poseFor(clip, frame) {
  const p = {
    bob: 0,
    lean: 0,
    stride: 0,
    liftLeft: 0,
    liftRight: 0,
    armSwing: 0,
    reach: 0,
    guard: 0,
    hand: 1,
    tuck: 0,
  };
  if (clip === 'idle') p.bob = [0, 0, -1, -1, 0, 0][frame];
  if (clip === 'walk' || clip === 'run') {
    const run = clip === 'run',
      phase = (frame * Math.PI) / 4;
    p.stride = Math.sin(phase) * (run ? 4 : 3);
    p.liftLeft = Math.max(0, Math.sin(phase)) * (run ? 2 : 1);
    p.liftRight = Math.max(0, -Math.sin(phase)) * (run ? 2 : 1);
    p.bob = [0, -1, -1, 0, 0, -1, -1, 0][frame];
    p.armSwing = -Math.sin(phase) * (run ? 3 : 2);
    p.lean = run ? 1 : 0;
  }
  if (clip === 'jump') {
    p.bob = [0, 1, 0, 0, 0, 0, 1, 0][frame];
    p.tuck = [0, 0, 1, 2, 2, 1, 0, 0][frame];
    p.guard = [0, 1, 2, 2, 2, 1, 0, 0][frame];
  }
  if (clip.startsWith('attack')) {
    p.lean = [0, -1, -1, 1, 1, 1, 0, 0, 0][frame];
    p.reach = [0, 0, 2, 8, 8, 5, 2, 0, 0][frame];
    p.guard = [0, 1, 2, 2, 2, 1, 1, 0, 0][frame];
    p.hand = clip === 'attack2' ? -1 : 1;
    // Finisher adds a brace from the other hand, not a larger head/fist.
    if (clip === 'attack3') p.hand = 0;
  }
  return p;
}
