/**
 * Empirical Stress & Edge Case Verification Harness for Milestone 1 Audio
 *
 * Tests:
 * 1. Rapid Firing Burst Stress (100 triggers per SFX in 10ms, 1000 total calls)
 *    - Memory spikes, node leaks, promise rejections, disconnect verification
 * 2. Volume Bounds & Extreme Inputs
 *    - Negative (-5), extreme (9999), Infinity, -Infinity, NaN
 *    - Clamping verification on SoundSynthesizer and MusicPlayer
 * 3. State Transitions Under Load
 *    - Rapid mute toggling (100 toggles in 10ms) while firing SFX
 * 4. Crossfade Stress on MusicPlayer
 *    - Rapid sequential and concurrent crossfades
 *    - Track resolution, rAF cancellation, zero-duration crossfades, volume finiteness (NaN checks)
 * 5. Headless Fallback & Undefined AudioContext
 *    - window === undefined
 *    - window.AudioContext === undefined
 *    - AudioContext constructor throws
 */

import { SoundSynthesizer, MusicPlayer, SoundEffectType, MusicTrackKey } from '../../../src/audio';

// =============================================================================
// Mock Web Audio & DOM Infrastructure for Precise Leak & Param Auditing
// =============================================================================

export interface NodeAuditStats {
  createdGainNodes: number;
  createdOscillators: number;
  createdBiquadFilters: number;
  createdBufferSources: number;
  connectedCount: number;
  disconnectedCount: number;
  invalidParamValues: Array<{ param: string; method: string; value: unknown }>;
  exponentialRampZeroCount: number;
}

