import { afterEach, describe, expect, it } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { EffectsLayer } from '../../../src/rendering/effects/EffectsLayer';
import type { EffectTextures } from '../../../src/rendering/effects/proceduralTextures';

const textures: EffectTextures = {
  bolt: Texture.EMPTY, glow: Texture.EMPTY, spark: Texture.EMPTY,
  ring: Texture.EMPTY, leaf: Texture.EMPTY, clouds: [],
};
const layers: Array<{ parent: Container; effects: EffectsLayer }> = [];

function create(): EffectsLayer {
  const parent = new Container();
  const effects = new EffectsLayer(parent, textures);
  layers.push({ parent, effects });
  return effects;
}

afterEach(() => {
  for (const { parent, effects } of layers) {
    effects.clear();
    effects.overlay.destroy();
    effects.ground.destroy();
    effects.transition.destroy();
    parent.destroy({ children: true });
  }
  layers.length = 0;
});

describe('combat effects', () => {
  it('draws a slash during its lifetime and removes it after expiration', () => {
    const effects = create();
    effects.syncPlayerSlash({ swingId: 1, comboStep: 1, x: 100, y: 100, angle: Math.PI / 2, age: 80 });
    effects.update(80, false, 1280, 720);
    expect(effects.activeCount).toBe(1);
    expect(effects.overlay.getLocalBounds().width).toBeGreaterThan(10);
    effects.syncPlayerSlash({ swingId: 1, comboStep: 1, x: 100, y: 100, angle: Math.PI / 2, age: 180 });
    effects.update(100, false, 1280, 720);
    effects.update(16, false, 1280, 720);
    expect(effects.activeCount).toBe(0);
    expect(effects.overlay.getLocalBounds().width).toBe(0);
  });

  it('gives the finisher a larger arc', () => {
    const normal = create(), finisher = create();
    normal.syncPlayerSlash({ swingId: 1, comboStep: 1, x: 0, y: 0, angle: Math.PI / 2, age: 80 });
    finisher.syncPlayerSlash({ swingId: 3, comboStep: 3, x: 0, y: 0, angle: Math.PI / 2, age: 80 });
    normal.update(80, false, 1280, 720);
    finisher.update(80, false, 1280, 720);
    expect(finisher.overlay.getLocalBounds().width).toBeGreaterThan(normal.overlay.getLocalBounds().width);
  });

  it('expands rings, freezes all combat feedback while paused, and resumes expiration', () => {
    const effects = create();
    effects.ring(100, 100, 112, 0xbfe8ff, 320);
    effects.burst(100, 100, 0xffffff, 1, 1);
    effects.update(40, false, 1280, 720);
    const earlyWidth = effects.overlay.getLocalBounds().width;
    effects.update(80, false, 1280, 720);
    const bounds = { ...effects.overlay.getLocalBounds() };
    const spark = layers[0]!.parent.children[0]!;
    const position = { x: spark.x, y: spark.y, alpha: spark.alpha };
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(earlyWidth);
    effects.update(1000, true, 1280, 720);
    expect({ ...effects.overlay.getLocalBounds() }).toEqual(bounds);
    expect({ x: spark.x, y: spark.y, alpha: spark.alpha }).toEqual(position);
    expect(effects.activeCount).toBe(2);
    effects.update(400, false, 1280, 720);
    expect(effects.activeCount).toBe(0);
    expect(spark.destroyed).toBe(true);
  });

  it('clears feedback and any transition when the world is replaced', () => {
    const effects = create();
    effects.syncPlayerSlash({ swingId: 1, comboStep: 1, x: 0, y: 0, angle: 0, age: 40 });
    effects.ring(0, 0, 112, 0xbfe8ff, 320);
    effects.burst(0, 0, 0xffffff, 2, 1);
    effects.startTransition();
    effects.update(40, false, 1280, 720);
    effects.clear();
    expect(effects.activeCount).toBe(0);
    expect(layers[0]!.parent.children).toHaveLength(0);
    expect(effects.overlay.getLocalBounds().width).toBe(0);
    expect(effects.transitionActive).toBe(false);
    expect(effects.transition.getLocalBounds().width).toBe(0);
  });
});

it('follows authoritative slash identity and age across skipped frames, pause and combos', () => {
  const fx = create();
  const slash = { swingId: 1, comboStep: 1, x: 100, y: 88, angle: 0, age: 100 };
  fx.syncPlayerSlash(slash); fx.update(1000, false, 1280, 720);
  expect(fx.getPlayerSlash()).toEqual(slash); // Render time cannot age simulation-owned feedback.
  const firstBounds = { ...fx.overlay.getLocalBounds() };
  fx.syncPlayerSlash({ ...slash, x: 140 }); fx.update(0, true, 1280, 720);
  expect(fx.overlay.getLocalBounds().minX - firstBounds.minX).toBeCloseTo(40);
  // A missed reset can leave the newer attack older than the last observed age.
  fx.syncPlayerSlash({ ...slash, swingId: 3, comboStep: 3, age: 110 });
  fx.update(0, false, 1280, 720);
  expect(fx.getPlayerSlash()?.swingId).toBe(3);
  expect(fx.getPlayerSlash()?.comboStep).toBe(3);
  for (const age of [170, 250, 360]) {
    fx.syncPlayerSlash({ ...slash, swingId: 4, age }); fx.update(0, false, 1280, 720);
    expect(fx.getPlayerSlash()).toBeNull();
    expect(fx.overlay.getLocalBounds().width).toBe(0);
  }
});
