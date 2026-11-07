import { it, expect } from 'vitest';
import { PlayerNativePresenter } from '../../../src/animation/PlayerNativePresenter';
import { placedPlayerHead, playerHead, blinkPlayerPixels } from '../../../src/animation/PlayerFace';
import type { PlayerPose, PlayerClip } from '../../../src/animation/PlayerMotion';
import type { Direction } from '../../../src/types/entities';
const dirs: Direction[] = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const pose = (clip: PlayerClip, frame: number, facing: Direction = 'S'): PlayerPose => ({
  upper: { clip, frame, facing },
  lower: { clip, frame, facing },
});
const cases: [PlayerClip, number, PlayerClip, number][] = [
  ['jump', 14, 'idle', 0],
  ['walk', 8, 'run', 9],
  ['run', 8, 'jump', 0],
  ['jump', 8, 'attack', 0],
  ['attack', 16, 'walk', 8],
  ['walk', 8, 'idle', 0],
];
it('keeps the exact head artwork through all 144 action transition poses', () => {
  for (const facing of dirs)
    for (const [ac, af, bc, bf] of cases) {
      const presenter = new PlayerNativePresenter(),
        from = pose(ac, af, facing),
        to = pose(bc, bf, facing);
      presenter.render(from);
      for (const step of [1, 2, 3] as const) {
        const pixels = presenter.render({
          ...to,
          transition: { id: 1, step, fromClip: ac, toClip: bc, from },
        });
        const head = { ...playerHead(to), offset: presenter.face!.headOffset };
        const template = placedPlayerHead(head);
        for (let i = 0; i < 4096; i++)
          if (template[i])
            expect(pixels[i], `${facing}/${ac}/${bc}/${step}/${i}`).toBe(template[i]);
      }
    }
});
it('retargets from unblinked pixels, never baking eyelids into transition history', () => {
  const open = new PlayerNativePresenter(),
    blinking = new PlayerNativePresenter();
  const from = pose('run', 8),
    to = pose('jump', 1),
    last = pose('attack', 0);
  open.render(from);
  blinking.render(from, 'closed');
  const bridge: PlayerPose = {
    ...to,
    transition: { id: 1, step: 1, fromClip: 'run', toClip: 'jump', from },
  };
  const clean = open.render(bridge),
    closed = blinking.render(bridge, 'closed');
  expect(closed).not.toEqual(clean);
  expect(blinking.render(bridge, 'closed')).toBe(closed);
  const retarget: PlayerPose = {
    ...last,
    transition: { id: 2, step: 2, fromClip: 'jump', toClip: 'attack', from: bridge },
  };
  expect(blinking.render(retarget, 'open')).toEqual(open.render(retarget));
  blinking.reset();
  expect(blinking.render(last)).toEqual(new PlayerNativePresenter().render(last));
});
it('eyelids affect only existing eye locations and remain behind an overlapping fist', () => {
  for (const facing of dirs)
    for (const clip of ['idle', 'walk', 'run', 'jump', 'attack', 'attack2', 'attack3'] as const) {
      const p = pose(clip, 6, facing),
        head = playerHead(p),
        presenter = new PlayerNativePresenter();
      const open = presenter.render(p),
        closed = blinkPlayerPixels(open, head, 'closed');
      const eyes = presenter.face!.eyes;
      for (let i = 0; i < 4096; i++) {
        if (head.foreground[i]) expect(closed[i]).toBe(open[i]);
        if (open[i] !== closed[i])
          expect(
            eyes.some(
              ([x, y, w, h]) =>
                i % 64 >= x! &&
                i % 64 < x! + w! &&
                Math.floor(i / 64) >= y! &&
                Math.floor(i / 64) < y! + h!,
            ),
          ).toBe(true);
      }
      if (!eyes.length) expect(closed).toBe(open);
      expect(presenter.render(p, 'closing')).toEqual(presenter.render(p, 'opening'));
      expect(presenter.render(p, 'open')).toBe(open);
    }
});
