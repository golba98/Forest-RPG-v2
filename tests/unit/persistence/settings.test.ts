// @vitest-environment happy-dom
import { it, expect, beforeEach } from 'vitest';
import { SettingsStore } from '../../../src/persistence/SettingsStore';
beforeEach(() => localStorage.clear());
it('migrates and clamps legacy values once', () => {
  localStorage.setItem('game.settings', JSON.stringify({ masterVolume: 3, hud: false }));
  const store = new SettingsStore(localStorage);
  expect(store.value.masterVolume).toBe(1); expect(store.value.hud).toBe(false);
  store.value.masterVolume = 0.25; store.save();
  expect(new SettingsStore(localStorage).value.masterVolume).toBe(0.25);
});
it('uses defaults for malformed data', () => {
  localStorage.setItem('forestrpg.v2.settings', '{');
  expect(new SettingsStore(localStorage).value.maxFps).toBe(60);
});

it('migrates the original volume, control and accessibility names', () => {
  localStorage.setItem('game.settings', JSON.stringify({ masterVol: 0.4, musicVol: 0.2, sfxVol: 0.9, showHUD: false, invertYAxis: true, showTutorials: false, sensitivitySetting: 7, uiScale: 90, languageSetting: 'German', colorModeSetting: 'Sepia', targetFps: 144 }));
  expect(new SettingsStore(localStorage).value).toMatchObject({ masterVolume: 0.4, musicVolume: 0.2, sfxVolume: 0.9, hud: false, invertY: true, tutorials: false, sensitivity: 7, uiScale: 1.2, language: 'German', colorMode: 'Sepia', maxFps: 144 });
});
