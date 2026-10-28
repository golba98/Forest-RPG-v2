/**
 * Audio subsystem configuration settings.
 */
export interface AudioConfig {
  masterVolume: number; // 0.0 to 1.0 (default: 0.8)
  sfxVolume: number;    // 0.0 to 1.0 (default: 0.9)
  musicVolume: number;  // 0.0 to 1.0 (default: 0.6)
  muted: boolean;       // default: false
}

/**
 * Sound effect identifiers supported by the synthesizer.
 */
export type SoundEffectType =
  | 'swordSwing'
  | 'enemyHit'
  | 'playerHurt'
  | 'enemySplat'
  | 'coinPickup'
  | 'potionDrink'
  | 'levelUp'
  | 'portalHum'
  | 'buttonClick'
  | 'spellCast'
  | 'nestWarning'
  | 'ghostForm';

/**
 * Interface contract for the retro sound synthesizer.
 */
export interface ISoundSynthesizer {
  readonly isSupported: boolean;
  readonly isMuted: boolean;

  // Lifecycle & Settings
  init(): Promise<void>;
  resume(): Promise<void>;
  setMasterVolume(volume: number): void;
  setSfxVolume(volume: number): void;
  setMuted(muted: boolean): void;
  toggleMute(): boolean;

  // Retro SFX Generators
  playNestWarning(): void;
  playGhostForm(): void;
  playSwordSwing(): void;
  playEnemyHit(): void;
  playPlayerHurt(): void;
  playEnemySplat(): void;
  playCoinPickup(): void;
  playPotionDrink(): void;
  playLevelUp(): void;
  playPortalHum(durationMs?: number): void;
  playButtonClick(): void;
  playSpellCast(): void;
}

/**
 * Music track keys available for playback.
 */
export type MusicTrackKey = 'menu' | 'game' | 'silence';

/**
 * Interface contract for background music streaming & crossfading.
 */
export interface IMusicPlayer {
  readonly currentTrack: MusicTrackKey;
  readonly isPlaying: boolean;

  init(): Promise<void>;
  play(track: MusicTrackKey): Promise<void>;
  crossfadeTo(track: MusicTrackKey, durationSec?: number): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): void;
  setMusicVolume(volume: number): void;
  duck(multiplier: number, durationSec: number): void;
}
