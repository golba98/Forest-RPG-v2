import { expect, it } from 'vitest';
import { wadingPose, nearbyWaterBounds } from '../../../src/rendering/wadingGeometry';
import { resolveSpriteFrame } from '../../../src/animation/resolveSpriteFrame';
import { PLAYER_FOOTPRINT } from '../../../src/systems/EntityFootprint';
import { shorelineFixture } from '../../fixtures/shoreline-world';
import { bridgeFixture } from '../../fixtures/bridge-world';
import { bridgeGeometry } from '../../../src/world/BridgeGeometry';

it('keeps the waterline on the feet plane for every moving/idle facing', () => {
  const anchorY = 17.8875 * 32;
  const pose = wadingPose(12.5 * 32, anchorY);
  expect(pose.waterlineY).toBeCloseTo(18.1 * 32);
  for (const facing of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)
    for (const anim of ['idle', 'walk', 'run'] as const) {
      const frame = resolveSpriteFrame({ spriteKey: 'player', facing, anim, animTimeMs: 200 });
      const bottom = pose.spriteY + (1 - frame.anchorY) * frame.frame.h * frame.scale;
      expect(bottom - pose.waterlineY).toBeCloseTo(12);
      expect(pose.waterlineY).toBeCloseTo(anchorY + PLAYER_FOOTPRINT.offsetY * 32);
    }
});

it('clips ripples at the actual water boundary, keeping the bank face clean', () => {
  const world = shorelineFixture();
  const bounds = nearbyWaterBounds(world, 12.5 * 32, 18.1 * 32);
  expect(bounds.length).toBeGreaterThan(0);
  expect(bounds.every((b) => b.minY >= 18)).toBe(true);
});

it('excludes supported bridge decks from water effects in both orientations', () => {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    const { world, bridge } = bridgeFixture(orientation),
      deck = bridgeGeometry(bridge).deck;
    const bounds = nearbyWaterBounds(world, (bridge.x + 2) * 32, (bridge.y + 2) * 32);
    expect(bounds.length).toBeGreaterThan(0);
    expect(
      bounds.every(
        (b) =>
          b.maxX <= deck.minX || b.minX >= deck.maxX || b.maxY <= deck.minY || b.minY >= deck.maxY,
      ),
    ).toBe(true);
  }
});
