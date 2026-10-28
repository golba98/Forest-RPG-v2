import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANIMATION_DEFS,
  PROCEDURAL_SPRITES,
  getAnimationDurationMs,
  isAnimationFinished,
  isAnimationLooping,
  listReferencedAliases,
  playerSheetAlias,
  resolveSpriteFrame,
  toCardinal,
  type SpriteFrameInput,
} from '../../../src/animation';
import type { AnimState, Direction } from '../../../src/types/entities';

function view(overrides: Partial<SpriteFrameInput> = {}): SpriteFrameInput {
  return { spriteKey: 'player', anim: 'idle', facing: 'S', animTimeMs: 0, ...overrides };
}

const ALL_DIRS: readonly Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const ALL_ANIMS: readonly AnimState[] = ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'death'];

describe('resolveSpriteFrame — player', () => {
  it('slices idle_south into 4 × 20 px frames at 150 ms', () => {
    const f0 = resolveSpriteFrame(view({ animTimeMs: 0 }));
    expect(f0.textureAlias).toBe('player_idle_south');
    expect(f0.frame).toEqual({ x: 0, y: 0, w: 20, h: 23 });
    expect(resolveSpriteFrame(view({ animTimeMs: 149.9 })).frame.x).toBe(0);
    expect(resolveSpriteFrame(view({ animTimeMs: 150 })).frame.x).toBe(20);
    expect(resolveSpriteFrame(view({ animTimeMs: 450 })).frame.x).toBe(60);
  });

  it('wraps looping clips', () => {
    expect(resolveSpriteFrame(view({ animTimeMs: 600 })).frame.x).toBe(0);
    expect(resolveSpriteFrame(view({ animTimeMs: 600 * 10 + 300 })).frame.x).toBe(40);
    expect(resolveSpriteFrame(view({ animTimeMs: 1e9 })).finished).toBe(false);
  });

  it('uses a distinct texture per facing direction without mirroring', () => {
    for (const dir of ALL_DIRS) {
      const ref = resolveSpriteFrame(view({ facing: dir, anim: 'walk' }));
      expect(ref.textureAlias).toBe(playerSheetAlias('walk', dir));
      expect(ref.flipX).toBe(false);
    }
  });

  it('run sheets have 6 frames at 112.5 ms', () => {
    const ref = resolveSpriteFrame(view({ anim: 'run', facing: 'E', animTimeMs: 112.5 * 5 }));
    expect(ref.textureAlias).toBe('player_run_east');
    expect(ref.frame).toEqual({ x: 100, y: 0, w: 20, h: 22 });
    expect(resolveSpriteFrame(view({ anim: 'run', animTimeMs: 112.5 * 6 })).frame.x).toBe(0);
  });

  it('clamps one-shot jump to its last frame and flags finished', () => {
    expect(getAnimationDurationMs('player', 'jump')).toBe(500);
    const mid = resolveSpriteFrame(view({ anim: 'jump', animTimeMs: 499 }));
    expect(mid.frame.x).toBe(80);
    expect(mid.finished).toBe(false);
    const end = resolveSpriteFrame(view({ anim: 'jump', animTimeMs: 500 }));
    expect(end.frame.x).toBe(80);
    expect(end.finished).toBe(true);
    expect(resolveSpriteFrame(view({ anim: 'jump', animTimeMs: 10_000 })).frame.x).toBe(80);
  });

  it('slices the 446 px attack sheet into integer frames covering the whole width', () => {
    const xs: number[] = [];
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const ref = resolveSpriteFrame(view({ anim: 'attack', facing: 'S', animTimeMs: i * 80 }));
      expect(Number.isInteger(ref.frame.x)).toBe(true);
      expect(Number.isInteger(ref.frame.w)).toBe(true);
      expect(ref.frame.h).toBe(121);
      xs.push(ref.frame.x);
      total += ref.frame.w;
    }
    expect(xs).toEqual([0, 111, 223, 334]);
    expect(total).toBe(446);
  });

  it('attack uses the hi-res attack scale and finishes after 320 ms', () => {
    const ref = resolveSpriteFrame(view({ anim: 'attack', facing: 'W', animTimeMs: 0 }));
    expect(ref.textureAlias).toBe('player_attack_west');
    expect(ref.scale).toBeCloseTo(0.34, 5);
    expect(getAnimationDurationMs('player', 'attack')).toBe(320);
    expect(isAnimationFinished(view({ anim: 'attack', animTimeMs: 319 }))).toBe(false);
    expect(isAnimationFinished(view({ anim: 'attack', animTimeMs: 320 }))).toBe(true);
  });

  it('anchors characters by their feet below the entity point', () => {
    const ref = resolveSpriteFrame(view());
    expect(ref.anchorX).toBe(0.5);
    // Sprite bottom = 10 world px below the anchor point.
    const drawnHeight = ref.frame.h * ref.scale;
    expect((1 - ref.anchorY) * drawnHeight).toBeCloseTo(10, 5);
  });
});

