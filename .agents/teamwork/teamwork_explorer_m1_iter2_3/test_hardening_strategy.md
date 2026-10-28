# Audio Subsystem Test Hardening Strategy (`tests/unit/audio.test.ts`)

**Author**: `teamwork_explorer_m1_iter2_3`  
**Target Milestone**: Milestone 1 Iteration 2 (Audio Subsystem Robustness)  
**Target File**: `tests/unit/audio.test.ts`  
**Associated Issues**:
1. Volume bounds with `NaN`, `Infinity`, `-10`, `9999` in `SoundSynthesizer` and `MusicPlayer`
2. Instantaneous 0-duration and negative-duration crossfade calls in `MusicPlayer`
3. Ducking multiplier bounds (> 1.0, < 0.0, `NaN`) in `MusicPlayer`
4. `AudioContext` constructor throwing exceptions in `SoundSynthesizer.init()`

---

## 1. Executive Summary & Test Gap Diagnosis

During Milestone 1 evaluation, the test suite `tests/unit/audio.test.ts` reported **10/10 passing tests**, yet adversarial stress testing (`audio_stress_harness.ts`) and real Chromium browser testing (`browser_audio_stress.ts`) revealed **4 catastrophic runtime crash bugs**:
1. `setMasterVolume(NaN)` and `setSfxVolume(NaN)` pass `NaN` to `AudioParam.linearRampToValueAtTime()`, throwing `TypeError: The provided float value is non-finite`.
2. `MusicPlayer.crossfadeTo(track, 0)` divides by zero (`0 / 0 = NaN`), assigning `NaN` to `HTMLMediaElement.volume`, throwing `TypeError`.
3. `MusicPlayer.duck(2.0, 0.5)` assigns `1.2` to `HTMLMediaElement.volume`, throwing `IndexSizeError: The volume provided is outside the range [0, 1]`.
4. `new window.AudioContext()` throws when browser autoplay/hardware/sandbox policies restrict audio, causing `SoundSynthesizer.init()` to reject with an unhandled exception.

### Why Did the Initial Unit Tests Pass?

The initial unit tests failed to catch these issues due to three fundamental testing flaws:

| Flaw Category | Existing Implementation in `audio.test.ts` | Defect / Vulnerability |
| :--- | :--- | :--- |
| **Permissive Mocks** | `MockAudioParam` accepted any value without validating `Number.isFinite()`. `MockAudioElement.volume` was a simple unconstrained number property. | Diverged completely from Web Audio and HTML5 specifications. Real browser engines throw `TypeError` or `IndexSizeError` on invalid values, but the mocks silently swallowed them. |
| **Skipped Frame 0 in rAF** | `requestAnimationFrame` was mocked as `cb(performance.now() + 10000)`. | By jumping 10,000ms ahead, `elapsed` was `10000`, so `elapsed / durationMs` yielded `10000 / 0 = Infinity` (clamped to 1.0), masking the frame-0 `0 / 0 = NaN` division. |
| **Hollow Assertions** | `clamps master volume` (lines 24–29) called `setMasterVolume(-0.5)`, `(1.5)`, `(0.75)` and asserted only `expect(synth.isMuted).toBe(false)`. | Never asserted the clamped volume value! The volume could be `-999` or `NaN` and the assertion would still pass. |
| **Monolithic Happy-Path Test** | `MusicPlayer` had only one test that performed a linear sequence with valid numbers (`crossfadeTo(..., 0.1)`, `duck(0.5, 0.05)`). | Zero tests for `durationSec = 0`, negative duration, extreme volume, or multipliers > 1.0 or < 0.0. |
| **Missing Failure Modes** | `MockAudioContext` in simulation always succeeded. Node tests ran with `window === undefined`. | Never tested the scenario where `window.AudioContext` exists but its constructor throws an exception. |

---

## 2. Mock Infrastructure Hardening Plan

To ensure test fidelity matches real Chromium behavior, the mock classes in `tests/unit/audio.test.ts` must be upgraded to enforce the Web Audio and HTMLMediaElement specifications.

### 2.1 Hardened `MockAudioParam`
Real Web Audio `AudioParam` methods (`setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`) strictly mandate that all float arguments are finite. Passing `NaN` or `Infinity` throws a `TypeError`.

