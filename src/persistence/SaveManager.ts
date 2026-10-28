import { adaptLegacySave } from './LegacySaveAdapter';
import type { Entity } from '../types/entities';
import { isTileId } from '../types/tiles';
import type { WorldData } from '../types/world';
import type { Game } from '../game/Game';
import type { Simulation } from '../simulation/Simulation';

interface SavePayload { version: 2; world: Omit<WorldData, 'tiles'> & { tiles: number[] }; entities: Entity[]; time: number; elapsedMs: number; tutorialStage: number; runtime: { rngState: number; ghostNightSpawned: boolean }; legacyExtras?: Record<string, unknown> }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number => finite(v) && Number.isInteger(v);
const point = (v: unknown, w: number, h: number): boolean => object(v) && finite(v.x) && finite(v.y) && v.x >= 0 && v.x < w && v.y >= 0 && v.y < h;
const hasNumbers = (o: Record<string, unknown>, keys: string[]): boolean => keys.every(k => finite(o[k]));
const directions = ['N','NE','E','SE','S','SW','W','NW'];
const animations = ['idle','walk','run','jump','attack','hurt','death'];
function validEntity(v: unknown, w: number, h: number): v is Entity {
  if (!object(v) || !point(v, w, h) || !finite(v.halfSize) || v.halfSize <= 0 || v.halfSize > 2 || typeof v.id !== 'string' || !v.id || !directions.includes(String(v.facing)) || !animations.includes(String(v.anim)) || typeof v.alive !== 'boolean' || !hasNumbers(v, ['prevX','prevY','halfSize','animTimeMs'])) return false;
  if (v.kind === 'player') {
    if (!object(v.stats) || !hasNumbers(v.stats, ['health','maxHealth','mana','maxMana','stamina','maxStamina','level','xp','xpToNextLevel','statPoints','baseDamage','coins']) || !object(v.inventory) || !hasNumbers(v.inventory, ['healthPotions','speedPotions']) || !hasNumbers(v, ['vx','vy','sprintLockoutMs','jumpProgress','hurtTimerMs','comboCount','speedBuffMs']) || typeof v.isSprinting !== 'boolean' || typeof v.isJumping !== 'boolean' || typeof v.isDashing !== 'boolean') return false;
    const s = v.stats, i = v.inventory;
    return finite(s.maxHealth) && s.maxHealth > 0 && s.maxHealth <= 20 && finite(s.health) && s.health >= 0 && s.health <= s.maxHealth && finite(s.maxMana) && s.maxMana > 0 && s.maxMana <= 100000 && finite(s.mana) && s.mana >= 0 && s.mana <= s.maxMana && finite(s.maxStamina) && s.maxStamina > 0 && s.maxStamina <= 100000 && finite(s.stamina) && s.stamina >= 0 && s.stamina <= s.maxStamina && integer(s.level) && s.level >= 1 && s.level <= 1000 && finite(s.xpToNextLevel) && s.xpToNextLevel > 0 && finite(s.xp) && s.xp >= 0 && s.xp < s.xpToNextLevel && integer(s.statPoints) && s.statPoints >= 0 && s.statPoints <= 10000 && finite(s.baseDamage) && s.baseDamage > 0 && s.baseDamage <= 100000 && finite(s.coins) && s.coins >= 0 && finite(i.healthPotions) && i.healthPotions >= 0 && finite(i.speedPotions) && i.speedPotions >= 0;
  }
  if (v.kind === 'enemy') return ['mantis','maggot','beetle','ghost'].includes(String(v.enemyType)) && ['idle','patrol','chase','attack','flee','dead'].includes(String(v.aiState)) && typeof v.aggressive === 'boolean' && hasNumbers(v, ['health','maxHealth','hurtTimerMs','attackCooldownMs']);
  if (v.kind === 'pickup') return ['coin','health_potion','speed_potion','chest'].includes(String(v.pickupType));
  if (v.kind === 'portal') return typeof v.active === 'boolean';
  if (v.kind === 'projectile') return ['acid','magic_bolt'].includes(String(v.projectileType)) && typeof v.ownerId === 'string' && hasNumbers(v, ['vx','vy','damage','travelled','maxDistance']);
  return false;
}
function decode(raw: string): { world: WorldData; entities: Entity[]; time: number; elapsedMs: number; tutorialStage: number; runtime?: { rngState: number; ghostNightSpawned: boolean } } {
  const data: unknown = JSON.parse(raw);
  if (!object(data) || data.version !== 2 || !object(data.world) || !object(data.world.meta)) throw new Error('Unsupported or invalid save');
  const world = data.world, meta = world.meta as Record<string, unknown>, w = meta.width, h = meta.height;
  if (!integer(w) || !integer(h) || w < 3 || h < 3 || w > 512 || h > 512 || !integer(meta.seed) || !integer(meta.level) || !integer(meta.generatorVersion) || typeof meta.isTutorial !== 'boolean' || !['easy','normal','hard'].includes(String(meta.difficulty))) throw new Error('Invalid world metadata');
  if (!Array.isArray(world.tiles) || world.tiles.length !== w * h || !world.tiles.every((v: unknown) => integer(v) && isTileId(v))) throw new Error('Invalid terrain');
  if (!point(world.spawn,w,h) || !point(world.portal,w,h) || !Array.isArray(world.props) || world.props.length > Math.min(w * h, 25000) || !world.props.every((p: unknown) => object(p) && integer(p.id) && integer(p.tileX) && integer(p.tileY) && point({ x: p.tileX, y: p.tileY },w,h) && typeof p.solid === 'boolean' && ['tree','bush_small','bush_obstacle','flower_clump','flower_pink','flower_yellow','log_horizontal','log_vertical','log_stump','rock_boulder','rock_pebble','hole'].includes(String(p.kind)))) throw new Error('Invalid world objects');
  if (!Array.isArray(world.enemySpawns) || !Array.isArray(world.pickupSpawns) ||
    !world.enemySpawns.every((v: unknown) => point(v,w,h) && object(v) && ['mantis','maggot','beetle','ghost'].includes(String(v.type)) && (v.aggressive === undefined || typeof v.aggressive === 'boolean') && (v.maxHealth === undefined || finite(v.maxHealth))) ||
    !world.pickupSpawns.every((v: unknown) => point(v,w,h) && object(v) && ['coin','health_potion','speed_potion','chest'].includes(String(v.type)))) throw new Error('Invalid spawn data');
  if (!Array.isArray(data.entities) || data.entities.length > Math.min(w * h, 4096) || !data.entities.every((e: unknown) => validEntity(e,w,h)) || data.entities.filter((e: Entity) => e.kind === 'player').length !== 1 || data.entities.filter((e: Entity) => e.kind === 'portal').length !== 1 || new Set(data.entities.map((e: Entity) => e.id)).size !== data.entities.length) throw new Error('Invalid entities');
  if (!finite(data.time) || data.time < 0 || data.time >= 1 || !finite(data.elapsedMs) || data.elapsedMs < 0 || !integer(data.tutorialStage) || data.tutorialStage < 0 || data.tutorialStage > 4) throw new Error('Invalid simulation clock');
  if (data.runtime !== undefined && (!object(data.runtime) || !integer(data.runtime.rngState) || data.runtime.rngState < 0 || data.runtime.rngState > 0xffffffff || typeof data.runtime.ghostNightSpawned !== 'boolean')) throw new Error('Invalid runtime state');
  const runtime = data.runtime as { rngState: number; ghostNightSpawned: boolean } | undefined;
  return { world: { ...(world as unknown as WorldData), tiles: Uint8Array.from(world.tiles as number[]) }, entities: data.entities as Entity[], time: data.time, elapsedMs: data.elapsedMs, tutorialStage: data.tutorialStage, ...(runtime ? { runtime } : {}) };
}
export class SaveManager {
  private legacyExtras: Record<string, unknown> | undefined;
  constructor(private readonly storage: Storage, private readonly game: Game, private readonly sim: Simulation) {}
  export(): string {
    const payload: SavePayload = { version: 2, world: { ...this.sim.world, tiles: Array.from(this.sim.world.tiles) }, entities: [...this.sim.getEntities()], time: this.sim.getTimeOfDay(), elapsedMs: this.sim.elapsedMs, tutorialStage: this.sim.tutorial.stage, runtime: this.sim.getRuntimeState(), ...(this.legacyExtras ? { legacyExtras: this.legacyExtras } : {}) };
    return JSON.stringify(payload);
  }
  import(raw: string): void {
    if (raw.length > 8_000_000) throw new Error('Save file is too large');
    const parsed: unknown = JSON.parse(raw);
    if (object(parsed) && parsed.version === undefined) {
      const legacy = adaptLegacySave(parsed);
      this.game.loadWorld(legacy.world);
      const enemies = this.sim.getEntities().filter(e => e.kind === 'enemy');
      legacy.enemyHealth.forEach((health, i) => { const e = enemies[i]; if (e?.kind === 'enemy') { e.health = health.health; e.maxHealth = health.maxHealth; } });
      this.legacyExtras = legacy.legacyExtras;
      return;
    }
    const state = decode(raw); // Validate fully before touching the running game.
    this.legacyExtras = object(parsed) && object(parsed.legacyExtras) ? parsed.legacyExtras : undefined;
    this.game.loadWorld(state.world);
    this.sim.restoreEntities(state.entities, state.time, state.elapsedMs, state.tutorialStage, state.runtime);
  }
  save(slot = 'auto'): void {
    if (!/^[a-z0-9_-]{1,32}$/i.test(slot)) throw new Error('Invalid save slot');
    this.storage.setItem(`forestrpg.v2.save.${slot}`, this.export());
  }
  load(slot = 'auto'): void {
    if (!/^[a-z0-9_-]{1,32}$/i.test(slot)) throw new Error('Invalid save slot');
    const current = this.storage.getItem(`forestrpg.v2.save.${slot}`);
    const legacy = slot === 'auto' && !current ? this.storage.getItem('autosave_map') : null;
    const raw = current ?? legacy; if (!raw) throw new Error('No saved game in this slot'); this.import(raw);
    if (legacy) this.save(slot);
  }
  exists(slot = 'auto'): boolean { try { return this.storage.getItem(`forestrpg.v2.save.${slot}`) !== null || (slot === 'auto' && this.storage.getItem('autosave_map') !== null); } catch { return false; } }
}
