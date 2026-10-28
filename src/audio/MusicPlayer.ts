import { IMusicPlayer, MusicTrackKey } from './types';

/**
 * Dual-channel streaming HTML5 background music controller for Forest RPG V2.
 * Streams menu and game music loops directly to prevent uncompressed PCM RAM bloat (~30MB saved).
 * Supports asynchronous crossfading and volume ducking during combat fanfares.
 */
export class MusicPlayer implements IMusicPlayer {
  private channelA: HTMLAudioElement | null = null;
  private channelB: HTMLAudioElement | null = null;
  private activeChannel: 'A' | 'B' = 'A';

  private currentTrackKey: MusicTrackKey = 'silence';
  private targetVolume: number = 0.6;
  private isMuted: boolean = false;
  private crossfadeAnimationId: number | null = null;
  private duckTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private trackUrls: Record<MusicTrackKey, string> = MusicPlayer.buildTrackUrls('ogg');

  /** Music ships as OGG Vorbis with an MP3 fallback (see scripts/transcode-media.sh). */
  private static buildTrackUrls(ext: 'ogg' | 'mp3'): Record<MusicTrackKey, string> {
    return {
      menu: `/assets/audio/music/menu_music.${ext}`,
      game: `/assets/audio/music/game_music.${ext}`,
      silence: '',
    };
  }

  public get currentTrack(): MusicTrackKey {
    return this.currentTrackKey;
  }

  public get isPlaying(): boolean {
    const active = this.getActiveAudio();
    return active ? !active.paused : false;
  }

  public async init(): Promise<void> {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;

    this.channelA = new Audio();
    this.channelB = new Audio();
    this.channelA.loop = true;
    this.channelB.loop = true;
    this.channelA.preload = 'metadata';
    this.channelB.preload = 'metadata';

    const supportsVorbis = this.channelA.canPlayType('audio/ogg; codecs="vorbis"') !== '';
    this.trackUrls = MusicPlayer.buildTrackUrls(supportsVorbis ? 'ogg' : 'mp3');
  }

  public async play(track: MusicTrackKey): Promise<void> {
    if (track === this.currentTrackKey && this.isPlaying) return;
    await this.crossfadeTo(track, 0.1);
  }

  public async crossfadeTo(track: MusicTrackKey, durationSec: number = 1.5): Promise<void> {
    if (typeof window === 'undefined' || !this.channelA || !this.channelB) {
      this.currentTrackKey = track;
      return;
    }

    if (this.crossfadeAnimationId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.crossfadeAnimationId);
      this.crossfadeAnimationId = null;
    }

    if (this.duckTimeoutId !== null) {
      clearTimeout(this.duckTimeoutId);
      this.duckTimeoutId = null;
    }

    const nextChannelKey = this.activeChannel === 'A' ? 'B' : 'A';
    const outgoing = this.activeChannel === 'A' ? this.channelA : this.channelB;
    const incoming = nextChannelKey === 'A' ? this.channelA : this.channelB;

    this.currentTrackKey = track;
    this.activeChannel = nextChannelKey;

    const isInstant = typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0;

    if (track === 'silence') {
      if (isInstant || typeof requestAnimationFrame === 'undefined') {
        outgoing.pause();
        outgoing.currentTime = 0;
        outgoing.volume = 0;
        return;
      }
      this.fadeOut(outgoing, durationSec);
      return;
    }

    const finalInVol = this.isMuted ? 0 : this.targetVolume;
    incoming.src = this.trackUrls[track];
    incoming.volume = isInstant ? finalInVol : 0;

    try {
      await incoming.play();
    } catch {
      // Autoplay restriction: playback will resume on user gesture
    }

    if (isInstant || typeof requestAnimationFrame === 'undefined') {
      outgoing.pause();
      outgoing.currentTime = 0;
      outgoing.volume = 0;
      incoming.volume = finalInVol;
      return;
    }

    const startTime = performance.now();
    const durationMs = durationSec * 1000;
    const initialOutVol = outgoing.volume;