```typescript
class MockAudioParam {
  value: number = 1;

  private assertFinite(val: number, method: string): void {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new TypeError(
        `Failed to execute '${method}' on 'AudioParam': The provided float value is non-finite.`
      );
    }
  }

  setValueAtTime(val: number, _time: number): void {
    this.assertFinite(val, 'setValueAtTime');
    this.value = val;
  }

  linearRampToValueAtTime(val: number, _time: number): void {
    this.assertFinite(val, 'linearRampToValueAtTime');
    this.value = val;
  }

  exponentialRampToValueAtTime(val: number, _time: number): void {
    this.assertFinite(val, 'exponentialRampToValueAtTime');
    if (val <= 0) {
      exponentialRampZeroCount++;
    }
    this.value = val;
  }

  cancelScheduledValues(_time: number): void {}
}
```

### 2.2 Hardened `MockAudioElement`
Real `HTMLMediaElement.prototype.volume` validates assignments:
- If `!Number.isFinite(val)`, it throws `TypeError: The provided double value is non-finite`.
- If `val < 0` or `val > 1`, it throws `IndexSizeError` (modeled as `RangeError`).

```typescript
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

  play(): Promise<void> {
    this.paused = false;
    playedCount++;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}
```

---

## 3. Concrete Test Specifications to Add / Update

### Suite A: `SoundSynthesizer Headless Tests`

#### Test A.1: Real Volume Value Assertion for Boundary & Non-Finite Inputs
Replace the toothless `expect(synth.isMuted).toBe(false)` tests with precise boundary validations:

```typescript
it('clamps master volume safely to [0.0, 1.0] for negative, extreme, and non-finite values', () => {
  const cases: Array<{ input: number; expected: number }> = [
    { input: -10, expected: 0.0 },
    { input: -0.001, expected: 0.0 },
    { input: 0.0, expected: 0.0 },
    { input: 0.42, expected: 0.42 },
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
  }
});

it('clamps sfx volume safely to [0.0, 1.0] for negative, extreme, and non-finite values', () => {
  const cases: Array<{ input: number; expected: number }> = [
    { input: -5, expected: 0.0 },
    { input: 0.0, expected: 0.0 },
    { input: 0.85, expected: 0.85 },
    { input: 1.0, expected: 1.0 },
    { input: 500, expected: 1.0 },
    { input: Infinity, expected: 1.0 },
    { input: -Infinity, expected: 0.0 },
    { input: NaN, expected: 0.0 },
  ];

  for (const c of cases) {
    synth.setSfxVolume(c.input);
    expect((synth as unknown as { sfxVolume: number }).sfxVolume).toBe(c.expected);
  }
});
```

#### Test A.2: Constructor Config Clamping with Non-Finite Inputs
```typescript
it('clamps initial constructor config volumes for NaN, Infinity, and out-of-bounds values', () => {
  const customSynth = new SoundSynthesizer({
    masterVolume: NaN,
    sfxVolume: Infinity,
    muted: true,
  });
  expect((customSynth as unknown as { masterVolume: number }).masterVolume).toBe(0.0);
  expect((customSynth as unknown as { sfxVolume: number }).sfxVolume).toBe(1.0);
  expect(customSynth.isMuted).toBe(true);

  const negativeSynth = new SoundSynthesizer({
    masterVolume: -10,
    sfxVolume: -Infinity,
  });
  expect((negativeSynth as unknown as { masterVolume: number }).masterVolume).toBe(0.0);
  expect((negativeSynth as unknown as { sfxVolume: number }).sfxVolume).toBe(0.0);
});
```

---

### Suite B: `SoundSynthesizer Web Audio Node Graph Simulation`

#### Test B.1: Live AudioParam Non-Finite Clamping (Catches `linearRampToValueAtTime(NaN)`)
```typescript
it('clamps live Web Audio master and sfx gain params without non-finite TypeErrors', async () => {
  const synth = new SoundSynthesizer();
  await synth.init();

  const extremeInputs = [-10, 9999, Infinity, -Infinity, NaN];
  for (const input of extremeInputs) {
    // Under unpatched code, NaN immediately throws TypeError from hardened MockAudioParam
    expect(() => synth.setMasterVolume(input)).not.toThrow();
    expect(() => synth.setSfxVolume(input)).not.toThrow();
  }

  // Verify internal properties are valid finite numbers in [0, 1]
  expect(Number.isFinite((synth as unknown as { masterVolume: number }).masterVolume)).toBe(true);
  expect(Number.isFinite((synth as unknown as { sfxVolume: number }).sfxVolume)).toBe(true);
});
```

