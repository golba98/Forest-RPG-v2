import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SoundSynthesizer,
  MusicPlayer,
  registerAudioEvents,
  IEventBus,
  SoundEffectType,
} from '@/audio';

describe('SoundSynthesizer Headless Tests', () => {
  let synth: SoundSynthesizer;

  beforeEach(() => {
    synth = new SoundSynthesizer();
  });

  it('initializes safely in a headless environment without throwing', async () => {
    expect(synth.isSupported).toBe(false);
    expect(synth.isMuted).toBe(false);
    await expect(synth.init()).resolves.toBeUndefined();
    await expect(synth.resume()).resolves.toBeUndefined();
  });

  it('clamps master volume safely to [0.0, 1.0] for negative, extreme, and non-finite values', () => {
    const cases = [
      { input: -10, expected: 0.0 },
      { input: -0.5, expected: 0.0 },
      { input: 0.0, expected: 0.0 },
      { input: 0.75, expected: 0.75 },
      { input: 1.0, expected: 1.0 },
      { input: 1.5, expected: 1.0 },
      { input: 9999, expected: 1.0 },
      { input: Infinity, expected: 1.0 },
      { input: -Infinity, expected: 0.0 },
      { input: NaN, expected: 0.0 },
    ];

    for (const c of cases) {
      synth.setMasterVolume(c.input);
      expect((synth as unknown as { masterVolume: number }).masterVolume).toBe(c.expected);
      expect(synth.isMuted).toBe(false);
    }
  });

  it('clamps sfx volume safely to [0.0, 1.0] for negative, extreme, and non-finite values', () => {
    const cases = [
      { input: -10, expected: 0.0 },
      { input: -1.0, expected: 0.0 },
      { input: 0.0, expected: 0.0 },
      { input: 0.5, expected: 0.5 },
      { input: 1.0, expected: 1.0 },
      { input: 2.0, expected: 1.0 },
      { input: 9999, expected: 1.0 },
      { input: Infinity, expected: 1.0 },
      { input: -Infinity, expected: 0.0 },
      { input: NaN, expected: 0.0 },
    ];

    for (const c of cases) {
      synth.setSfxVolume(c.input);
      expect((synth as unknown as { sfxVolume: number }).sfxVolume).toBe(c.expected);
      expect(synth.isMuted).toBe(false);
    }
  });

  it('manages mute and toggleMute state', () => {
    expect(synth.isMuted).toBe(false);
    const muted = synth.toggleMute();
    expect(muted).toBe(true);
    expect(synth.isMuted).toBe(true);
    synth.setMuted(false);
    expect(synth.isMuted).toBe(false);
  });

  it('executes retro combat and encounter sounds safely in headless mode', () => {
    const soundMethods: Array<{ name: SoundEffectType; fn: () => void }> = [
      { name: 'nestWarning', fn: () => synth.playNestWarning() },
      { name: 'ghostForm', fn: () => synth.playGhostForm() },
      { name: 'swordSwing', fn: () => synth.playSwordSwing() },
      { name: 'enemyHit', fn: () => synth.playEnemyHit() },
      { name: 'playerHurt', fn: () => synth.playPlayerHurt() },
      { name: 'enemySplat', fn: () => synth.playEnemySplat() },
      { name: 'coinPickup', fn: () => synth.playCoinPickup() },
      { name: 'potionDrink', fn: () => synth.playPotionDrink() },
      { name: 'levelUp', fn: () => synth.playLevelUp() },
      { name: 'portalHum', fn: () => synth.playPortalHum(500) },
      { name: 'buttonClick', fn: () => synth.playButtonClick() },
      { name: 'spellCast', fn: () => synth.playSpellCast() },
    ];

    for (const item of soundMethods) {
      expect(() => item.fn()).not.toThrow();
      expect(synth.callCounts[item.name]).toBe(1);
    }
  });

  it('respects and clamps initial config passed via constructor', () => {
    const customSynth = new SoundSynthesizer({
      masterVolume: 0.5,
      sfxVolume: 0.6,
      muted: true,
    });
    expect(customSynth.isMuted).toBe(true);
    expect((customSynth as unknown as { masterVolume: number }).masterVolume).toBe(0.5);
    expect((customSynth as unknown as { sfxVolume: number }).sfxVolume).toBe(0.6);

    const edgeSynth = new SoundSynthesizer({
      masterVolume: NaN,
      sfxVolume: Infinity,
    });
    expect((edgeSynth as unknown as { masterVolume: number }).masterVolume).toBe(0.0);
    expect((edgeSynth as unknown as { sfxVolume: number }).sfxVolume).toBe(1.0);
  });
});

