export interface Settings {
  version: 2;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  maxFps: number;
  lighting: boolean;
  particles: boolean;
  hud: boolean;
}
const KEY = 'forestrpg.v2.settings';
export const DEFAULT_SETTINGS: Settings = { version: 2, masterVolume: 0.7, musicVolume: 0.5, sfxVolume: 0.7, maxFps: 60, lighting: true, particles: true, hud: true };
export class SettingsStore {
  value: Settings = { ...DEFAULT_SETTINGS };
  constructor(private storage: Storage) {
    try {
      const raw: unknown = JSON.parse(storage.getItem(KEY) ?? storage.getItem('game.settings') ?? '{}');
      if (raw && typeof raw === 'object') {
        for (const key of ['masterVolume', 'musicVolume', 'sfxVolume'] as const) {
          const v: unknown = Reflect.get(raw, key);
          if (typeof v === 'number' && Number.isFinite(v)) this.value[key] = Math.max(0, Math.min(1, v));
        }
        const fps: unknown = Reflect.get(raw, 'maxFps');
        if (typeof fps === 'number' && [0, 60, 120, 144, 240].includes(fps)) this.value.maxFps = fps;
        for (const key of ['lighting', 'particles', 'hud'] as const) {
          const v: unknown = Reflect.get(raw, key); if (typeof v === 'boolean') this.value[key] = v;
        }
      }
      this.save();
    } catch { /* Keep safe defaults when storage is unavailable or malformed. */ }
  }
  save(): boolean { try { this.storage.setItem(KEY, JSON.stringify(this.value)); return true; } catch { return false; } }
}