#### Test B.2: AudioContext Constructor Throwing Exception Graceful Handling
```typescript
it('handles AudioContext constructor throwing gracefully by disabling audio and not rejecting', async () => {
  vi.stubGlobal('window', {
    AudioContext: class ThrowingAudioContext {
      constructor() {
        throw new Error('NotAllowedError: AudioContext construction disallowed by policy');
      }
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  const synth = new SoundSynthesizer();
  expect(synth.isSupported).toBe(true); // window.AudioContext was present

  // Must resolve gracefully without throwing unhandled rejection
  await expect(synth.init()).resolves.toBeUndefined();

  // Audio subsystem gracefully falls back
  expect(synth.isSupported).toBe(false);

  // Subsequent SFX calls must safely no-op and increment telemetry
  expect(() => synth.playSwordSwing()).not.toThrow();
  expect(synth.callCounts.swordSwing).toBe(1);
});
```

---

### Suite C: `MusicPlayer Full Tests with DOM Audio Mock`

#### Test C.1: Volume Clamping with Strict DOM HTMLMediaElement Setter
```typescript
it('clamps setMusicVolume to [0.0, 1.0] preventing DOM IndexSizeError and non-finite TypeError', async () => {
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
```

#### Test C.2: Instantaneous 0-Duration, Negative, and NaN Crossfades
```typescript
it('handles 0-duration, negative-duration, and NaN crossfade calls without NaN volume or TypeError', async () => {
  await music.init();
  await music.play('menu');
  expect(music.currentTrack).toBe('menu');

  // Test 1: 0-duration crossfade to 'game'
  await expect(music.crossfadeTo('game', 0)).resolves.toBeUndefined();
  expect(music.currentTrack).toBe('game');
  const activeGame = (music as unknown as { getActiveAudio: () => MockAudioElement }).getActiveAudio();
  expect(activeGame.volume).toBeCloseTo(0.6, 2);
  expect(Number.isFinite(activeGame.volume)).toBe(true);

  // Test 2: Negative duration crossfade to 'menu'
  await expect(music.crossfadeTo('menu', -1.5)).resolves.toBeUndefined();
  expect(music.currentTrack).toBe('menu');
  const activeMenu = (music as unknown as { getActiveAudio: () => MockAudioElement }).getActiveAudio();
  expect(activeMenu.volume).toBeCloseTo(0.6, 2);
  expect(Number.isFinite(activeMenu.volume)).toBe(true);

  // Test 3: NaN duration crossfade
  await expect(music.crossfadeTo('game', NaN)).resolves.toBeUndefined();
  expect(music.currentTrack).toBe('game');

  // Test 4: 0-duration fadeOut to 'silence'
  await expect(music.crossfadeTo('silence', 0)).resolves.toBeUndefined();
  expect(music.currentTrack).toBe('silence');
});
```

#### Test C.3: Step-by-Step Frame 0 rAF Crossfade Progress Verification
Tests the exact calculation `Math.min(elapsed / durationMs, 1.0)` when `elapsed = 0`:

```typescript
it('executes crossfade animation frame 0 (elapsed = 0) without producing NaN volume', async () => {
  let scheduledStep: ((time: number) => void) | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    scheduledStep = cb;
    return 101;
  });

  await music.init();
  await music.play('menu');

  // Trigger crossfade with valid duration
  await music.crossfadeTo('game', 1.0);
  expect(scheduledStep).not.toBeNull();

  const startTime = performance.now();

  // Execute frame 0 where timestamp matches startTime (elapsed = 0)
  expect(() => scheduledStep!(startTime)).not.toThrow();
  const active = (music as unknown as { getActiveAudio: () => MockAudioElement }).getActiveAudio();
  expect(Number.isFinite(active.volume)).toBe(true);

  // Execute intermediate frame (elapsed = 500ms)
  expect(() => scheduledStep!(startTime + 500)).not.toThrow();
  expect(Number.isFinite(active.volume)).toBe(true);

  // Execute final completion frame (elapsed = 1000ms)
  expect(() => scheduledStep!(startTime + 1000)).not.toThrow();
  expect(Number.isFinite(active.volume)).toBe(true);
});
```

