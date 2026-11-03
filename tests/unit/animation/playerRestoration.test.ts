import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { playerPose, poseFrame } from '../../../src/animation/PlayerMotion';
import type { RenderEntityView } from '../../../src/types/render';
it('retains all 56 complete approved source sheets byte for byte', async () => {
  const hashes = JSON.parse(
    await fs.readFile('docs/assets/source/player-face-continuity/sheet-hashes.json', 'utf8'),
  );
  expect(Object.keys(hashes)).toHaveLength(56);
  for (const [file, hash] of Object.entries(hashes))
    expect(
      createHash('sha256')
        .update(await fs.readFile(`public/assets/images/characters/player/${file}`))
        .digest('hex'),
      file,
    ).toBe(hash);
});
it('selects complete original punches, with authoritative jump recovery and locked facing', () => {
  const v = {
    id: 'p',
    kind: 'player',
    spriteKey: 'player',
    anim: 'attack',
    animTimeMs: 0,
    facing: 'SE',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    lift: 1,
    alpha: 1,
    hurtFlash: false,
    isJumping: true,
    jumpProgress: 0.8,
    attack: { swingId: 1, comboStep: 2, direction: 'NW', elapsedMs: 120 },
  } as RenderEntityView;
  expect(playerPose(v, 0).upper).toEqual({ clip: 'attack2', frame: 6, facing: 'NW' });
  expect(playerPose(v, 0).lower).toEqual(playerPose(v, 0).upper);
  expect(playerPose({ ...v, attack: null }, 0).upper).toEqual({
    clip: 'jump',
    frame: 12,
    facing: 'SE',
  });
  expect(poseFrame('attack', 359)).toBe(17);
  expect(poseFrame('jump', 499)).toBe(15);
});
