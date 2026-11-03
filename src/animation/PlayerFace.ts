import data from './playerFaceMetadata.json' with { type: 'json' };
import type { Direction } from '../types/entities';
import type { PlayerPose } from './PlayerMotion';
import type { BlinkPhase } from './PlayerBlink';
import { decodePlayerPixels, interpolatePlayerPixels } from './playerPixelMath';

export const playerDirectionSuffix = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
} as const;
export interface PlayerHead {
  facing: Direction;
  offset: readonly [number, number];
  foreground: Uint8Array;
}
export interface PlayerFaceInfo {
  phase: BlinkPhase;
  headOffset: readonly [number, number];
  eyes: readonly (readonly number[])[];
}
const decoded = new Map<string, Uint8Array>();
function decode(encoded: string): Uint8Array {
  let result = decoded.get(encoded);
  if (!result) {
    result = decodePlayerPixels(encoded);
    if (decoded.size >= 80) decoded.delete(decoded.keys().next().value ?? '');
    decoded.set(encoded, result);
  }
  return result;
}
export function playerHead(pose: PlayerPose): PlayerHead {
  const p = pose.upper;
  const frame = data[playerDirectionSuffix[p.facing]].poses[p.clip][p.frame];
  if (!frame) throw Error('Missing player head registration');
  return {
    facing: p.facing,
    offset: [frame.offset[0] ?? 0, frame.offset[1] ?? 0],
    foreground: decode(frame.foreground),
  };
}
export function placedPlayerHead(head: PlayerHead): Uint8Array {
  const source = decode(data[playerDirectionSuffix[head.facing]].head);
  const out = new Uint8Array(4096);
  const [dx, dy] = head.offset;
  for (let i = 0; i < 4096; i++)
    if (source[i]) {
      const x = (i % 64) + dx,
        y = Math.floor(i / 64) + dy;
      if (x >= 0 && x < 64 && y >= 0 && y < 64) out[y * 64 + x] = source[i] ?? 0;
    }
  return out;
}
export function playerFaceInfo(head: PlayerHead, phase: BlinkPhase): PlayerFaceInfo {
  return {
    phase,
    headOffset: head.offset,
    eyes: data[playerDirectionSuffix[head.facing]].eyes.map(([x = 0, y = 0, w = 0, h = 0]) => [
      x + head.offset[0],
      y + head.offset[1],
      w,
      h,
    ]),
  };
}
/** Eye-local, opaque authored pixels. Never alters head geometry or the body. */
export function blinkPlayerPixels(
  base: Uint8Array,
  head: PlayerHead,
  phase: BlinkPhase,
): Uint8Array {
  const face = data[playerDirectionSuffix[head.facing]];
  if (phase === 'open' || !face.eyes.length) return base;
  const out = Uint8Array.from(base);
  const patch = phase === 'closed' ? face.eyelids.closed : face.eyelids.partial;
  for (const [i = 0, color = 0] of patch) {
    const at = i + head.offset[0] + 64 * head.offset[1];
    // A punch can cover an eye. Eyelids stay behind the existing fist.
    if (!head.foreground[at]) out[at] = color;
  }
  return out;
}
/** Existing body transition, with an exact translated head instead of a morphed face. */
export function transitionPlayerPixels(
  a: Uint8Array,
  b: Uint8Array,
  from: PlayerHead,
  to: PlayerHead,
  t: number,
): { pixels: Uint8Array; head: PlayerHead } {
  if (t <= 0) return { pixels: a, head: from };
  if (t >= 1 || from.facing !== to.facing) return { pixels: b, head: to };
  const head: PlayerHead = {
    facing: to.facing,
    offset: [
      Math.round(from.offset[0] * (1 - t) + to.offset[0] * t),
      Math.round(from.offset[1] * (1 - t) + to.offset[1] * t),
    ],
    foreground: t <= 0.5 ? from.foreground : to.foreground,
  };
  const oldHead = placedPlayerHead(from),
    nextHead = placedPlayerHead(to),
    fixed = placedPlayerHead(head);
  const pixels = interpolatePlayerPixels(a, b, t);
  for (let i = 0; i < 4096; i++) {
    if (oldHead[i] || nextHead[i])
      pixels[i] = !nextHead[i] && b[i] ? (b[i] ?? 0) : !oldHead[i] && a[i] ? (a[i] ?? 0) : 0;
    if (fixed[i]) pixels[i] = fixed[i] ?? 0;
    if (head.foreground[i]) pixels[i] = head.foreground[i] ?? 0;
  }
  return { pixels, head };
}
