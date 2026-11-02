import { bridgeFixture } from './bridge-world';
import type { Direction, Entity } from '../../src/types/entities';
import type { WorldData } from '../../src/types/world';
import { Assets, Texture } from 'pixi.js';

export type StudyDirection = Direction;
export type StudyScene = 'tree' | 'rock' | 'bridge' | 'overlap';
export const studyPositions: Record<StudyScene, [number, number]> = {
  tree: [16.5, 15.8],
  rock: [18.5, 17.6],
  bridge: [22, 18.8],
  overlap: [15.5, 14.3],
};

/** Hash the decoded texture actually resident in Pixi, including worker loads. */
export async function studyTextureDigest(alias: string): Promise<string> {
  const texture: unknown = Assets.cache.get(alias);
  if (!(texture instanceof Texture)) throw Error(`Missing study texture ${alias}`);
  const canvas = document.createElement('canvas');
  canvas.width = texture.source.width;
  canvas.height = texture.source.height;
  const context = canvas.getContext('2d');
  if (!context) throw Error('Cannot inspect decoded texture');
  context.drawImage(texture.source.resource as CanvasImageSource, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const hash = await crypto.subtle.digest('SHA-256', rgba);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** QA-only saved scene; uses the real simulation, renderer, props and bridge. */
export function installPlayerStudy(
  host: Window,
  direction: StudyDirection,
  scene: StudyScene,
  rain = false,
): void {
  const g = host.__GAME__;
  if (!g) throw Error('Game diagnostics are not ready');
  const { world } = bridgeFixture();
  const props: WorldData['props'] = [
    { id: 10, kind: 'tree', tileX: 16, tileY: 14, solid: true },
    { id: 11, kind: 'tree', tileX: 13, tileY: 19, solid: true },
    { id: 12, kind: 'rock_boulder', tileX: 18, tileY: 16, solid: true },
    { id: 13, kind: 'log_horizontal', tileX: 15, tileY: 21, solid: true },
  ];
  g.saveGame('player-art-study');
  const raw = host.localStorage.getItem('forestrpg.v2.save.player-art-study');
  if (!raw) throw Error('Study save missing');
  const save = JSON.parse(raw);
  save.world = { ...world, props, tiles: Array.from(world.tiles) };
  delete save.runtime.encounters;
  delete save.runtime.moisture;
  save.entities = save.entities.filter((e: Entity) => e.kind === 'player' || e.kind === 'portal');
  const [x, y] = studyPositions[scene];
  for (const e of save.entities) {
    Object.assign(e, {
      x: e.kind === 'player' ? x : 35.5,
      y: e.kind === 'player' ? y : 35.5,
      prevX: e.kind === 'player' ? x : 35.5,
      prevY: e.kind === 'player' ? y : 35.5,
      facing: direction,
      anim: 'idle',
      animTimeMs: 0,
    });
    if (e.kind === 'player') Object.assign(e, { comboCount: 0, isJumping: false, jumpProgress: 0 });
  }
  save.time = rain ? 0.02 : 0.5;
  save.elapsedMs = 0;
  host.localStorage.setItem('forestrpg.v2.save.player-art-study', JSON.stringify(save));
  if (!g.loadGame('player-art-study')) throw Error('Study load failed');
  g.setTimeScale(1);
  g.setPlayerStamina(100);
  g.setPlayerMana(100);
  g.setDaylightRatio(save.time);
  g.executeCommand(rain ? '/weather rain' : '/weather clear');
}
