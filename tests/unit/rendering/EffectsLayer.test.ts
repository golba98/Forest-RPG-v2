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
    effects.slash(100, 100, Math.PI / 2, false);
    effects.update(80, false, 1280, 720);
    expect(effects.activeCount).toBe(1);
    expect(effects.overlay.getLocalBounds().width).toBeGreaterThan(10);
    effects.update(100, false, 1280, 720);
    effects.update(16, false, 1280, 720);
    expect(effects.activeCount).toBe(0);
    expect(effects.overlay.getLocalBounds().width).toBe(0);
  });

  it('gives the finisher a larger arc', () => {
    const normal = create(), finisher = create();
    normal.slash(0, 0, Math.PI / 2, false);
    finisher.slash(0, 0, Math.PI / 2, true);
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
    effects.slash(0, 0, 0, false);
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
