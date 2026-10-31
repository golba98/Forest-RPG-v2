import { afterEach, expect, it } from 'vitest';
import { Container, Texture, TextureSource } from 'pixi.js';
import { GroveView } from '../../../src/rendering/GroveView';
import type { EncounterSiteView } from '../../../src/types/encounters';
import { GROVE_ASSETS } from '../../../src/rendering/groveArt';

const owned: { view: GroveView; actors: Container; textures: Texture[] }[] = [];
function fixture() {
  const textures = GROVE_ASSETS.map(
    (a) => new Texture({ source: new TextureSource({ width: a.width, height: a.height }) }),
  );
  const view = new GroveView(),
    actors = new Container();
  actors.sortableChildren = true;
  const store = {
    get: (alias: string) => textures[GROVE_ASSETS.findIndex((a) => a.alias === alias)]!,
  };
  owned.push({ view, actors, textures });
  const site: EncounterSiteView = {
    id: 'grove-1',
    kind: 'grove',
    x: 10.5,
    y: 10.5,
    phase: 'available',
    discovered: true,
    progress: 0,
  };
  return { view, actors, store, site, textures };
}
afterEach(() => {
  for (const { view, actors, textures } of owned) {
    view.reset();
    view.ground.destroy();
    actors.destroy({ children: true });
    for (const t of textures) t.destroy(true);
  }
  owned.length = 0;
});
it('uses native bitmap frames and sorts the stump at its ground contact', () => {
  const { view, actors, store, site } = fixture();
  view.update([site], actors, store, Texture.EMPTY);
  expect(actors.children).toHaveLength(1);
  expect(view.ground.children).toHaveLength(13);
  expect(view.info[0]).toMatchObject({
    width: 64,
    height: 48,
    scaleX: 1,
    scaleY: 1,
    fungi: 12,
    x: 336,
    y: 344,
    depth: 334,
  });
  for (const s of view.ground.children.slice(1)) expect(s.scale.x).toBe(1);
});
it('reuses sprites across phases and movement; removes stale sites and releases sprites, not shared art', () => {
  const { view, actors, store, site, textures } = fixture();
  view.update([site], actors, store, Texture.EMPTY);
  const body = actors.children[0]!;
  for (const phase of ['active', 'cooldown', 'available'] as const)
    view.update([{ ...site, phase, x: 11 }], actors, store, Texture.EMPTY);
  expect(actors.children).toEqual([body]);
  expect(body.x).toBe(352);
  expect(view.ground.children).toHaveLength(13);
  view.update([], actors, store, Texture.EMPTY);
  expect(body.destroyed).toBe(true);
  expect(actors.children).toHaveLength(0);
  expect(view.ground.children).toHaveLength(0);
  expect(textures.every((t) => !t.source.destroyed)).toBe(true);
  view.update([site], actors, store, Texture.EMPTY);
  view.reset();
  view.reset();
  expect(actors.children).toHaveLength(0);
  expect(view.info).toEqual([]);
});
it('reports missing grove bitmaps instead of silently accepting placeholders', () => {
  const { view, actors, site } = fixture();
  view.update([site], actors, { get: () => Texture.EMPTY }, Texture.EMPTY);
  expect(view.placeholderCount({ isPlaceholder: (t) => t === Texture.EMPTY })).toBe(13);
});
