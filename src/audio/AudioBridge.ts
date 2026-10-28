import { ISoundSynthesizer, IMusicPlayer } from './types';

/**
 * Event bus interface required by the audio bridge.
 * Compatible with the central core EventBus implementation.
 */
export interface IEventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (payload?: any) => void): () => void;
}

/**
 * Connects the retro audio subsystem to the central game event bus.
 * Guarantees strict decoupling: simulation logic does not directly call audio APIs.
 *
 * @param eventBus Central simulation event dispatcher
 * @param synth Procedural retro SFX synthesizer
 * @param music Streaming HTML5 background music controller
 * @returns Teardown unsubscribe function
 */
export function registerAudioEvents(
  eventBus: IEventBus,
  synth: ISoundSynthesizer,
  music: IMusicPlayer
): () => void {
  const unsubscribers: Array<() => void> = [
    // Combat SFX
    eventBus.on('player:attackSwing', () => synth.playSwordSwing()),
    eventBus.on('entity:damaged', () => synth.playEnemyHit()),
    eventBus.on('player:damaged', () => synth.playPlayerHurt()),
    eventBus.on('entity:crushed', () => synth.playEnemySplat()),
    eventBus.on('player:castSpell', () => synth.playSpellCast()),

    // Progression & Items
    eventBus.on('player:coinCollected', () => synth.playCoinPickup()),
    eventBus.on('player:potionUsed', () => synth.playPotionDrink()),
    eventBus.on('player:levelUp', () => {
      synth.playLevelUp();
      music.duck(0.3, 0.8); // Duck music during victory fanfare
    }),

    // World & UI
    eventBus.on('portal:hum', () => synth.playPortalHum()),
    eventBus.on('ui:buttonClicked', () => synth.playButtonClick()),

    // Music Switching
    eventBus.on('game:started', () => {
      void music.crossfadeTo('game', 1.5);
    }),
    eventBus.on('ui:menuToggled', (payload?: { menuId?: string; open?: boolean }) => {
      if (payload?.menuId === 'mainMenu') {
        if (payload.open) {
          void music.crossfadeTo('menu', 1.5);
        } else {
          void music.crossfadeTo('game', 1.5);
        }
      }
    }),
    eventBus.on('game:over', (payload?: { victory?: boolean }) => {
      if (payload?.victory) {
        synth.playLevelUp();
      }
      void music.crossfadeTo('menu', 2.0);
    }),
  ];

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}
