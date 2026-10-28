import { AudioConfig, ISoundSynthesizer, SoundEffectType } from './types';

/**
 * Procedural retro sound synthesizer for Forest RPG V2.
 * Generates authentic 8-bit / 16-bit arcade sound effects in real time using the native Web Audio API.
 * Operates with 0 bytes of static audio download and provides a mock/no-op fallback in headless Node.js environments.
 */
export class SoundSynthesizer implements ISoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private sharedNoiseBuffer: AudioBuffer | null = null;

  private _isSupported: boolean = false;
  private _isMuted: boolean = false;
  private masterVolume: number = 0.8;
  private sfxVolume: number = 0.9;

  /**
   * Diagnostic telemetry counters for test assertion in headless / test environments.
   */
  public readonly callCounts: Record<SoundEffectType, number> = {
    swordSwing: 0,
    enemyHit: 0,
    playerHurt: 0,
    enemySplat: 0,
    coinPickup: 0,
    potionDrink: 0,
    levelUp: 0,
    portalHum: 0,
    buttonClick: 0,
    spellCast: 0,
  };

  constructor(config?: Partial<AudioConfig>) {
    if (config) {
      if (config.masterVolume !== undefined) this.masterVolume = this.clampVolume(config.masterVolume);
      if (config.sfxVolume !== undefined) this.sfxVolume = this.clampVolume(config.sfxVolume);
      if (config.muted !== undefined) this._isMuted = config.muted;
    }

    if (typeof window !== 'undefined') {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this._isSupported = typeof AudioCtxClass !== 'undefined';
    } else {
      this._isSupported = false;
    }
  }

  public get isSupported(): boolean {
    return this._isSupported;
  }

  public get isMuted(): boolean {
    return this._isMuted;
  }

  public async init(): Promise<void> {
    if (!this._isSupported || typeof window === 'undefined') return;

    if (!this.ctx) {
      try {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtxClass) {
          this._isSupported = false;
          return;
        }

        this.ctx = new AudioCtxClass();
        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        const initialMaster = this._isMuted ? 0 : this.masterVolume;
        this.masterGain.gain.setValueAtTime(initialMaster, this.ctx.currentTime);
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);

        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.setupInteractionUnlock();
      } catch (err) {
        console.warn('[SoundSynthesizer] AudioContext initialization failed; disabling audio:', err);
        this._isSupported = false;
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        return;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Handled via user interaction unlock listeners
      }
    }
  }

  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('[SoundSynthesizer] Failed to resume AudioContext:', err);
      }
    }
  }

  private clampVolume(volume: number): number {
    if (typeof volume !== 'number' || Number.isNaN(volume)) {
      return 0;
    }
    if (!Number.isFinite(volume)) {
      return volume > 0 ? 1 : 0;
    }
    return Math.max(0, Math.min(1, volume));
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = this.clampVolume(volume);
    if (this.ctx && this.masterGain && !this._isMuted) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, t + 0.05);
    }
  }

  public setSfxVolume(volume: number): void {
    this.sfxVolume = this.clampVolume(volume);
    if (this.ctx && this.sfxGain) {
      const t = this.ctx.currentTime;
      this.sfxGain.gain.cancelScheduledValues(t);
      this.sfxGain.gain.linearRampToValueAtTime(this.sfxVolume, t + 0.05);
    }
  }

  public setMuted(muted: boolean): void {
    this._isMuted = muted;
    if (this.ctx && this.masterGain) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      const target = this._isMuted ? 0 : this.masterVolume;
      this.masterGain.gain.linearRampToValueAtTime(target, t + 0.05);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this._isMuted);
    return this._isMuted;
  }

  private getReadyContext(): { ctx: AudioContext; sfxGain: GainNode } | null {
    if (!this._isSupported || !this.ctx || !this.sfxGain || this._isMuted) {
      return null;
    }
    return { ctx: this.ctx, sfxGain: this.sfxGain };
  }

  private setupInteractionUnlock(): void {
    if (typeof window === 'undefined') return;

    const unlock = async () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (err) {
          console.warn('[SoundSynthesizer] Autoplay unlock failed:', err);
        }
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  private getSharedNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.sharedNoiseBuffer) {
      const bufferSize = ctx.sampleRate; // 1.0 second of white noise
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      this.sharedNoiseBuffer = buffer;
    }
    return this.sharedNoiseBuffer;
  }

  // ---------------------------------------------------------------------------
  // Retro SFX Generators
  // ---------------------------------------------------------------------------

  /**
   * SFX 1: Sword Swing — Bandpass noise sweep 2200Hz -> 400Hz over 80ms.
   */
  public playSwordSwing(): void {
    this.callCounts.swordSwing++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getSharedNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(3.0, t);
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.7, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    gain.gain.setValueAtTime(0, t + 0.081);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);

    noise.start(t);
    noise.stop(t + 0.081);
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /**
   * SFX 2: Enemy Hit — Punchy pitch drop (triangle 320Hz -> 55Hz) with transient click.
   */
  public playEnemyHit(): void {
    this.callCounts.enemyHit++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;

    // Punch Oscillator
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.10);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.85, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    oscGain.gain.setValueAtTime(0, t + 0.101);

    osc.connect(oscGain);
    oscGain.connect(sfxGain);

    // Transient Crunch Layer
    const click = ctx.createBufferSource();
    click.buffer = this.getSharedNoiseBuffer(ctx);

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.setValueAtTime(1000, t);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.4, t);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    clickGain.gain.setValueAtTime(0, t + 0.021);

    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.101);
    click.start(t);
    click.stop(t + 0.021);

    osc.onended = () => {
      osc.disconnect();
      oscGain.disconnect();
      click.disconnect();
      clickFilter.disconnect();
      clickGain.disconnect();
    };
  }

  /**
   * SFX 3: Player Hurt — Low rumble descending sawtooth wave 160Hz -> 42Hz.
   */
  public playPlayerHurt(): void {
    this.callCounts.playerHurt++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.15);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, t);
    filter.Q.setValueAtTime(2.0, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.004);
    gain.gain.setValueAtTime(0.6, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    gain.gain.setValueAtTime(0, t + 0.151);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.151);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /**
   * SFX 4: Enemy Splat — Visceral crush execution (square sub dive 140Hz -> 28Hz + resonant noise sweep).
   */
  public playEnemySplat(): void {
    this.callCounts.enemySplat++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;

    // Sub bass dive
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.22);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    oscGain.gain.setValueAtTime(0, t + 0.221);

    // Resonant squish noise
    const noise = ctx.createBufferSource();
    noise.buffer = this.getSharedNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(5.5, t);
    filter.frequency.setValueAtTime(1100, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 0.20);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.linearRampToValueAtTime(0.8, t + 0.006);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    noiseGain.gain.setValueAtTime(0, t + 0.221);

    osc.connect(oscGain);
    oscGain.connect(sfxGain);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.221);
    noise.start(t);
    noise.stop(t + 0.221);

    osc.onended = () => {
      osc.disconnect();
      oscGain.disconnect();
      noise.disconnect();
      filter.disconnect();
      noiseGain.disconnect();
    };
  }

  /**
   * SFX 5: Coin Pickup — Bright two-tone chime (B5 987.77Hz -> E6 1318.51Hz).
   */
  public playCoinPickup(): void {
    this.callCounts.coinPickup++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.setValueAtTime(1318.51, t + 0.06); // E6

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.005);
    gain.gain.setValueAtTime(0.3, t + 0.055);
    gain.gain.linearRampToValueAtTime(0.65, t + 0.065);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    gain.gain.setValueAtTime(0, t + 0.141);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.141);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /**
   * SFX 6: Potion Drink — Ascending 4-bubble glissando chirps.
   */
  public playPotionDrink(): void {
    this.callCounts.potionDrink++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;

    const bubbles = [
      { start: 0.00, end: 0.05, f0: 300, f1: 480, peak: 0.35 },
      { start: 0.05, end: 0.10, f0: 450, f1: 720, peak: 0.40 },
      { start: 0.10, end: 0.16, f0: 650, f1: 1050, peak: 0.45 },
      { start: 0.16, end: 0.24, f0: 900, f1: 1450, peak: 0.50 },
    ];

    for (const b of bubbles) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(b.f0, t + b.start);
      osc.frequency.exponentialRampToValueAtTime(b.f1, t + b.end);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + b.start);
      gain.gain.linearRampToValueAtTime(b.peak, t + b.start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + b.end);
      gain.gain.setValueAtTime(0, t + b.end + 0.001);

      osc.connect(gain);
      gain.connect(sfxGain);

      osc.start(t + b.start);
      osc.stop(t + b.end + 0.001);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  }

  /**
   * SFX 7: Level Up — Triumphant 4-note ascending fanfare with vibrato LFO.
   */
  public playLevelUp(): void {
    this.callCounts.levelUp++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;

    const notes = [
      { start: 0.00, end: 0.09, freq: 523.25, gain: 0.5 }, // C5
      { start: 0.09, end: 0.18, freq: 659.25, gain: 0.55 }, // E5
      { start: 0.18, end: 0.27, freq: 783.99, gain: 0.6 }, // G5
      { start: 0.27, end: 0.60, freq: 1046.50, gain: 0.7 }, // C6
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.freq, t + n.start);

      // Add subtle vibrato on sustained final note (C6)
      if (n.freq > 1000) {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(6.0, t + n.start);
        lfoGain.gain.setValueAtTime(5.0, t + n.start);
        lfo.connect(osc.frequency);
        lfo.start(t + n.start + 0.10);
        lfo.stop(t + n.end);
        lfo.onended = () => {
          lfo.disconnect();
          lfoGain.disconnect();
        };
      }

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + n.start);
      gain.gain.linearRampToValueAtTime(n.gain, t + n.start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.end);
      gain.gain.setValueAtTime(0, t + n.end + 0.001);

      osc.connect(gain);
      gain.connect(sfxGain);

      osc.start(t + n.start);
      osc.stop(t + n.end + 0.001);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  }

  /**
   * SFX 8: Portal Hum — Gentle otherworldly drone with 2.5Hz natural acoustic beating.
   */
  public playPortalHum(durationMs: number = 1200): void {
    this.callCounts.portalHum++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;
    const safeDurationMs = typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0
      ? durationMs
      : 1200;
    const durationSec = safeDurationMs / 1000;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(110.0, t);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(112.5, t); // 2.5 Hz natural acoustic beating

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.5, t);
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.linearRampToValueAtTime(600, t + durationSec * 0.5);
    filter.frequency.linearRampToValueAtTime(300, t + durationSec);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);
    gain.gain.setValueAtTime(0, t + durationSec + 0.01);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + durationSec + 0.01);
    osc2.stop(t + durationSec + 0.01);

    osc1.onended = () => {
      osc1.disconnect();
      osc2.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /**
   * SFX 9: Button Click — Zero-dependency UI click SFX.
   */
  public playButtonClick(): void {
    this.callCounts.buttonClick++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(350, t + 0.025);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    gain.gain.setValueAtTime(0, t + 0.026);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.026);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /**
   * SFX 10: Spell Cast — Arcane projectile cast SFX (sine drop 1400Hz -> 550Hz).
   */
  public playSpellCast(): void {
    this.callCounts.spellCast++;
    const ready = this.getReadyContext();
    if (!ready) return;
    const { ctx, sfxGain } = ready;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(550, t + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    gain.gain.setValueAtTime(0, t + 0.121);

    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.121);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}