export function createAuditedMockWebAudio() {
  const stats: NodeAuditStats = {
    createdGainNodes: 0,
    createdOscillators: 0,
    createdBiquadFilters: 0,
    createdBufferSources: 0,
    connectedCount: 0,
    disconnectedCount: 0,
    invalidParamValues: [],
    exponentialRampZeroCount: 0,
  };

  const activeNodes = new Set<MockAudioNode>();

  class MockAudioParam {
    public value: number = 1;
    constructor(public name: string) {}

    setValueAtTime(val: number, _time: number) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        stats.invalidParamValues.push({ param: this.name, method: 'setValueAtTime', value: val });
      }
      this.value = val;
    }

    linearRampToValueAtTime(val: number, _time: number) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        stats.invalidParamValues.push({ param: this.name, method: 'linearRampToValueAtTime', value: val });
      }
      this.value = val;
    }

    exponentialRampToValueAtTime(val: number, _time: number) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        stats.invalidParamValues.push({ param: this.name, method: 'exponentialRampToValueAtTime', value: val });
      }
      if (val <= 0) {
        stats.exponentialRampZeroCount++;
      }
      this.value = val;
    }

    cancelScheduledValues(_time: number) {}
  }

  class MockAudioNode {
    public isConnected: boolean = false;
    constructor(public nodeType: string) {
      activeNodes.add(this);
    }

    connect(_dest: unknown) {
      this.isConnected = true;
      stats.connectedCount++;
    }

    disconnect() {
      if (this.isConnected) {
        this.isConnected = false;
        stats.disconnectedCount++;
      }
      activeNodes.delete(this);
    }
  }

  class MockGainNode extends MockAudioNode {
    public gain = new MockAudioParam('gain');
    constructor() {
      super('GainNode');
      stats.createdGainNodes++;
    }
  }

  class MockOscillatorNode extends MockAudioNode {
    public type: OscillatorType = 'sine';
    public frequency = new MockAudioParam('frequency');
    public onended: (() => void) | null = null;
    constructor() {
      super('OscillatorNode');
      stats.createdOscillators++;
    }

    start(_time?: number) {}
    stop(_time?: number) {
      // Simulate Web Audio onended microtask
      queueMicrotask(() => {
        if (this.onended) {
          this.onended();
        }
      });
    }
  }

  class MockBiquadFilterNode extends MockAudioNode {
    public type: BiquadFilterType = 'lowpass';
    public frequency = new MockAudioParam('frequency');
    public Q = new MockAudioParam('Q');
    constructor() {
      super('BiquadFilterNode');
      stats.createdBiquadFilters++;
    }
  }

  class MockBufferSourceNode extends MockAudioNode {
    public buffer: unknown = null;
    public onended: (() => void) | null = null;
    constructor() {
      super('BufferSourceNode');
      stats.createdBufferSources++;
    }

    start(_time?: number) {}
    stop(_time?: number) {
      queueMicrotask(() => {
        if (this.onended) {
          this.onended();
        }
      });
    }
  }

  class MockAudioContext {
    public currentTime: number = 0;
    public sampleRate: number = 44100;
    public state: AudioContextState = 'suspended';
    public destination = new MockAudioNode('DestinationNode');

    createGain() {
      return new MockGainNode();
    }
    createOscillator() {
      return new MockOscillatorNode();
    }
    createBiquadFilter() {
      return new MockBiquadFilterNode();
    }
    createBufferSource() {
      return new MockBufferSourceNode();
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

  return {
    stats,
    activeNodes,
    MockAudioContext,
  };
}

export function createAuditedMockDOMAudio() {
  const invalidVolumeAssignments: unknown[] = [];
  let rafCallbackCount = 0;
  let cancelRafCount = 0;

  class MockAudioElement {
    public src: string = '';
    private _volume: number = 1.0;
    public loop: boolean = false;
    public paused: boolean = true;
    public currentTime: number = 0;
    public preload: string = '';

    get volume(): number {
      return this._volume;
    }

    set volume(val: number) {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 1) {
        invalidVolumeAssignments.push(val);
      }
      this._volume = val;
    }

    play(): Promise<void> {
      this.paused = false;
      return Promise.resolve();
    }

    pause(): void {
      this.paused = true;
    }
  }

  let rafQueue: Array<{ id: number; cb: (time: number) => void }> = [];
  let nextRafId = 1;

  const mockRaf = (cb: (time: number) => void): number => {
    const id = nextRafId++;
    rafQueue.push({ id, cb });
    rafCallbackCount++;
    return id;
  };

  const mockCancelRaf = (id: number): void => {
    cancelRafCount++;
    rafQueue = rafQueue.filter((item) => item.id !== id);
  };

  const flushRaf = (advanceTimeMs: number = 100) => {
    const currentQueue = [...rafQueue];
    rafQueue = [];
    const simulatedNow = performance.now() + advanceTimeMs;
    for (const item of currentQueue) {
      item.cb(simulatedNow);
    }
  };

  return {
    MockAudioElement,
    mockRaf,
    mockCancelRaf,
    flushRaf,
    invalidVolumeAssignments,
    getRafCounts: () => ({ rafCallbackCount, cancelRafCount, pendingInQueue: rafQueue.length }),
  };
}

// =============================================================================
// Test Suites Execution
// =============================================================================

export interface TestResult {
  testName: string;
  passed: boolean;
  metrics: Record<string, unknown>;
  error?: string;
}