describe('SoundSynthesizer Web Audio Node Graph Simulation', () => {
  let createdNodes: unknown[];
  let exponentialRampZeroCount: number;

  class MockAudioParam {
    value: number = 1;

    private assertFinite(val: number, method: string): void {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new TypeError(
          `Failed to execute '${method}' on 'AudioParam': The provided float value is non-finite.`
        );
      }
    }

    setValueAtTime(val: number, _time: number) {
      this.assertFinite(val, 'setValueAtTime');
      this.value = val;
    }
    linearRampToValueAtTime(val: number, _time: number) {
      this.assertFinite(val, 'linearRampToValueAtTime');
      this.value = val;
    }
    exponentialRampToValueAtTime(val: number, _time: number) {
      this.assertFinite(val, 'exponentialRampToValueAtTime');
      if (val <= 0) {
        exponentialRampZeroCount++;
      }
      this.value = val;
    }
    cancelScheduledValues(_time: number) {}
  }

  class MockAudioNode {
    connect(_dest: unknown) {}
    disconnect() {}
  }

  class MockGainNode extends MockAudioNode {
    gain = new MockAudioParam();
  }

  class MockOscillatorNode extends MockAudioNode {
    type: OscillatorType = 'sine';
    frequency = new MockAudioParam();
    onended: (() => void) | null = null;
    start(_time?: number) {}
    stop(_time?: number) {
      queueMicrotask(() => {
        if (this.onended) this.onended();
      });
    }
  }

  class MockBiquadFilterNode extends MockAudioNode {
    type: BiquadFilterType = 'lowpass';
    frequency = new MockAudioParam();
    Q = new MockAudioParam();
  }

  class MockBufferSourceNode extends MockAudioNode {
    buffer: unknown = null;
    onended: (() => void) | null = null;
    start(_time?: number) {}
    stop(_time?: number) {
      queueMicrotask(() => {
        if (this.onended) this.onended();
      });
    }
  }

  class MockAudioContext {
    currentTime = 0;
    sampleRate = 44100;
    state: AudioContextState = 'suspended';
    destination = new MockAudioNode();

    createGain() {
      const g = new MockGainNode();
      createdNodes.push(g);
      return g;
    }
    createOscillator() {
      const osc = new MockOscillatorNode();
      createdNodes.push(osc);
      return osc;
    }
    createBiquadFilter() {
      const f = new MockBiquadFilterNode();
      createdNodes.push(f);
      return f;
    }
    createBufferSource() {
      const bs = new MockBufferSourceNode();
      createdNodes.push(bs);
      return bs;
    }
    createBuffer(channels: number, length: number, _rate: number) {
      return {
        numberOfChannels: channels,
        length,
        getChannelData: (_ch: number) => new Float32Array(length),
      };
    }
    async resume() {
      this.state = 'running';
    }
  }

  beforeEach(() => {
    createdNodes = [];
    exponentialRampZeroCount = 0;
    const mockWindow = {
      AudioContext: MockAudioContext as unknown as typeof AudioContext,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', mockWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes real Web Audio graph, connects nodes, and runs interaction unlock', async () => {
    const synth = new SoundSynthesizer({ masterVolume: 0.8, sfxVolume: 0.9 });
    expect(synth.isSupported).toBe(true);

    await synth.init();
    expect(createdNodes.length).toBeGreaterThanOrEqual(2); // masterGain, sfxGain

    // Test volume changes while initialized
    synth.setMasterVolume(0.5);
    synth.setSfxVolume(0.7);
    synth.setMuted(true);
    expect(synth.isMuted).toBe(true);
    synth.setMuted(false);
    expect(synth.isMuted).toBe(false);

    await synth.resume();
  });

  it('clamps live Web Audio master and sfx gain params without non-finite TypeErrors', async () => {
    const synth = new SoundSynthesizer();
    await synth.init();

    const extremeInputs = [-10, 9999, Infinity, -Infinity, NaN];
    for (const input of extremeInputs) {
      expect(() => synth.setMasterVolume(input)).not.toThrow();
      expect(() => synth.setSfxVolume(input)).not.toThrow();
    }

    expect(Number.isFinite((synth as unknown as { masterVolume: number }).masterVolume)).toBe(true);
    expect(Number.isFinite((synth as unknown as { sfxVolume: number }).sfxVolume)).toBe(true);
  });

  it('handles AudioContext constructor throwing exception gracefully by disabling audio', async () => {
    vi.stubGlobal('window', {
      AudioContext: class ThrowingAudioContext {
        constructor() {
          throw new Error('NotAllowedError: AudioContext construction was disallowed');
        }
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const synth = new SoundSynthesizer();
    expect(synth.isSupported).toBe(true);

    await expect(synth.init()).resolves.toBeUndefined();
    expect(synth.isSupported).toBe(false);

    expect(() => synth.playSwordSwing()).not.toThrow();
    expect(synth.callCounts.swordSwing).toBe(1);
  });

  it('synthesizes all 10 sound effects and verifies ZERO illegal exponential ramps to 0', async () => {
    const synth = new SoundSynthesizer();
    await synth.init();

    synth.playSwordSwing();
    synth.playEnemyHit();
    synth.playPlayerHurt();
    synth.playEnemySplat();
    synth.playCoinPickup();
    synth.playPotionDrink();
    synth.playLevelUp();
    synth.playPortalHum(800);
    synth.playButtonClick();
    synth.playSpellCast();

    await new Promise((r) => setTimeout(r, 10));
    expect(exponentialRampZeroCount).toBe(0);
  });
});

describe('MusicPlayer Full Tests with DOM Audio Mock', () => {
  let music: MusicPlayer;
  let playedCount = 0;

  class MockAudioElement {
    src = '';
    private _volume: number = 1.0;
    loop = false;
    paused = true;
    currentTime = 0;
    preload = '';

    get volume(): number {
      return this._volume;
    }

    set volume(val: number) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new TypeError(
          "Failed to set the 'volume' property on 'HTMLMediaElement': The provided double value is non-finite."
        );
      }
      if (val < 0 || val > 1) {
        throw new RangeError(
          `Failed to set the 'volume' property on 'HTMLMediaElement': The volume provided (${val}) is outside the range [0, 1].`
        );
      }
      this._volume = val;
    }

    play() {
      this.paused = false;
      playedCount++;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    canPlayType(type: string): string {
      return type.startsWith('audio/ogg') ? 'probably' : '';
    }
  }

  beforeEach(() => {
    playedCount = 0;
    vi.stubGlobal('window', {});
    vi.stubGlobal('Audio', MockAudioElement);
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      cb(performance.now() + 10000);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    music = new MusicPlayer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes channels and plays tracks with crossfading and volume control', async () => {
    await music.init();
    expect(music.currentTrack).toBe('silence');
    expect(music.isPlaying).toBe(false);

    await music.play('menu');
    expect(music.currentTrack).toBe('menu');
    expect(playedCount).toBeGreaterThanOrEqual(1);

    await music.crossfadeTo('game', 0.1);
    expect(music.currentTrack).toBe('game');

    music.setMusicVolume(0.5);
    music.duck(0.5, 0.05);

    music.pause();
    await music.resume();

    await music.crossfadeTo('silence', 0.1);
    music.stop();
    expect(music.currentTrack).toBe('silence');
  });

  it('clamps setMusicVolume to [0.0, 1.0] for negative, extreme, and non-finite inputs', async () => {
    await music.init();
    await music.play('menu');

    const testCases = [
      { input: -10, expected: 0.0 },
      { input: -0.01, expected: 0.0 },
      { input: 0.0, expected: 0.0 },
      { input: 0.72, expected: 0.72 },
      { input: 1.0, expected: 1.0 },
      { input: 1.8, expected: 1.0 },
      { input: 9999, expected: 1.0 },
      { input: Infinity, expected: 1.0 },
      { input: -Infinity, expected: 0.0 },
      { input: NaN, expected: 0.0 },
    ];

    for (const tc of testCases) {
      expect(() => music.setMusicVolume(tc.input)).not.toThrow();
      expect((music as unknown as { targetVolume: number }).targetVolume).toBe(tc.expected);
      const active = (music as unknown as { getActiveAudio: () => MockAudioElement }).getActiveAudio();
      expect(active.volume).toBe(tc.expected);
    }
  });

  it('handles 0-duration, negative-duration, and NaN crossfade calls without NaN volume or TypeError', async () => {
    await music.init();
    await music.play('menu');
    expect(music.currentTrack).toBe('menu');

    // 0-duration crossfade to 'game'
    await expect(music.crossfadeTo('game', 0)).resolves.toBeUndefined();
    expect(music.currentTrack).toBe('game');
    const activeGame = (music as unknown as { getActiveAudio: () => MockAudioElement }).getActiveAudio();
    expect(activeGame.volume).toBeCloseTo(0.6, 2);
    expect(Number.isFinite(activeGame.volume)).toBe(true);

    // Negative duration crossfade to 'menu'
    await expect(music.crossfadeTo('menu', -1.5)).resolves.toBeUndefined();
    expect(music.currentTrack).toBe('menu');
    const activeMenu = (music as unknown as { getActiveAudio: () => MockAudioElement }).getActiveAudio();
    expect(activeMenu.volume).toBeCloseTo(0.6, 2);
    expect(Number.isFinite(activeMenu.volume)).toBe(true);

    // NaN duration crossfade
    await expect(music.crossfadeTo('game', NaN)).resolves.toBeUndefined();
    expect(music.currentTrack).toBe('game');

    // 0-duration fadeOut to 'silence'
    await expect(music.crossfadeTo('silence', 0)).resolves.toBeUndefined();
    expect(music.currentTrack).toBe('silence');
  });

  it('executes crossfade animation frame 0 (elapsed = 0) without producing NaN volume', async () => {
    let scheduledStep: ((time: number) => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      scheduledStep = cb;
      return 101;
    });

    await music.init();
    await music.play('menu');

    await music.crossfadeTo('game', 1.0);
    expect(scheduledStep).not.toBeNull();

    const startTime = performance.now();

    // Frame 0 execution
    expect(() => scheduledStep!(startTime)).not.toThrow();
    const active = (music as unknown as { getActiveAudio: () => MockAudioElement }).getActiveAudio();
    expect(Number.isFinite(active.volume)).toBe(true);

    // Midway and final frames
    expect(() => scheduledStep!(startTime + 500)).not.toThrow();
    expect(() => scheduledStep!(startTime + 1000)).not.toThrow();
  });

  it('clamps ducking multiplier within [0.0, 1.0] range preventing DOM IndexSizeError and TypeError', async () => {
    vi.useFakeTimers();
    await music.init();
    await music.play('menu');
    music.setMusicVolume(0.7);

    const active = (music as unknown as { getActiveAudio: () => MockAudioElement }).getActiveAudio();

    // Multiplier > 1.0 (0.7 * 2.0 = 1.4, must clamp to 1.0)
    expect(() => music.duck(2.0, 0.5)).not.toThrow();
    expect(active.volume).toBeLessThanOrEqual(1.0);
    expect(active.volume).toBeGreaterThanOrEqual(0.0);
    vi.advanceTimersByTime(500);
    expect(active.volume).toBeCloseTo(0.7);

    // Negative multiplier (0.7 * -0.5 = -0.35, must clamp to 0.0)
    expect(() => music.duck(-0.5, 0.5)).not.toThrow();
    expect(active.volume).toBe(0.0);
    vi.advanceTimersByTime(500);
    expect(active.volume).toBeCloseTo(0.7);

    // NaN multiplier (must not set active.volume to NaN)
    expect(() => music.duck(NaN, 0.5)).not.toThrow();
    expect(Number.isFinite(active.volume)).toBe(true);
    expect(active.volume).toBeGreaterThanOrEqual(0.0);
    expect(active.volume).toBeLessThanOrEqual(1.0);
    vi.advanceTimersByTime(500);
    expect(active.volume).toBeCloseTo(0.7);

    // Infinity multiplier
    expect(() => music.duck(Infinity, 0.5)).not.toThrow();
    expect(active.volume).toBe(1.0);
    vi.advanceTimersByTime(500);
    expect(active.volume).toBeCloseTo(0.7);

    vi.useRealTimers();
  });
});

describe('AudioBridge Event Integration Tests', () => {
  class MockEventBus implements IEventBus {
    private handlers: Map<string, Array<(payload?: unknown) => void>> = new Map();

    on(event: string, handler: (payload?: unknown) => void): () => void {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
      return () => {
        const list = this.handlers.get(event);
        if (list) {
          const idx = list.indexOf(handler);
          if (idx !== -1) list.splice(idx, 1);
        }
      };
    }

    emit(event: string, payload?: unknown): void {
      const list = this.handlers.get(event);
      if (list) {
        for (const handler of [...list]) {
          handler(payload);
        }
      }
    }

    handlerCount(event: string): number {
      return this.handlers.get(event)?.length || 0;
    }
  }

  it('subscribes to combat and game events, invoking the synthesizer', () => {
    const eventBus = new MockEventBus();
    const synth = new SoundSynthesizer();
    const music = new MusicPlayer();

    const crossfadeSpy = vi.spyOn(music, 'crossfadeTo').mockResolvedValue(undefined);
    const duckSpy = vi.spyOn(music, 'duck');

    const unsubscribe = registerAudioEvents(eventBus, synth, music);

    // Verify combat events
    eventBus.emit('player:attackSwing');
    expect(synth.callCounts.swordSwing).toBe(1);

    eventBus.emit('entity:damaged');
    expect(synth.callCounts.enemyHit).toBe(1);

    eventBus.emit('player:damaged');
    expect(synth.callCounts.playerHurt).toBe(1);

    eventBus.emit('entity:crushed');
    expect(synth.callCounts.enemySplat).toBe(1);

    eventBus.emit('player:castSpell');
    expect(synth.callCounts.spellCast).toBe(1);

    // Progression events
    eventBus.emit('player:coinCollected');
    expect(synth.callCounts.coinPickup).toBe(1);

    eventBus.emit('player:potionUsed');
    expect(synth.callCounts.potionDrink).toBe(1);

    eventBus.emit('player:levelUp');
    expect(synth.callCounts.levelUp).toBe(1);
    expect(duckSpy).toHaveBeenCalledWith(0.3, 0.8);

    // World & UI events
    eventBus.emit('portal:hum');
    expect(synth.callCounts.portalHum).toBe(1);

    eventBus.emit('ui:buttonClicked');
    expect(synth.callCounts.buttonClick).toBe(1);

    // Music events
    eventBus.emit('game:started');
    expect(crossfadeSpy).toHaveBeenCalledWith('game', 1.5);

    eventBus.emit('ui:menuToggled', { menuId: 'mainMenu', open: true });
    expect(crossfadeSpy).toHaveBeenCalledWith('menu', 1.5);

    eventBus.emit('ui:menuToggled', { menuId: 'mainMenu', open: false });
    expect(crossfadeSpy).toHaveBeenCalledWith('game', 1.5);

    eventBus.emit('game:over', { victory: true });
    expect(synth.callCounts.levelUp).toBe(2);
    expect(crossfadeSpy).toHaveBeenCalledWith('menu', 2.0);

    // Teardown
    unsubscribe();
    expect(eventBus.handlerCount('player:attackSwing')).toBe(0);
    expect(eventBus.handlerCount('game:started')).toBe(0);
  });
});
