import type { AnimState, Direction } from '../types/entities';
import type { RenderEntityView } from '../types/render';
import {
  ANIMATION_DEFS,
  ANIM_FALLBACKS,
  SYNTHETIC_HOLD_MS,
  type CardinalDirection,
  type ClipDef,
  type SpriteSetDef,
} from './AnimationDefs';

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SpriteFrameRef {
  /** Manifest texture alias; '' when `placeholder` is true. */
  readonly textureAlias: string;
  /** Source rectangle within the texture, in texture pixels. */
  readonly frame: FrameRect;
  readonly flipX: boolean;
  /** Pixi-style anchor (0..1, may exceed 1 or go below 0 for foot offsets). */
  readonly anchorX: number;
  readonly anchorY: number;
  /** World pixels per texture pixel at the 32 px logical tile. */
  readonly scale: number;
  /** One-shot clip has played through. Always false for looping clips. */
  readonly finished: boolean;
  /** No art exists for this sprite key; the renderer should draw a stand-in. */
  readonly placeholder: boolean;
}

export type SpriteFrameInput = Pick<RenderEntityView, 'spriteKey' | 'anim' | 'facing' | 'animTimeMs' | 'active'>;

const PLACEHOLDER_SIZE = 32;

const PLACEHOLDER_REF: SpriteFrameRef = Object.freeze({
  textureAlias: '',
  frame: Object.freeze({ x: 0, y: 0, w: PLACEHOLDER_SIZE, h: PLACEHOLDER_SIZE }),
  flipX: false,
  anchorX: 0.5,
  anchorY: 0.5,
  scale: 1,
  finished: false,
  placeholder: true,
});

/**
 * Collapses 8 directions onto the 4 sheet rows the way the legacy enemy AI
 * picked a facing: `|dx| > |dy| ? E/W : N/S`, so exact diagonals take the
 * vertical row (NE/NW → N, SE/SW → S).
 */
export function toCardinal(dir: Direction): CardinalDirection {
  switch (dir) {
    case 'N':
    case 'NE':
    case 'NW':
      return 'N';
    case 'S':
    case 'SE':
    case 'SW':
      return 'S';
    case 'E':
      return 'E';
    case 'W':
      return 'W';
  }
}

interface ResolvedClip {
  readonly clip: ClipDef;
  /** Set when the requested state has no art and is rendered as a held frame. */
  readonly holdMs: number | null;
}

function clipsFor(def: SpriteSetDef, active: boolean | undefined): SpriteSetDef['clips'] {
  return active === true && def.activeClips ? def.activeClips : def.clips;
}

function resolveClip(def: SpriteSetDef, anim: AnimState, active: boolean | undefined): ResolvedClip | null {
  const clips = clipsFor(def, active);
  const direct = clips[anim];
  if (direct) return { clip: direct, holdMs: null };
  for (const fallback of ANIM_FALLBACKS[anim]) {
    const clip = clips[fallback];
    if (clip) return { clip, holdMs: SYNTHETIC_HOLD_MS[anim] ?? null };
  }
  const idle = clips.idle;
  return idle ? { clip: idle, holdMs: SYNTHETIC_HOLD_MS[anim] ?? null } : null;
}

