import { expect, it } from 'vitest';
import { Container, Texture, TextureSource } from 'pixi.js';
import { WorldDepthLayer, WorldObjects } from '../../../src/rendering/WorldObjects';
import { WorldVisibility } from '../../../src/rendering/WorldVisibility';
import type { TextureStore } from '../../../src/rendering/TextureStore';
import { bridgeFixture } from '../../fixtures/bridge-world';

const texture = new Texture({ source: new TextureSource({ width: 32, height: 32 }) });
function fixture() {
  const textures = {
    get: () => texture,
    getRect: (_alias: string, _x: number, _y: number, w: number, h: number) =>
      new Texture({ source: new TextureSource({ width: w, height: h }) }),
  } as unknown as TextureStore;
  const actors = new WorldDepthLayer(),
    ground = new Container(),
    bridges = new Container();
  const objects = new WorldObjects(textures, actors, ground, bridges, (s) => s);
  const base = bridgeFixture().world;
  const world = {
    ...base,
    meta: { ...base.meta, width: 150, height: 150, generatorVersion: 12 },
    tiles: new Uint8Array(150 * 150).fill(1),
    bridges: [],
    props: [
      { id: 100, kind: 'tree' as const, tileX: 50, tileY: 50, solid: true },
      { id: 101, kind: 'flower_clump' as const, tileX: 51, tileY: 50, solid: false },
      {
        id: 102,
        kind: 'rock_boulder' as const,
        tileX: 52,
        tileY: 50,
        solid: true,
        hilltop: { sourceX: 52, sourceY: 50 },
      },
    ],
  };
  world.tiles[49 * 150 + 51] = 11;
  return { objects, world, actors, ground, bridges };
}

it('recreates identical art, coordinates and depth after real eviction without changing world data', () => {
  const { objects, world } = fixture();
  const before = JSON.stringify(world);
  objects.setWorld(world);
  const planner = new WorldVisibility();
  const view = { x: 1500, y: 1550, width: 640, height: 480 };
  objects.update(planner.update(view, 16), 0);
  const record = objects.debugRecords.find((r) => r.id === 100)!;
  expect(record).toMatchObject({ width: 96, height: 128, resident: true, visible: true });
  objects.update(planner.update({ ...view, x: 3500, y: 3500 }, 16), 6000);
  expect(objects.debugRecords.find((r) => r.id === 100)?.resident).toBe(false);
  objects.update(planner.update(view, 16), 7000);
  expect(objects.debugRecords.find((r) => r.id === 100)).toEqual(record);
  expect(JSON.stringify(world)).toBe(before);
  expect(objects.debugRecords.filter((r) => r.hilltop)).toHaveLength(1);
  objects.clear();
  expect(objects.info.residentObjects).toBe(0);
});

it('removes offscreen cut props from the catalog so residency cannot resurrect them', () => {
  const { objects, world } = fixture();
  objects.setWorld(world);
  objects.removeProp(101);
  const planner = new WorldVisibility();
  objects.update(planner.update({ x: 1500, y: 1500, width: 640, height: 480 }, 16), 100);
  expect(objects.debugRecords.some((r) => r.id === 101)).toBe(false);
  expect(objects.info.propViews).toBe(2);
  objects.clear();
});

it('preserves equal-depth actor ordering after insertion in a different order', () => {
  const layer = new WorldDepthLayer();
  layer.sortableChildren = true;
  const a = new Container(),
    b = new Container(),
    actor = new Container();
  a.zIndex = b.zIndex = actor.zIndex = 100;
  layer.order.set(a, 1);
  layer.order.set(b, 2);
  layer.addChild(actor, b, a);
  layer.sortChildren();
  expect(layer.children).toEqual([a, b, actor]);
  a.removeFromParent();
  layer.addChild(a);
  layer.sortChildren();
  expect(layer.children).toEqual([a, b, actor]);
  layer.destroy({ children: true });
});