    const step = (timestamp?: number) => {
      const now = typeof timestamp === 'number' ? timestamp : performance.now();
      const elapsed = now - startTime;
      const progress = durationMs > 0 ? Math.min(Math.max(0, elapsed / durationMs), 1.0) : 1.0;

      const outVol = initialOutVol * (1.0 - progress);
      outgoing.volume = Number.isFinite(outVol) ? Math.max(0, Math.min(1, outVol)) : 0;

      const inVol = finalInVol * progress;
      incoming.volume = Number.isFinite(inVol) ? Math.max(0, Math.min(finalInVol, inVol)) : finalInVol;

      if (progress < 1.0 && typeof requestAnimationFrame !== 'undefined') {
        this.crossfadeAnimationId = requestAnimationFrame(step);
      } else {
        outgoing.pause();
        outgoing.currentTime = 0;
        this.crossfadeAnimationId = null;
      }
    };

    this.crossfadeAnimationId = requestAnimationFrame(step);
  }

  public pause(): void {
    const active = this.getActiveAudio();
    if (active) active.pause();
  }

  public async resume(): Promise<void> {
    const active = this.getActiveAudio();
    if (active && this.currentTrackKey !== 'silence') {
      try {
        await active.play();
      } catch (err) {
        console.warn('[MusicPlayer] Failed to resume music:', err);
      }
    }
  }

  public stop(): void {
    if (this.duckTimeoutId !== null) {
      clearTimeout(this.duckTimeoutId);
      this.duckTimeoutId = null;
    }
    if (this.crossfadeAnimationId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.crossfadeAnimationId);
      this.crossfadeAnimationId = null;
    }
    if (this.channelA) {
      this.channelA.pause();
      this.channelA.currentTime = 0;
    }
    if (this.channelB) {
      this.channelB.pause();
      this.channelB.currentTime = 0;
    }
    this.currentTrackKey = 'silence';
  }

  public setMusicVolume(volume: number): void {
    if (typeof volume !== 'number' || !Number.isFinite(volume)) {
      this.targetVolume = volume > 0 ? 1 : 0;
    } else {
      this.targetVolume = Math.max(0, Math.min(1, volume));
    }
    const active = this.getActiveAudio();
    if (active && !this.isMuted) {
      active.volume = this.targetVolume;
    }
  }

  public setVolume(volume: number): void {
    this.setMusicVolume(volume);
  }

  public duck(multiplier: number, durationSec: number): void {
    const active = this.getActiveAudio();
    if (!active || this.isMuted) return;

    if (this.duckTimeoutId !== null) {
      clearTimeout(this.duckTimeoutId);
      this.duckTimeoutId = null;
    }

    const normalVol = this.targetVolume;
    let duckedVol: number;
    if (typeof multiplier !== 'number' || Number.isNaN(multiplier)) {
      duckedVol = normalVol;
    } else if (multiplier === Infinity) {
      duckedVol = 1.0;
    } else if (multiplier === -Infinity) {
      duckedVol = 0.0;
    } else {
      duckedVol = Math.max(0, Math.min(1, normalVol * multiplier));
    }
    active.volume = duckedVol;

    const validDurationMs = typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0
      ? durationSec * 1000
      : 0;

    this.duckTimeoutId = setTimeout(() => {
      if (!this.isMuted && active) {
        active.volume = this.targetVolume;
      }
      this.duckTimeoutId = null;
    }, validDurationMs);
  }

  private getActiveAudio(): HTMLAudioElement | null {
    return this.activeChannel === 'A' ? this.channelA : this.channelB;
  }

  private fadeOut(element: HTMLAudioElement, durationSec: number): void {
    if (
      typeof durationSec !== 'number' ||
      !Number.isFinite(durationSec) ||
      durationSec <= 0 ||
      typeof requestAnimationFrame === 'undefined'
    ) {
      element.pause();
      element.currentTime = 0;
      element.volume = 0;
      return;
    }

    const startTime = performance.now();
    const durationMs = durationSec * 1000;
    const initialVol = element.volume;

    const step = (timestamp?: number) => {
      const now = typeof timestamp === 'number' ? timestamp : performance.now();
      const elapsed = now - startTime;
      const progress = durationMs > 0 ? Math.min(Math.max(0, elapsed / durationMs), 1.0) : 1.0;
      const outVol = initialVol * (1.0 - progress);
      element.volume = Number.isFinite(outVol) ? Math.max(0, Math.min(1, outVol)) : 0;

      if (progress < 1.0 && typeof requestAnimationFrame !== 'undefined') {
        this.crossfadeAnimationId = requestAnimationFrame(step);
      } else {
        element.pause();
        element.currentTime = 0;
        this.crossfadeAnimationId = null;
      }
    };
    this.crossfadeAnimationId = requestAnimationFrame(step);
  }
}