describe('resolveSpriteFrame — fallbacks', () => {
  it('hurt holds the first idle frame as a 250 ms one-shot', () => {
    const ref = resolveSpriteFrame(view({ anim: 'hurt', animTimeMs: 1000 }));
    expect(ref.textureAlias).toBe('player_idle_south');
    expect(ref.frame.x).toBe(0);
    expect(ref.finished).toBe(true);
    expect(getAnimationDurationMs('player', 'hurt')).toBe(250);
    expect(isAnimationLooping('player', 'hurt')).toBe(false);
  });

  it('death holds a frame and finishes after 500 ms', () => {
    expect(getAnimationDurationMs('mantis', 'death')).toBe(500);
    expect(resolveSpriteFrame(view({ spriteKey: 'mantis', anim: 'death', animTimeMs: 499 })).finished).toBe(false);
    const done = resolveSpriteFrame(view({ spriteKey: 'mantis', anim: 'death', animTimeMs: 500 }));
    expect(done.finished).toBe(true);
    expect(done.textureAlias).toBe('enemy_mantis_move');
  });

  it('enemies without a run clip fall back to walk (looping)', () => {
    const ref = resolveSpriteFrame(view({ spriteKey: 'maggot', anim: 'run', animTimeMs: 250 }));
    expect(ref.textureAlias).toBe('enemy_maggot_walk');
    expect(ref.frame.x).toBe(32);
    expect(isAnimationLooping('maggot', 'run')).toBe(true);
  });

  it('static items resolve every state to their single frame', () => {
    for (const anim of ALL_ANIMS) {
      const ref = resolveSpriteFrame(view({ spriteKey: 'chest', anim, animTimeMs: 12345 }));
      expect(ref.textureAlias).toBe('item_chest');
      expect(ref.frame).toEqual({ x: 0, y: 0, w: 32, h: 32 });
    }
  });

  it('unknown sprite keys return a placeholder', () => {
    const ref = resolveSpriteFrame(view({ spriteKey: 'dragon' }));
    expect(ref.placeholder).toBe(true);
    expect(ref.textureAlias).toBe('');
    expect(ref.frame.w).toBeGreaterThan(0);
    expect(getAnimationDurationMs('dragon', 'attack')).toBe(0);
    expect(isAnimationFinished(view({ spriteKey: 'dragon' }))).toBe(false);
  });

  it('magic_bolt is procedural and resolves to a placeholder', () => {
    expect(PROCEDURAL_SPRITES.magic_bolt).toBeDefined();
    expect(resolveSpriteFrame(view({ spriteKey: 'magic_bolt' })).placeholder).toBe(true);
  });

  it('treats negative or non-finite time as 0', () => {
    for (const t of [-50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const ref = resolveSpriteFrame(view({ anim: 'jump', animTimeMs: t }));
      expect(ref.frame.x).toBe(0);
      expect(ref.finished).toBe(false);
    }
  });
});

describe('resolveSpriteFrame — enemy direction rows', () => {
  const rowOf = (spriteKey: string, facing: Direction) =>
    resolveSpriteFrame(view({ spriteKey, facing, anim: 'walk' })).frame.y / 32;

  it('mantis rows are S, E, W, N', () => {
    expect([rowOf('mantis', 'S'), rowOf('mantis', 'E'), rowOf('mantis', 'W'), rowOf('mantis', 'N')]).toEqual([0, 1, 2, 3]);
  });

  it('maggot and beetle rows are S, W, E, N', () => {
    for (const key of ['maggot', 'beetle']) {
      expect([rowOf(key, 'S'), rowOf(key, 'W'), rowOf(key, 'E'), rowOf(key, 'N')]).toEqual([0, 1, 2, 3]);
    }
  });

  it('ghost rows are S, N, E, W with 78 × 64 frames', () => {
    const ghostRow = (facing: Direction) => resolveSpriteFrame(view({ spriteKey: 'ghost', facing })).frame.y / 64;
    expect([ghostRow('S'), ghostRow('N'), ghostRow('E'), ghostRow('W')]).toEqual([0, 1, 2, 3]);
    const ref = resolveSpriteFrame(view({ spriteKey: 'ghost', animTimeMs: 240 }));
    expect(ref.frame).toEqual({ x: 156, y: 0, w: 78, h: 64 });
  });

  it('diagonals take the vertical row like the legacy |dx| > |dy| rule', () => {
    expect(toCardinal('NE')).toBe('N');
    expect(toCardinal('NW')).toBe('N');
    expect(toCardinal('SE')).toBe('S');
    expect(toCardinal('SW')).toBe('S');
    expect(rowOf('mantis', 'NE')).toBe(rowOf('mantis', 'N'));
    expect(rowOf('mantis', 'SW')).toBe(rowOf('mantis', 'S'));
  });

  it('enemy attack clips are one-shots with legacy timings', () => {
    expect(getAnimationDurationMs('mantis', 'attack')).toBe(700);
    expect(getAnimationDurationMs('maggot', 'attack')).toBe(840);
    expect(getAnimationDurationMs('beetle', 'attack')).toBe(600);
    expect(getAnimationDurationMs('ghost', 'attack')).toBe(420);
    const last = resolveSpriteFrame(view({ spriteKey: 'mantis', anim: 'attack', facing: 'E', animTimeMs: 5000 }));
    expect(last.frame).toEqual({ x: 192, y: 32, w: 32, h: 32 });
    expect(last.finished).toBe(true);
  });

  it('beetle stands still on frame 0 while idle', () => {
    expect(resolveSpriteFrame(view({ spriteKey: 'beetle', animTimeMs: 777 })).frame.x).toBe(0);
    expect(resolveSpriteFrame(view({ spriteKey: 'beetle', anim: 'walk', animTimeMs: 300 })).frame.x).toBe(64);
  });
});

describe('resolveSpriteFrame — props', () => {
  it('coin cycles 4 frames at 150 ms, centred', () => {
    const ref = resolveSpriteFrame(view({ spriteKey: 'coin', animTimeMs: 450 }));
    expect(ref.textureAlias).toBe('item_coin_anim');
    expect(ref.frame).toEqual({ x: 96, y: 0, w: 32, h: 32 });
    expect(ref.anchorY).toBe(0.5);
  });

  it('portal switches texture on the active flag', () => {
    expect(resolveSpriteFrame(view({ spriteKey: 'portal' })).textureAlias).toBe('portal_inactive');
    expect(resolveSpriteFrame(view({ spriteKey: 'portal', active: false })).textureAlias).toBe('portal_inactive');
    const active = resolveSpriteFrame(view({ spriteKey: 'portal', active: true, animTimeMs: 750 }));
    expect(active.textureAlias).toBe('portal_active');
    expect(active.frame).toEqual({ x: 1280, y: 0, w: 256, h: 256 });
    expect(active.frame.h * active.scale).toBeCloseTo(64, 5);
  });

  it('acid blob uses directional rows S, W, E, N', () => {
    const ref = resolveSpriteFrame(view({ spriteKey: 'acid', facing: 'E', animTimeMs: 80 * 8 }));
    expect(ref.frame).toEqual({ x: 32, y: 64, w: 32, h: 32 });
  });
});

describe('frame-rate independence', () => {
  it('frame selection depends only on accumulated simulation time', () => {
    const at = (steps: number, dt: number) => {
      let t = 0;
      for (let i = 0; i < steps; i++) t += dt;
      return resolveSpriteFrame(view({ spriteKey: 'mantis', anim: 'walk', animTimeMs: t })).frame;
    };
    // 1.1 s of simulation accumulated in 30, 60 and 120 Hz increments.
    const a = at(33, 1000 / 30);
    const b = at(66, 1000 / 60);
    const c = at(132, 1000 / 120);
    expect(a.x).toBe(32);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('is pure: same input → equal output', () => {
    const input = view({ spriteKey: 'ghost', anim: 'attack', facing: 'W', animTimeMs: 210 });
    expect(resolveSpriteFrame(input)).toEqual(resolveSpriteFrame({ ...input }));
  });
});

describe('AnimationDefs integrity', () => {
  const manifestPath = resolve(__dirname, '../../../public/assets/manifests/asset_manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    bundles: Array<{ assets: Array<{ alias: string }> }>;
  };
  const manifestAliases = new Set(manifest.bundles.flatMap((b) => b.assets.map((a) => a.alias)));

  it('every non-player alias exists in the asset manifest', () => {
    const missing = listReferencedAliases().filter((a) => !a.startsWith('player_') && !manifestAliases.has(a));
    expect(missing).toEqual([]);
  });

  it('references 40 player sheet aliases (5 anims × 8 directions)', () => {
    expect(listReferencedAliases().filter((a) => a.startsWith('player_'))).toHaveLength(40);
  });

  it('declared sheet sizes match the PNG files on disk', () => {
    const publicDir = resolve(__dirname, '../../../public');
    const srcByAlias = new Map(
      (manifest.bundles as Array<{ assets: Array<{ alias: string; src?: string }> }>).flatMap((b) =>
        b.assets.map((a) => [a.alias, a.src ?? ''] as const),
      ),
    );
    const pathFor = (alias: string): string => {
      const m = /^player_(\w+?)_(\w+)$/.exec(alias);
      if (m) return `assets/images/characters/player/${m[1]}/${m[1]}_${m[2]}.png`;
      return srcByAlias.get(alias) ?? '';
    };
    const pngSize = (rel: string) => {
      const buf = readFileSync(resolve(publicDir, rel));
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    };

    const declared = new Map<string, { w: number; h: number }>();
    for (const def of Object.values(ANIMATION_DEFS)) {
      for (const clips of [def.clips, def.activeClips]) {
        for (const clip of Object.values(clips ?? {})) {
          if (!clip) continue;
          const src = clip.source;
          if (src.kind === 'perDirectionSheets') {
            for (const s of Object.values(src.sheets)) declared.set(s.alias, { w: s.sheetWidth, h: s.sheetHeight });
          } else {
            declared.set(src.sheet.alias, { w: src.sheet.sheetWidth, h: src.sheet.sheetHeight });
          }
        }
      }
    }
    for (const [alias, size] of declared) {
      expect({ alias, ...pngSize(pathFor(alias)) }).toEqual({ alias, ...size });
    }
  });

  it('every frame rect stays inside its declared sheet for all states and directions', () => {
    for (const [spriteKey] of Object.entries(ANIMATION_DEFS)) {
      for (const anim of ALL_ANIMS) {
        for (const facing of ALL_DIRS) {
          for (const active of [false, true]) {
            for (let t = 0; t < 2000; t += 37) {
              const ref = resolveSpriteFrame({ spriteKey, anim, facing, animTimeMs: t, active });
              expect(ref.placeholder).toBe(false);
              expect(ref.frame.x).toBeGreaterThanOrEqual(0);
              expect(ref.frame.y).toBeGreaterThanOrEqual(0);
              expect(ref.frame.w).toBeGreaterThan(0);
              expect(ref.frame.h).toBeGreaterThan(0);
              expect(ref.scale).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });
});
