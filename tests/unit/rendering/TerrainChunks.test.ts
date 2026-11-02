import { expect, it, vi } from 'vitest';
import { Sprite, Texture, TextureSource, type Renderer } from 'pixi.js';
import { TerrainChunks } from '../../../src/rendering/TerrainChunks';
import { WorldVisibility } from '../../../src/rendering/WorldVisibility';
import type { TextureStore } from '../../../src/rendering/TextureStore';
import { bridgeFixture } from '../../fixtures/bridge-world';

function fixture() {
  const texture = new Texture({ source: new TextureSource({ width: 32, height: 32 }) });
  const textures = { get: () => texture } as unknown as TextureStore;
  const render = vi.fn();
  const chunks = new TerrainChunks({ render } as unknown as Renderer, textures);
  const base = bridgeFixture().world;
  const world = {
    ...base,
    meta: { ...base.meta, width: 150, height: 150 },
    tiles: new Uint8Array(150 * 150).fill(1),
    props: [],
    bridges: [],
  };
  chunks.setWorld(world);
  return { chunks, world, render };
}

it('prepares the visible working set, evicts actual resources, and rebuilds from current tiles', () => {
  const { chunks, render } = fixture();
  const planner = new WorldVisibility();
  const view = { x: 500, y: 500, width: 640, height: 480 };
  chunks.update(planner.update(view, 16), 0);
  expect(chunks.info.residentChunks).toBeLessThan(100);
  expect(chunks.info.queuedChunks).toBe(0);
  expect(chunks.info.urgentMisses).toBe(0);
  const sprite = chunks.view.children[0] as Sprite;
  const oldTexture = sprite.texture;
  const oldSource = oldTexture.source;
  chunks.update(planner.update({ ...view, x: 3500, y: 3500 }, 16), 6000);
  expect(oldTexture.destroyed).toBe(true);
  expect(oldSource.destroyed).toBe(true);
  const count = render.mock.calls.length;
  chunks.update(planner.update(view, 16), 7000);
  expect(render.mock.calls.length).toBeGreaterThan(count);
  expect(chunks.info.resourceBytes + chunks.info.stagingBytes).toBeLessThanOrEqual(
    chunks.info.budgetBytes,
  );
  chunks.clear();
  expect(chunks.info.residentChunks).toBe(0);
});

it('does not allocate an offscreen dirty chunk and cancels staging on world replacement', () => {
  const { chunks, world, render } = fixture();
  const planner = new WorldVisibility();
  const view = { x: 500, y: 500, width: 640, height: 480 };
  chunks.update(planner.update(view, 16), 0);
  const count = render.mock.calls.length;
  chunks.invalidateTile(140, 140);
  chunks.update(planner.update(view, 16), 100);
  expect(render.mock.calls.length).toBe(count);
  chunks.invalidateTile(20, 20);
  chunks.update(planner.update(view, 16), 200);
  expect(render.mock.calls.length).toBeGreaterThan(count);
  chunks.setWorld(world);
  expect(chunks.info.residentChunks).toBe(0);
  expect(chunks.info.stagingBytes).toBe(0);
  planner.reset();
  chunks.update(planner.update(view, 16), 300);
  expect(chunks.info.queuedChunks).toBe(0);
  chunks.clear();
});

it('cancels partially prepared chunks without publishing stale jobs into a replacement world', () => {
  const { chunks, world } = fixture();
  const planner = new WorldVisibility();
  const view = { x: 500, y: 500, width: 640, height: 480 };
  chunks.update(planner.update(view, 16), 0);
  let time = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => time++);
  try {
    chunks.update(
      {
        visible: view,
        preparation: { ...view, width: 2000 },
        retention: { ...view, width: 3000 },
        discontinuity: false,
      },
      100,
    );
    expect(chunks.info.stagingBytes).toBeGreaterThan(0);
    chunks.setWorld({ ...world, tiles: world.tiles.slice() });
    expect(chunks.info.stagingBytes).toBe(0);
    expect(chunks.view.children).toHaveLength(0);
  } finally {
    clock.mockRestore();
    chunks.clear();
  }
});