function sanitizeTime(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/** Integer column slice; handles sheets whose width is not a multiple of the column count. */
function columnSpan(sheetWidth: number, columns: number, col: number): { x: number; w: number } {
  const x = Math.floor((col * sheetWidth) / columns);
  const next = Math.floor(((col + 1) * sheetWidth) / columns);
  return { x, w: next - x };
}

function rowSpan(sheetHeight: number, rows: number, row: number): { y: number; h: number } {
  const y = Math.floor((row * sheetHeight) / rows);
  const next = Math.floor(((row + 1) * sheetHeight) / rows);
  return { y, h: next - y };
}

interface FrameIndex {
  readonly index: number;
  readonly finished: boolean;
}

function frameIndexFor(resolved: ResolvedClip, timeMs: number): FrameIndex {
  const { clip, holdMs } = resolved;
  if (holdMs !== null) return { index: 0, finished: timeMs >= holdMs };
  const count = Math.max(1, clip.frameCount);
  const raw = Math.floor(timeMs / clip.frameDurationMs);
  if (clip.loop) return { index: raw % count, finished: false };
  return { index: Math.min(raw, count - 1), finished: timeMs >= count * clip.frameDurationMs };
}

/**
 * Maps a render view to a texture sub-rectangle. Pure: depends only on the
 * view's simulation-time `animTimeMs`, never on render frame rate.
 */
export function resolveSpriteFrame(view: SpriteFrameInput): SpriteFrameRef {
  const def = ANIMATION_DEFS[view.spriteKey];
  if (!def) return PLACEHOLDER_REF;
  const resolved = resolveClip(def, view.anim, view.active);
  if (!resolved) return PLACEHOLDER_REF;

  const { clip } = resolved;
  const { index, finished } = frameIndexFor(resolved, sanitizeTime(view.animTimeMs));
  const scale = clip.scale ?? def.scale;

  let textureAlias: string;
  let frame: FrameRect;
  let flipX = false;
  const src = clip.source;
  switch (src.kind) {
    case 'perDirectionSheets': {
      const sheet = src.sheets[view.facing];
      const { x, w } = columnSpan(sheet.sheetWidth, clip.frameCount, index);
      textureAlias = sheet.alias;
      frame = { x, y: 0, w, h: sheet.sheetHeight };
      flipX = sheet.flipX === true;
      break;
    }
    case 'directionalRows': {
      const row = Math.max(0, src.rowOrder.indexOf(toCardinal(view.facing)));
      const { x, w } = columnSpan(src.sheet.sheetWidth, src.sheet.columns, index);
      const { y, h } = rowSpan(src.sheet.sheetHeight, src.sheet.rows, row);
      textureAlias = src.sheet.alias;
      frame = { x, y, w, h };
      break;
    }
    case 'single': {
      const { x, w } = columnSpan(src.sheet.sheetWidth, src.sheet.columns, index);
      const { y, h } = rowSpan(src.sheet.sheetHeight, src.sheet.rows, 0);
      textureAlias = src.sheet.alias;
      frame = { x, y, w, h };
      break;
    }
  }

  const anchorY = def.anchor.kind === 'center' ? 0.5 : 1 - def.anchor.footOffsetPx / (frame.h * scale);

  return { textureAlias, frame, flipX, anchorX: 0.5, anchorY, scale, finished, placeholder: false };
}

/**
 * Total length of one play-through (one-shot) or one cycle (loop) in ms.
 * Returns 0 for unknown sprite keys.
 */
export function getAnimationDurationMs(spriteKey: string, anim: AnimState, active?: boolean): number {
  const def = ANIMATION_DEFS[spriteKey];
  if (!def) return 0;
  const resolved = resolveClip(def, anim, active);
  if (!resolved) return 0;
  if (resolved.holdMs !== null) return resolved.holdMs;
  return Math.max(1, resolved.clip.frameCount) * resolved.clip.frameDurationMs;
}

/** True when the clip for (spriteKey, anim) loops. Unknown keys report false. */
export function isAnimationLooping(spriteKey: string, anim: AnimState, active?: boolean): boolean {
  const def = ANIMATION_DEFS[spriteKey];
  if (!def) return false;
  const resolved = resolveClip(def, anim, active);
  return resolved !== null && resolved.holdMs === null && resolved.clip.loop;
}

/** One-shot clip has played through. Looping clips and unknown keys never finish. */
export function isAnimationFinished(view: Pick<SpriteFrameInput, 'spriteKey' | 'anim' | 'animTimeMs' | 'active'>): boolean {
  const def = ANIMATION_DEFS[view.spriteKey];
  if (!def) return false;
  const resolved = resolveClip(def, view.anim, view.active);
  if (!resolved) return false;
  return frameIndexFor(resolved, sanitizeTime(view.animTimeMs)).finished;
}
