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
