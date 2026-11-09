import { describe, expect, it } from 'vitest';
import { assertPlayerAssets } from '../../../src/rendering/PlayerAssets';
import { ANIMATION_DEFS } from '../../../src/animation/AnimationDefs';

function assets() {
  const sheets = new Map<string, { width: number; height: number }>();
  const player = ANIMATION_DEFS.player!;
  for (const clip of [...Object.values(player.clips), ...Object.values(player.attackClips ?? {})]) {
    if (clip?.source.kind === 'perDirectionSheets')
      for (const sheet of Object.values(clip.source.sheets))
        sheets.set(sheet.alias, { width: sheet.sheetWidth, height: sheet.sheetHeight });
  }
  return sheets;
}

describe('required player artwork', () => {
  it('loads all seven approved actions in all eight directions', () => {
    const sheets = assets();
    expect(sheets.size).toBe(56);
    expect(() => assertPlayerAssets((alias) => sheets.get(alias))).not.toThrow();
  });
  it('rejects each missing sheet rather than selecting a placeholder', () => {
    const sheets = assets();
    for (const missing of sheets.keys())
      expect(() =>
        assertPlayerAssets((alias) => (alias === missing ? undefined : sheets.get(alias))),
      ).toThrow(`Required player artwork unavailable: ${missing}`);
  });
  it('rejects the historical six-frame idle sheet against the approved twelve-frame animation', () => {
    const sheets = assets();
    sheets.set('player_idle_north', { width: 384, height: 64 });
    expect(() => assertPlayerAssets((alias) => sheets.get(alias))).toThrow(
      'incompatible layout: player_idle_north',
    );
  });
});
