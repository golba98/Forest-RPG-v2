import { isTileId, LegacyTileMarker } from '../types/tiles';
import type { EnemySpawn, PickupSpawn, WorldData, WorldProp } from '../types/world';

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const position = (v: unknown, w: number, h: number): v is Record<string, unknown> & { x: number; y: number } => record(v) && number(v.x) && number(v.y) && v.x >= 0 && v.y >= 0 && v.x < w && v.y < h;
export interface LegacyConversion { world: WorldData; legacyExtras: Record<string, unknown>; enemyHealth: Array<{ health: number; maxHealth: number }> }
/** Converts the legacy row-major map format without mutating the supplied data. */
export function adaptLegacySave(value: unknown): LegacyConversion {
  if (!record(value) || !Number.isInteger(value.logicalW) || !Number.isInteger(value.logicalH)) throw new Error('Invalid legacy map dimensions');
  const w = value.logicalW as number, h = value.logicalH as number;
  if (w < 3 || h < 3 || w > 512 || h > 512 || !Array.isArray(value.mapStates) || value.mapStates.length !== w * h || !Array.isArray(value.terrainLayer) || value.terrainLayer.length !== w * h) throw new Error('Invalid legacy terrain');
  const tiles = new Uint8Array(w * h), pickupSpawns: PickupSpawn[] = [], enemySpawns: EnemySpawn[] = [], props: WorldProp[] = [];
  const markerTypes: Record<number, PickupSpawn['type']> = { [LegacyTileMarker.COIN]: 'coin', [LegacyTileMarker.HEALTH]: 'health_potion', [LegacyTileMarker.POWERUP]: 'speed_potion', [LegacyTileMarker.CHEST]: 'chest' };
  for (let i = 0; i < tiles.length; i++) {
    const id: unknown = value.mapStates[i], base: unknown = value.terrainLayer[i];
    if (!number(id) || !Number.isInteger(id)) throw new Error('Invalid legacy tile');
    if (isTileId(id)) { tiles[i] = id; continue; }
    if (id !== LegacyTileMarker.MOB && !(id in markerTypes)) throw new Error('Unknown legacy tile');
    if (!number(base) || !isTileId(base)) throw new Error('Invalid legacy underlying terrain');
    tiles[i] = base;
    const x = i % w, y = Math.floor(i / w);
    if (id === LegacyTileMarker.MOB && (!Array.isArray(value.enemies) || value.enemies.length === 0)) enemySpawns.push({ type: 'mantis', x, y });
    const pickup = markerTypes[id]; if (pickup) pickupSpawns.push({ type: pickup, x, y });
  }
  const trees = value.treeObjects ?? [];
  if (!Array.isArray(trees) || !trees.every(t => position(t,w,h))) throw new Error('Invalid legacy trees');
  for (const t of trees) props.push({ id: props.length, kind: 'tree', tileX: Math.floor(t.x), tileY: Math.floor(t.y), solid: true });
  const enemyHealth: LegacyConversion['enemyHealth'] = [];
  const enemies = value.enemies ?? [];
  if (!Array.isArray(enemies)) throw new Error('Invalid legacy enemies');
  for (const enemy of enemies) {
    if (!position(enemy,w,h) || !record(enemy) || !['mantis','maggot','beetle','ghost'].includes(String(enemy.type)) || !number(enemy.health) || !number(enemy.maxHealth) || enemy.maxHealth <= 0 || enemy.health < 0 || enemy.health > enemy.maxHealth) throw new Error('Invalid legacy enemy');
    enemySpawns.push({ type: enemy.type as EnemySpawn['type'], x: enemy.x, y: enemy.y, maxHealth: enemy.maxHealth });
    enemyHealth.push({ health: enemy.health, maxHealth: enemy.maxHealth });
  }
  const spawn = value.playerPosition === undefined ? { x: Math.floor(w / 2), y: Math.floor(h / 2) } : value.playerPosition;
  const portal = value.portalPos === undefined ? { x: Math.min(w - 1, Math.floor(w / 2) + 1), y: Math.floor(h / 2) } : value.portalPos;
  if (!position(spawn,w,h) || !position(portal,w,h)) throw new Error('Invalid legacy positions');
  const world: WorldData = { meta: { seed: 0, generatorVersion: 0, width: w, height: h, isTutorial: false, level: 1, difficulty: 'normal' }, tiles, props, spawn, portal, enemySpawns, pickupSpawns };
  return { world, legacyExtras: value, enemyHealth };
}
