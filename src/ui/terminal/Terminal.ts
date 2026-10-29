import type { SaveManager } from '../../persistence/SaveManager';
import { awardXp } from '../../systems/ProgressionSystem';
import type { Game } from '../../game/Game';
import type { Simulation } from '../../simulation/Simulation';
import type { EnemyEntity, EnemyType, PickupEntity } from '../../types/entities';
import type { OnboardingStore } from '../../persistence/OnboardingStore';
import { formatLandscapeInspection, inspectLandscape } from '../../world/LandscapeInspector';

/** Explicitly registered diagnostic commands; never evaluates JavaScript. */
export class Terminal {
  private readonly overlay = document.createElement('section');
  private readonly output = document.createElement('pre');
  private readonly input = document.createElement('input');
  private history: string[] = [];
  private historyIndex = 0;
  constructor(private readonly game: Game, private readonly sim: Simulation, private readonly onboarding: OnboardingStore, private readonly saves?: SaveManager) {
    this.overlay.id = 'debug-terminal'; this.overlay.hidden = true; this.overlay.setAttribute('role', 'dialog'); this.overlay.setAttribute('aria-label', 'Debug terminal');
    this.input.setAttribute('aria-label', 'Terminal command'); this.input.autocomplete = 'off'; this.input.placeholder = '/help'; this.overlay.append(this.output, this.input); document.body.append(this.overlay);
    this.input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape' || event.code === 'Backquote') { event.preventDefault(); this.close(); }
      else if (event.key === 'Enter') { event.preventDefault(); const text = this.input.value.trim(); this.input.value = ''; if (text) { this.history.push(text); this.historyIndex = this.history.length; const result = this.execute(text); if (result) this.output.textContent += `> ${text}\n${result}\n`; this.output.scrollTop = this.output.scrollHeight; } }
      else if (event.key === 'ArrowUp') { event.preventDefault(); this.historyIndex = Math.max(0, this.historyIndex - 1); this.input.value = this.history[this.historyIndex] ?? ''; }
      else if (event.key === 'ArrowDown') { event.preventDefault(); this.historyIndex = Math.min(this.history.length, this.historyIndex + 1); this.input.value = this.history[this.historyIndex] ?? ''; }
    });
  }
  open(): void { if (this.game.currentScene !== 'playing') return; this.game.pause(); this.overlay.hidden = false; this.input.focus(); }
  close(): void { this.overlay.hidden = true; if (this.game.currentScene === 'paused') this.game.resume(); }
  execute(raw: string): string {
    const [name, arg, arg2] = raw.trim().toLowerCase().split(/\s+/);
    if (name === '/landscape') {
      if (arg === undefined || arg2 === undefined || !Number.isFinite(Number(arg)) || !Number.isFinite(Number(arg2))) return 'Usage: /landscape x y [access] — coordinates in tiles.';
      const access = raw.trim().split(/\s+/)[3] === 'access';
      return formatLandscapeInspection(inspectLandscape(this.sim.world, Number(arg), Number(arg2), access));
    }
    const entities = this.sim.getEntities();
    const enemies = entities.filter((e): e is EnemyEntity => e.kind === 'enemy' && e.alive);
    if (name === '/help') return '/kill all|boss  /collect all  /scan boss  /locate boss  /spawn boss|ghost  /give health|speed|xp amount  /time 0..1  /health|mana|stamina amount  /tutorial welcome|reset  /landscape x y [access]  /clear  /exit';
    if (name === '/save' || name === '/load') { try { if (!this.saves) return 'Save manager unavailable.'; if (name === '/save') this.saves.save(arg); else this.saves.load(arg); return name === '/save' ? 'Game saved.' : 'Game loaded.'; } catch (error) { return error instanceof Error ? error.message : 'Save operation failed.'; } }
    if (name === '/clear') { this.output.textContent = ''; return ''; }
    if (name === '/exit') { this.close(); return ''; }
    if (name === '/kill' && (arg === 'all' || arg === 'boss')) { this.sim.clearEncounters(arg === 'boss'); const targets = enemies.filter(e => arg === 'all' || e.enemyType === 'beetle'); for (const e of targets) { e.health = 0; e.alive = false; e.aiState = 'dead'; } return `Defeated ${targets.length} enemies.`; }
    if (name === '/collect' && arg === 'all') { const coins = entities.filter((e): e is PickupEntity => e.kind === 'pickup' && e.pickupType === 'coin' && e.alive); for (const c of coins) c.alive = false; this.sim.player.stats.coins += coins.length; return `Collected ${coins.length} coins.`; }
    if ((name === '/scan' || name === '/locate') && arg === 'boss') { const nest = this.sim.getEncounterDebug().sites.find(s => s.kind === 'nest'); if (nest) return `Boss nest at ${nest.x.toFixed(1)}, ${nest.y.toFixed(1)}`; const boss = enemies.find(e => e.enemyType === 'beetle'); return boss ? `${boss.health}/${boss.maxHealth} HP at ${boss.x.toFixed(1)}, ${boss.y.toFixed(1)}` : 'No living boss.'; }
    if (name === '/spawn' && arg && ['boss','beetle','ghost','mantis','maggot'].includes(arg)) { const type = (arg === 'boss' ? 'beetle' : arg) as EnemyType; const p = this.sim.player; const dx = arg2 !== undefined && Number.isFinite(Number(arg2)) ? Number(arg2) : 2; const [, , , rawDy] = raw.trim().split(/\s+/); const dy = rawDy !== undefined && Number.isFinite(Number(rawDy)) ? Number(rawDy) : 0; try { const id = this.sim.spawnEnemy(type, Math.max(0.5, Math.min(this.sim.world.meta.width - 0.5, p.x + dx)), Math.max(0.5, Math.min(this.sim.world.meta.height - 0.5, p.y + dy))); return `Spawned ${type} (${id}).`; } catch (error) { return error instanceof Error ? error.message : 'Encounter unavailable.'; } }
    if (name === '/time' && arg && ['day','dusk','night','dawn'].includes(arg)) { const times: Record<string, number> = { day: 0.5, dusk: 0.85, night: 0, dawn: 0.21 }; this.sim.setTimeOfDay(times[arg] ?? 0.5); return `Time set to ${arg}.`; }
    if (name === '/time' && arg !== undefined && Number.isFinite(Number(arg))) { this.sim.setTimeOfDay(Number(arg)); return `Time set to ${this.sim.getTimeOfDay().toFixed(2)}.`; }
    if (name === '/tp' && arg !== undefined && arg2 !== undefined && Number.isFinite(Number(arg)) && Number.isFinite(Number(arg2))) { const x = Math.max(0.5, Math.min(this.sim.world.meta.width - 0.5, Number(arg))); const y = Math.max(0.5, Math.min(this.sim.world.meta.height - 0.5, Number(arg2))); this.sim.setPlayerPosition(x, y); return `Position: ${x}, ${y}.`; }
    if (name === '/damage_enemy' && arg && arg2 !== undefined && Number.isFinite(Number(arg2)) && Number(arg2) >= 0) {
      const enemy = enemies.find(e => e.id.toLowerCase() === arg); if (!enemy) return 'Enemy not found.';
      enemy.health = Math.max(0, enemy.health - Number(arg2)); if (enemy.health === 0) { enemy.alive = false; enemy.aiState = 'dead'; if (enemy.enemyType === 'beetle') this.sim.clearEncounters(true); }
      return `${enemy.id}: ${enemy.health}/${enemy.maxHealth} HP.`;
    }
    if (name === '/xp' && arg !== undefined && Number.isFinite(Number(arg)) && Number(arg) >= 0 && Number(arg) <= 10000) { awardXp(this.sim.player.stats, Number(arg)); return `Granted ${arg} XP.`; }
    if (name === '/health' && arg !== undefined && Number.isFinite(Number(arg))) { const s = this.sim.player.stats; s.health = Math.max(0, Math.min(s.maxHealth, Number(arg))); return `Health: ${s.health}.`; }
    if ((name === '/mana' || name === '/stamina') && arg !== undefined && Number.isFinite(Number(arg))) {
      const s = this.sim.player.stats;
      if (name === '/mana') s.mana = Math.max(0, Math.min(s.maxMana, Number(arg)));
      else { s.stamina = Math.max(0, Math.min(s.maxStamina, Number(arg))); if (s.stamina === 0) this.sim.player.sprintLockoutMs = 4000; }
      return `${name.slice(1)}: ${name === '/mana' ? s.mana : s.stamina}.`;
    }
    if (name === '/give' && arg === 'potion' && arg2 === undefined) { this.sim.player.inventory.healthPotions++; return 'Granted 1 health potion.'; }
    if (name === '/give' && arg && arg2 && Number.isInteger(Number(arg2)) && Number(arg2) > 0 && Number(arg2) <= 10000) { const n = Number(arg2); if (arg === 'health') this.sim.player.inventory.healthPotions += n; else if (arg === 'speed') this.sim.player.inventory.speedPotions += n; else if (arg === 'xp') awardXp(this.sim.player.stats, n); else return 'Unknown item.'; return `Granted ${n} ${arg}.`; }
    if (name === '/tutorial' && (arg === 'welcome' || arg === 'reset')) { this.onboarding.value.seen = false; this.onboarding.value.complete = false; this.onboarding.save(); if (arg === 'reset') { this.close(); this.game.startNewGame({ tutorial: true }); } return 'Tutorial progress reset.'; }
    return 'Unknown command or invalid arguments. Use /help.';
  }
}
