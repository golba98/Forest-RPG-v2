import { ANIMATION_DEFS, type DirectionalSheet } from '../animation/AnimationDefs';

export function requiredPlayerSheets(): readonly DirectionalSheet[] {
  const player = ANIMATION_DEFS.player;
  if (!player) throw new Error('Required player animation definition is unavailable');
  const clips = [
    player.clips.idle,
    player.clips.walk,
    player.clips.run,
    player.clips.jump,
    player.clips.attack,
    player.attackClips?.[2],
    player.attackClips?.[3],
  ];
  return clips.flatMap((clip) => {
    if (!clip || clip.source.kind !== 'perDirectionSheets')
      throw new Error('Required player directional animation is unavailable');
    return Object.values(clip.source.sheets);
  });
}

/** Required player art must never pass through the optional-art placeholder path. */
export function assertPlayerAssets(
  lookup: (alias: string) => { width: number; height: number } | undefined,
): void {
  for (const sheet of requiredPlayerSheets()) {
    const texture = lookup(sheet.alias);
    if (!texture)
      throw new Error(`Required player artwork unavailable: ${sheet.alias}. Reload to retry.`);
    if (texture.width !== sheet.sheetWidth || texture.height !== sheet.sheetHeight)
      throw new Error(`Required player artwork has an incompatible layout: ${sheet.alias}`);
  }
}