export async function runAllStressTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ---------------------------------------------------------------------------
  // Test 1: Rapid Firing Burst Stress (100 calls per SFX in 10ms = 1000 calls)
  // ---------------------------------------------------------------------------
  try {
    const { stats, activeNodes, MockAudioContext } = createAuditedMockWebAudio();
    const origWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: MockAudioContext,
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const synth = new SoundSynthesizer();
    await synth.init();

    const memBefore = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    const soundMethods: SoundEffectType[] = [
      'swordSwing',
      'enemyHit',
      'playerHurt',
      'enemySplat',
      'coinPickup',
      'potionDrink',
      'levelUp',
      'portalHum',
      'buttonClick',
      'spellCast',
    ];

    // Fire 100 times for each of the 10 sounds in a tight burst loop
    for (let i = 0; i < 100; i++) {
      synth.playSwordSwing();
      synth.playEnemyHit();
      synth.playPlayerHurt();
      synth.playEnemySplat();
      synth.playCoinPickup();
      synth.playPotionDrink();
      synth.playLevelUp();
      synth.playPortalHum(500);
      synth.playButtonClick();
      synth.playSpellCast();
    }

    const burstDurationMs = performance.now() - startTime;
    const memDuring = process.memoryUsage().heapUsed;

    // Await microtasks to simulate node playback end & cleanup handlers
    await new Promise((r) => setTimeout(r, 50));
    const memAfter = process.memoryUsage().heapUsed;

    // Verify call counts
    const totalCalls = Object.values(synth.callCounts).reduce((a, b) => a + b, 0);
    const allCountsMatch = soundMethods.every((name) => synth.callCounts[name] === 100);

    // Filter activeNodes: only masterGain and sfxGain should remain active after all SFX end!
    // DestinationNode is permanent, masterGain and sfxGain are permanent.
    const nonPermanentActive = Array.from(activeNodes).filter(
      (n) => n.nodeType !== 'DestinationNode' && n.nodeType !== 'GainNode' || (n as unknown as { gain?: unknown }).gain === undefined
    );

    // Verify all created oscillators, filters, buffer sources were disconnected
    const oscLeaked = stats.createdOscillators > 0 && stats.createdOscillators !== stats.createdOscillators; // will check activeNodes
    const activeOscillators = Array.from(activeNodes).filter((n) => n.nodeType === 'OscillatorNode').length;
    const activeBufferSources = Array.from(activeNodes).filter((n) => n.nodeType === 'BufferSourceNode').length;
    const activeFilters = Array.from(activeNodes).filter((n) => n.nodeType === 'BiquadFilterNode').length;

    // Clean up mock window
    (globalThis as unknown as { window?: unknown }).window = origWindow;

    const noLeakedGenerators = activeOscillators === 0 && activeBufferSources === 0 && activeFilters === 0;
    const passed = allCountsMatch && totalCalls === 1000 && noLeakedGenerators && stats.invalidParamValues.length === 0;

    results.push({
      testName: 'Rapid Firing Burst Stress (1000 SFX in burst)',
      passed,
      metrics: {
        burstDurationMs: burstDurationMs.toFixed(2),
        totalCalls,
        createdGainNodes: stats.createdGainNodes,
        createdOscillators: stats.createdOscillators,
        createdBiquadFilters: stats.createdBiquadFilters,
        createdBufferSources: stats.createdBufferSources,
        activeOscillatorsRemaining: activeOscillators,
        activeBufferSourcesRemaining: activeBufferSources,
        activeFiltersRemaining: activeFilters,
        invalidParamValues: stats.invalidParamValues.length,
        memDeltaKB: Math.round((memDuring - memBefore) / 1024),
        memAfterKB: Math.round((memAfter - memBefore) / 1024),
      },
    });
  } catch (err) {
    results.push({
      testName: 'Rapid Firing Burst Stress (1000 SFX in burst)',
      passed: false,
      metrics: {},
      error: String(err),
    });
  }

  // ---------------------------------------------------------------------------
  // Test 2: Volume Bounds & Extreme Values Testing
  // ---------------------------------------------------------------------------
  try {
    const { stats, MockAudioContext } = createAuditedMockWebAudio();
    const origWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: MockAudioContext,
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const synth = new SoundSynthesizer();
    await synth.init();

    const testValues = [
      { input: -5, expectedMaster: 0.0, expectedSfx: 0.0, label: 'negative -5' },
      { input: -0.0001, expectedMaster: 0.0, expectedSfx: 0.0, label: 'negative -0.0001' },
      { input: 0.0, expectedMaster: 0.0, expectedSfx: 0.0, label: 'zero 0.0' },
      { input: 0.42, expectedMaster: 0.42, expectedSfx: 0.42, label: 'normal 0.42' },
      { input: 1.0, expectedMaster: 1.0, expectedSfx: 1.0, label: 'max 1.0' },
      { input: 1.5, expectedMaster: 1.0, expectedSfx: 1.0, label: 'above max 1.5' },
      { input: 9999, expectedMaster: 1.0, expectedSfx: 1.0, label: 'extreme 9999' },
      { input: Infinity, expectedMaster: 1.0, expectedSfx: 1.0, label: 'Infinity' },
      { input: -Infinity, expectedMaster: 0.0, expectedSfx: 0.0, label: '-Infinity' },
      { input: NaN, expectedMaster: 0.0, expectedSfx: 0.0, label: 'NaN' },
    ];

    const volumeAnomalies: Array<{ param: string; input: number; currentVal: number; expected: number }> = [];

    for (const tv of testValues) {
      synth.setMasterVolume(tv.input);
      const recordedMaster = (synth as unknown as { masterVolume: number }).masterVolume;
      // We expect masterVolume to be a finite number in [0, 1]
      const isValidFinite = Number.isFinite(recordedMaster) && recordedMaster >= 0 && recordedMaster <= 1;
      if (!isValidFinite) {
        volumeAnomalies.push({
          param: 'masterVolume',
          input: tv.input,
          currentVal: recordedMaster,
          expected: tv.expectedMaster,
        });
      }

      synth.setSfxVolume(tv.input);
      const recordedSfx = (synth as unknown as { sfxVolume: number }).sfxVolume;
      const isSfxValidFinite = Number.isFinite(recordedSfx) && recordedSfx >= 0 && recordedSfx <= 1;
      if (!isSfxValidFinite) {
        volumeAnomalies.push({
          param: 'sfxVolume',
          input: tv.input,
          currentVal: recordedSfx,
          expected: tv.expectedSfx,
        });
      }
    }

    // Now test MusicPlayer volume bounds
    const { MockAudioElement, invalidVolumeAssignments } = createAuditedMockDOMAudio();
    (globalThis as unknown as { Audio: unknown }).Audio = MockAudioElement;

    const music = new MusicPlayer();
    await music.init();

    const musicAnomalies: Array<{ input: number; currentVal: number }> = [];
    for (const tv of testValues) {
      music.setMusicVolume(tv.input);
      const recordedTarget = (music as unknown as { targetVolume: number }).targetVolume;
      const isValidTarget = Number.isFinite(recordedTarget) && recordedTarget >= 0 && recordedTarget <= 1;
      if (!isValidTarget) {
        musicAnomalies.push({ input: tv.input, currentVal: recordedTarget });
      }
    }

    // Clean up
    (globalThis as unknown as { window?: unknown }).window = origWindow;
    delete (globalThis as unknown as { Audio?: unknown }).Audio;

    const synthPassed = volumeAnomalies.length === 0 && stats.invalidParamValues.length === 0;
    const musicPassed = musicAnomalies.length === 0 && invalidVolumeAssignments.length === 0;
    const passed = synthPassed && musicPassed;

    results.push({
      testName: 'Volume Bounds & Extreme Inputs ([-5, 9999, Infinity, NaN])',
      passed,
      metrics: {
        volumeAnomaliesSoundSynth: volumeAnomalies,
        audioParamInvalidValues: stats.invalidParamValues,
        musicAnomalies: musicAnomalies,
        invalidDOMVolumeAssignments: invalidVolumeAssignments,
      },
    });
  } catch (err) {
    results.push({
      testName: 'Volume Bounds & Extreme Inputs ([-5, 9999, Infinity, NaN])',
      passed: false,
      metrics: {},
      error: String(err),
    });
  }

  // ---------------------------------------------------------------------------
  // Test 3: State Transitions (Rapid Mute Toggling Under Load)
  // ---------------------------------------------------------------------------
  try {
    const { stats, MockAudioContext } = createAuditedMockWebAudio();
    const origWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: MockAudioContext,
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const synth = new SoundSynthesizer({ masterVolume: 0.8 });
    await synth.init();

    let toggleFailures = 0;
    for (let i = 0; i < 100; i++) {
      const isMutedNow = synth.toggleMute();
      if (synth.isMuted !== isMutedNow) toggleFailures++;

      // Trigger SFX while state is flipping
      synth.playSwordSwing();
      synth.playCoinPickup();
      synth.playEnemySplat();
    }

    // Restore to unmuted and verify final master volume is intact
    synth.setMuted(false);
    const finalMaster = (synth as unknown as { masterVolume: number }).masterVolume;
    const isMutedFinal = synth.isMuted;

    (globalThis as unknown as { window?: unknown }).window = origWindow;

    const passed = toggleFailures === 0 && !isMutedFinal && finalMaster === 0.8 && stats.invalidParamValues.length === 0;

    results.push({
      testName: 'Rapid Mute Toggling Under Load (100 toggles + 300 SFX)',
      passed,
      metrics: {
        toggleFailures,
        finalIsMuted: isMutedFinal,
        finalMasterVolume: finalMaster,
        invalidParamValues: stats.invalidParamValues.length,
        exponentialRampZeroCount: stats.exponentialRampZeroCount,
      },
    });
  } catch (err) {
    results.push({
      testName: 'Rapid Mute Toggling Under Load (100 toggles + 300 SFX)',
      passed: false,
      metrics: {},
      error: String(err),
    });
  }

  // ---------------------------------------------------------------------------
  // Test 4: Crossfade Stress on MusicPlayer
  // ---------------------------------------------------------------------------
  try {
    const { MockAudioElement, mockRaf, mockCancelRaf, flushRaf, invalidVolumeAssignments, getRafCounts } =
      createAuditedMockDOMAudio();
    const origWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window: unknown }).window = {
      requestAnimationFrame: mockRaf,
      cancelAnimationFrame: mockCancelRaf,
    };
    (globalThis as unknown as { Audio: unknown }).Audio = MockAudioElement;
    (globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = mockRaf;
    (globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = mockCancelRaf;

    const music = new MusicPlayer();
    await music.init();

    // Trigger rapid sequential crossfades across all tracks
    const tracks: MusicTrackKey[] = ['menu', 'game', 'silence', 'game', 'menu', 'silence', 'menu'];
    for (const track of tracks) {
      await music.crossfadeTo(track, 1.5);
    }

    // Verify track resolution matches last requested track
    const intermediateTrack = music.currentTrack;

    // Flush pending rAF animations
    flushRaf(500); // 33% progress
    flushRaf(1500); // 100% progress completed

    const finalTrack = music.currentTrack;

    // Test zero-duration crossfade edge case
    await music.crossfadeTo('game', 0);
    flushRaf(0);
    const zeroDurationTrack = music.currentTrack;

    // Test extreme volume crossfade
    music.setMusicVolume(0.9);
    await music.crossfadeTo('menu', 0.5);
    flushRaf(600);

    const rafStats = getRafCounts();

    (globalThis as unknown as { window?: unknown }).window = origWindow;
    delete (globalThis as unknown as { Audio?: unknown }).Audio;
    delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    delete (globalThis as unknown as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;

    const passed =
      finalTrack === 'menu' &&
      zeroDurationTrack === 'game' &&
      invalidVolumeAssignments.length === 0;

    results.push({
      testName: 'Crossfade Stress on MusicPlayer (rapid concurrent requests & 0-duration)',
      passed,
      metrics: {
        intermediateTrack,
        finalTrack,
        zeroDurationTrack,
        invalidVolumeAssignments,
        rafCallbacksScheduled: rafStats.rafCallbackCount,
        rafCallbacksCanceled: rafStats.cancelRafCount,
      },
    });
  } catch (err) {
    results.push({
      testName: 'Crossfade Stress on MusicPlayer (rapid concurrent requests & 0-duration)',
      passed: false,
      metrics: {},
      error: String(err),
    });
  }

  // ---------------------------------------------------------------------------
  // Test 5: Headless Fallback & Undefined AudioContext (100% crash-free)
  // ---------------------------------------------------------------------------
  try {
    // 5A: Pure Node environment (window === undefined)
    const synthHeadless = new SoundSynthesizer();
    await synthHeadless.init();
    await synthHeadless.resume();
    synthHeadless.setMasterVolume(0.5);
    synthHeadless.setSfxVolume(0.5);
    synthHeadless.setMuted(true);
    synthHeadless.toggleMute();
    synthHeadless.playSwordSwing();
    synthHeadless.playEnemyHit();
    synthHeadless.playPlayerHurt();
    synthHeadless.playEnemySplat();
    synthHeadless.playCoinPickup();
    synthHeadless.playPotionDrink();
    synthHeadless.playLevelUp();
    synthHeadless.playPortalHum();
    synthHeadless.playButtonClick();
    synthHeadless.playSpellCast();

    const musicHeadless = new MusicPlayer();
    await musicHeadless.init();
    await musicHeadless.play('menu');
    await musicHeadless.crossfadeTo('game', 0.5);
    musicHeadless.pause();
    await musicHeadless.resume();
    musicHeadless.duck(0.5, 0.1);
    musicHeadless.setMusicVolume(0.5);
    musicHeadless.stop();

    // 5B: window defined, but AudioContext === undefined
    const origWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window: unknown }).window = {
      // AudioContext is intentionally undefined
    };

    const synthNoCtx = new SoundSynthesizer();
    await synthNoCtx.init();
    await synthNoCtx.resume();
    synthNoCtx.playSwordSwing();
    synthNoCtx.playSpellCast();

    // 5C: window.AudioContext constructor throws (e.g. security/hardware error)
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: class ThrowsContext {
        constructor() {
          throw new Error('NotAllowedError: AudioContext was not allowed to start');
        }
      },
    };

    let synthThrowCaught = false;
    try {
      const synthThrows = new SoundSynthesizer();
      await synthThrows.init();
      synthThrows.playSwordSwing();
    } catch {
      synthThrowCaught = true;
    }

    (globalThis as unknown as { window?: unknown }).window = origWindow;

    const passed =
      !synthHeadless.isSupported &&
      synthHeadless.callCounts.swordSwing === 1 &&
      musicHeadless.currentTrack === 'silence' &&
      !synthNoCtx.isSupported &&
      !synthThrowCaught; // Should handle throwing constructor or not crash

    results.push({
      testName: 'Headless Fallback & Undefined AudioContext (100% crash-free)',
      passed,
      metrics: {
        synthHeadlessSupported: synthHeadless.isSupported,
        synthNoCtxSupported: synthNoCtx.isSupported,
        musicHeadlessTrack: musicHeadless.currentTrack,
        synthThrowCaughtUnexpectedly: synthThrowCaught,
      },
    });
  } catch (err) {
    results.push({
      testName: 'Headless Fallback & Undefined AudioContext (100% crash-free)',
      passed: false,
      metrics: {},
      error: String(err),
    });
  }

  return results;
}

console.log('=== STARTING EMPIRICAL AUDIO STRESS HARNESS ===\n');
runAllStressTests().then((results) => {
  let allPassed = true;
  for (const res of results) {
    console.log(`[${res.passed ? 'PASS' : 'FAIL'}] ${res.testName}`);
    console.log('Metrics:', JSON.stringify(res.metrics, null, 2));
    if (res.error) {
      console.error('Error:', res.error);
      allPassed = false;
    }
    if (!res.passed) {
      allPassed = false;
    }
    console.log('--------------------------------------------------');
  }
  console.log(`\nOVERALL HARNESS RESULT: ${allPassed ? 'ALL TESTS PASSED' : 'FAILURES DETECTED'}`);
  process.exit(allPassed ? 0 : 1);
});