#### Test C.4: Ducking Multiplier Bounds (> 1.0, < 0.0, NaN, Infinity)
```typescript
it('clamps ducking multiplier within [0.0, 1.0] range preventing DOM IndexSizeError and TypeError', async () => {
  vi.useFakeTimers();
  await music.init();
  await music.play('menu');
  music.setMusicVolume(0.7);

  const active = (music as unknown as { getActiveAudio: () => MockAudioElement }).getActiveAudio();

  // Case 1: Multiplier > 1.0 (0.7 * 2.0 = 1.4, must clamp to 1.0)
  expect(() => music.duck(2.0, 0.5)).not.toThrow();
  expect(active.volume).toBeLessThanOrEqual(1.0);
  expect(active.volume).toBeGreaterThanOrEqual(0.0);
  vi.advanceTimersByTime(500);
  expect(active.volume).toBeCloseTo(0.7);

  // Case 2: Negative multiplier (0.7 * -0.5 = -0.35, must clamp to 0.0)
  expect(() => music.duck(-0.5, 0.5)).not.toThrow();
  expect(active.volume).toBe(0.0);
  vi.advanceTimersByTime(500);
  expect(active.volume).toBeCloseTo(0.7);

  // Case 3: NaN multiplier (must not set active.volume to NaN)
  expect(() => music.duck(NaN, 0.5)).not.toThrow();
  expect(Number.isFinite(active.volume)).toBe(true);
  expect(active.volume).toBeGreaterThanOrEqual(0.0);
  expect(active.volume).toBeLessThanOrEqual(1.0);
  vi.advanceTimersByTime(500);
  expect(active.volume).toBeCloseTo(0.7);

  // Case 4: Infinity multiplier
  expect(() => music.duck(Infinity, 0.5)).not.toThrow();
  expect(active.volume).toBe(1.0);
  vi.advanceTimersByTime(500);
  expect(active.volume).toBeCloseTo(0.7);

  vi.useRealTimers();
});
```

---

## 4. Complete Ready-to-Implement Proposal for `tests/unit/audio.test.ts`

The following full code listing provides the complete, hardened implementation for the Worker to drop directly into `tests/unit/audio.test.ts`:

```typescript
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

  it('executes all 10 retro sound synthesis functions safely in headless mode', () => {
    const soundMethods: Array<{ name: SoundEffectType; fn: () => void }> = [
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

    setValueAtTime(_val: number, _time: number) {
      this.assertFinite(_val, 'setValueAtTime');
      this.value = _val;
    }
    linearRampToValueAtTime(_val: number, _time: number) {
      this.assertFinite(_val, 'linearRampToValueAtTime');
      this.value = _val;
    }
    exponentialRampToValueAtTime(_val: number, _time: number) {
      this.assertFinite(_val, 'exponentialRampToValueAtTime');
      if (_val <= 0) {
        exponentialRampZeroCount++;
      }
      this.value = _val;
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
```

---

## 5. Verification & Regression Defense Checklist

When the Worker updates `tests/unit/audio.test.ts` and fixes `SoundSynthesizer.ts` and `MusicPlayer.ts`:
1. **Unpatched Failure Verification**: Running these hardened tests before patching will fail 6+ tests with verbatim `TypeError: The provided float/double value is non-finite` and `RangeError: outside the range [0, 1]`.
2. **Patched Pass Verification**: After Worker applies fixes from `teamwork_explorer_m1_iter2_1` and `teamwork_explorer_m1_iter2_2`, running `npx vitest run tests/unit/audio.test.ts` must pass 100% (16/16 tests).
3. **End-to-End Stress Verification**:
   - `npx vite-node .agents/teamwork/teamwork_challenger_m1_2/audio_stress_harness.ts` -> 100% PASS.
   - `npx vite-node .agents/teamwork/teamwork_challenger_m1_2/browser_audio_stress.ts` -> 100% PASS in real Chromium.
