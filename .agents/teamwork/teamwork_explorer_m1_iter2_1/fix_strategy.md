# Milestone 1 Audio Subsystem: Bulletproof Fix Strategy

**Author**: `teamwork_explorer_m1_iter2_1`  
**Timestamp**: `2026-10-27T23:12:00Z`  
**Target Files**:
- `src/audio/SoundSynthesizer.ts` (Primary focus)
- `src/audio/MusicPlayer.ts` (Subsystem completeness)
- `tests/unit/audio.test.ts` (Test hardening)

---

## 1. Executive Summary & Root Cause Analysis

During the Milestone 1 Gate verification, the adversarial challenger (`teamwork_challenger_m1_2`) revealed four edge-case vulnerabilities in the Web Audio subsystem that triggered runtime `TypeError` and `IndexSizeError` exceptions in headless Chromium and real browser environments:

| Issue # | Component | Root Cause | Runtime Impact |
|---|---|---|---|
| **1** | `SoundSynthesizer` & `MusicPlayer` | `Math.max(0, Math.min(1, NaN))` evaluates to `NaN`. | Web Audio `AudioParam.linearRampToValueAtTime` throws `TypeError: The provided float value is non-finite`. `HTMLMediaElement.volume` throws `TypeError: The provided double value is non-finite`. |
| **2** | `SoundSynthesizer.init()` | `new AudioCtxClass()` unhandled in `try...catch`. | Under restricted browser security policies or headless sandbox device failures, `init()` rejects with an uncaught exception instead of degrading gracefully. |
| **3** | `MusicPlayer.crossfadeTo()` & `fadeOut()` | `durationSec = 0` produces `0 / 0 = NaN` progress. | `outgoing.volume = Math.max(0, initialOutVol * (1.0 - progress))` assigns `NaN`, crashing DOM audio in Chromium. |
| **4** | `MusicPlayer.duck()` | Multipliers outside `[0, 1]` produce values `< 0.0` or `> 1.0`. | `HTMLAudioElement.volume` assigns out-of-range float (e.g. `1.2` or `-0.3`), throwing `IndexSizeError: The volume provided is outside the range [0, 1]`. |

This document defines the exact, production-grade fix strategy for each issue with before/after code specifications and comprehensive test verification.

---

## 2. SoundSynthesizer: Volume Clamping & NaN Defense

### 2.1 Problem Analysis
In JavaScript / IEEE-754 arithmetic:
```javascript
Math.min(1, NaN);  // => NaN
Math.max(0, NaN);  // => NaN
```
When `volume = NaN` is passed to `setMasterVolume` or `setSfxVolume`, `this.masterVolume` becomes `NaN`. Subsequently:
```typescript
this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, t + 0.05);
```
Web Audio API IDL specifies that `linearRampToValueAtTime` accepts an unrestricted `float`, but standard browser engines (Chromium, WebKit, Gecko) mandate finite numbers and throw:
```text
TypeError: Failed to execute 'linearRampToValueAtTime' on 'AudioParam': The provided float value is non-finite.
```

Furthermore:
- Passing `Infinity` yields `Math.min(1, Infinity) = 1` and `Math.max(0, 1) = 1.0` (valid max).
- Passing `-Infinity` yields `Math.min(1, -Infinity) = -Infinity` and `Math.max(0, -Infinity) = 0.0` (valid min).
- Passing non-numeric inputs (e.g., `undefined`, `null`, strings) can also produce `NaN`.

### 2.2 Recommended Solution
Introduce a dedicated private helper `clampVolume(volume: number): number` on `SoundSynthesizer`:

```typescript
private clampVolume(volume: number): number {
  if (typeof volume !== 'number' || Number.isNaN(volume)) {
    return 0;
  }
  return Math.max(0, Math.min(1, volume));
}
```

Behavior matrix of `clampVolume`:
| Input | Output | Verification |
|---|---|---|
| `0.42` | `0.42` | Preserves valid volume |
| `0.0` | `0.0` | Boundary min preserved |
| `1.0` | `1.0` | Boundary max preserved |
| `-5` | `0.0` | Clamped to min |
| `9999` | `1.0` | Clamped to max |
| `Infinity` | `1.0` | Finite clamped to max |
| `-Infinity` | `0.0` | Finite clamped to min |
| `NaN` | `0.0` | Safe fallback to 0.0 |
| `undefined` / `null` | `0.0` | Non-number guarded |

### 2.3 Exact Changes in `src/audio/SoundSynthesizer.ts`

#### A. In `constructor` (Lines 36-40):
**Before:**
```typescript
    if (config) {
      if (config.masterVolume !== undefined) this.masterVolume = Math.max(0, Math.min(1, config.masterVolume));
      if (config.sfxVolume !== undefined) this.sfxVolume = Math.max(0, Math.min(1, config.sfxVolume));
      if (config.muted !== undefined) this._isMuted = config.muted;
    }
```
**After:**
```typescript
    if (config) {
      if (config.masterVolume !== undefined) this.masterVolume = this.clampVolume(config.masterVolume);
      if (config.sfxVolume !== undefined) this.sfxVolume = this.clampVolume(config.sfxVolume);
      if (config.muted !== undefined) this._isMuted = config.muted;
    }
```

#### B. In `setMasterVolume` (Lines 102-109):
**Before:**
```typescript
  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.ctx && this.masterGain && !this._isMuted) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, t + 0.05);
    }
  }
```
**After:**
```typescript
  public setMasterVolume(volume: number): void {
    this.masterVolume = this.clampVolume(volume);
    if (this.ctx && this.masterGain && !this._isMuted) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, t + 0.05);
    }
  }
```

#### C. In `setSfxVolume` (Lines 111-118):
**Before:**
```typescript
  public setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.ctx && this.sfxGain) {
      const t = this.ctx.currentTime;
      this.sfxGain.gain.cancelScheduledValues(t);
      this.sfxGain.gain.linearRampToValueAtTime(this.sfxVolume, t + 0.05);
    }
  }
```
**After:**
```typescript
  public setSfxVolume(volume: number): void {
    this.sfxVolume = this.clampVolume(volume);
    if (this.ctx && this.sfxGain) {
      const t = this.ctx.currentTime;
      this.sfxGain.gain.cancelScheduledValues(t);
      this.sfxGain.gain.linearRampToValueAtTime(this.sfxVolume, t + 0.05);
    }
  }
```

#### D. Helper Method Definition:
Add to `SoundSynthesizer` private methods:
```typescript
  private clampVolume(volume: number): number {
    if (typeof volume !== 'number' || Number.isNaN(volume)) {
      return 0;
    }
    return Math.max(0, Math.min(1, volume));
  }
```

#### E. Portal Hum Duration Defense (Line 503):
In `playPortalHum(durationMs: number = 1200)`:
Ensure duration is a finite, positive number to prevent non-finite ramp times:
```typescript
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
...
```

---

## 3. SoundSynthesizer: AudioContext Constructor Exception Handling

### 3.1 Problem Analysis
In `SoundSynthesizer.ts:69`:
```typescript
this.ctx = new AudioCtxClass();
```
In certain browser security environments (e.g. iframes without audio permissions, strict autoplay policies, missing audio output hardware, or sandboxed test runners), `new AudioContext()` can throw a `NotAllowedError`, `NotFoundError`, or `SecurityError`.

When this happens currently:
1. `init()` rejects with an unhandled exception.
2. The game loop / application startup halts or fails to mount.
3. Telemetry and fallback sound invocation fails.

### 3.2 Recommended Solution
Wrap the `AudioCtxClass` instantiation and initial node creation in a `try...catch` block.
When an exception occurs:
1. Log a diagnostic warning via `console.warn`.
2. Explicitly set `this._isSupported = false`.
3. Set `this.ctx = null`, `this.masterGain = null`, `this.sfxGain = null`.
4. Return cleanly without throwing an unhandled rejection.

Because all 10 SFX generators begin with:
```typescript
this.callCounts.<soundName>++;
const ready = this.getReadyContext();
if (!ready) return;
```
and `getReadyContext()` checks `if (!this._isSupported || !this.ctx || ...) return null;`, the synthesizer safely and completely falls back to headless no-op mode while maintaining full call telemetry for analytics and testing.

### 3.3 Exact Changes in `src/audio/SoundSynthesizer.ts` (Lines 60-90)

**Before:**
```typescript
  public async init(): Promise<void> {
    if (!this._isSupported || typeof window === 'undefined') return;

    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;

      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      const initialMaster = this._isMuted ? 0 : this.masterVolume;
      this.masterGain.gain.setValueAtTime(initialMaster, this.ctx.currentTime);
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);

      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.setupInteractionUnlock();
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Handled via user interaction unlock listeners
      }
    }
  }
```

**After:**
```typescript
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
```

---

## 4. MusicPlayer: Hardening & Edge Case Remediations

To ensure the entire audio subsystem passes the adversarial audit and real browser runners, `MusicPlayer.ts` requires the following three corresponding hardening steps:

### 4.1 Safe Volume Clamping (`setMusicVolume`)
**File**: `src/audio/MusicPlayer.ts:141-147`  
**Before:**
```typescript
  public setMusicVolume(volume: number): void {
    this.targetVolume = Math.max(0, Math.min(1, volume));
    const active = this.getActiveAudio();
    if (active && !this.isMuted) {
      active.volume = this.targetVolume;
    }
  }
```
**After:**
```typescript
  public setMusicVolume(volume: number): void {
    const safeVol = typeof volume === 'number' && !Number.isNaN(volume)
      ? Math.max(0, Math.min(1, volume))
      : 0;
    this.targetVolume = safeVol;
    const active = this.getActiveAudio();
    if (active && !this.isMuted) {
      active.volume = this.targetVolume;
    }
  }
```

### 4.2 Multiplier Clamping (`duck`)
**File**: `src/audio/MusicPlayer.ts:149-162`  
**Before:**
```typescript
  public duck(multiplier: number, durationSec: number): void {
    const active = this.getActiveAudio();
    if (!active || this.isMuted) return;

    const normalVol = this.targetVolume;
    const duckedVol = normalVol * multiplier;
    active.volume = duckedVol;

    setTimeout(() => {
      if (!this.isMuted && active) {
        active.volume = normalVol;
      }
    }, durationSec * 1000);
  }
```
**After:**
```typescript
  public duck(multiplier: number, durationSec: number): void {
    const active = this.getActiveAudio();
    if (!active || this.isMuted) return;

    const normalVol = this.targetVolume;
    const safeMultiplier = typeof multiplier === 'number' && !Number.isNaN(multiplier) ? multiplier : 1.0;
    const duckedVol = Math.max(0, Math.min(1, normalVol * safeMultiplier));
    active.volume = duckedVol;

    const safeDuration = typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0
      ? durationSec
      : 0;

    setTimeout(() => {
      if (!this.isMuted && active) {
        active.volume = normalVol;
      }
    }, safeDuration * 1000);
  }
```

### 4.3 0-Duration Crossfade & Finiteness (`crossfadeTo` & `fadeOut`)
**File**: `src/audio/MusicPlayer.ts:81-111` and `168-195`  
When `durationSec <= 0` or non-finite:
1. Bypass requestAnimationFrame completely.
2. Immediately snap outgoing channel to pause and volume 0.
3. Immediately set incoming channel to target volume.

**In `crossfadeTo`:**
```typescript
    if (
      typeof requestAnimationFrame === 'undefined' ||
      typeof durationSec !== 'number' ||
      !Number.isFinite(durationSec) ||
      durationSec <= 0
    ) {
      outgoing.pause();
      outgoing.currentTime = 0;
      incoming.volume = this.isMuted ? 0 : this.targetVolume;
      return;
    }

    const startTime = performance.now();
    const durationMs = durationSec * 1000;
    const initialOutVol = outgoing.volume;
    const finalInVol = this.isMuted ? 0 : this.targetVolume;

    const step = (timestamp?: number) => {
      const now = typeof timestamp === 'number' ? timestamp : performance.now();
      const elapsed = now - startTime;
      const progress = durationMs > 0 ? Math.min(Math.max(0, elapsed / durationMs), 1.0) : 1.0;

      outgoing.volume = Math.max(0, Math.min(1, initialOutVol * (1.0 - progress)));
      incoming.volume = Math.max(0, Math.min(1, finalInVol * progress));

      if (progress < 1.0 && typeof requestAnimationFrame !== 'undefined') {
        this.crossfadeAnimationId = requestAnimationFrame(step);
      } else {
        outgoing.pause();
        outgoing.currentTime = 0;
        this.crossfadeAnimationId = null;
      }
    };

    this.crossfadeAnimationId = requestAnimationFrame(step);
```

**In `fadeOut`:**
```typescript
  private fadeOut(element: HTMLAudioElement, durationSec: number): void {
    if (
      typeof requestAnimationFrame === 'undefined' ||
      typeof durationSec !== 'number' ||
      !Number.isFinite(durationSec) ||
      durationSec <= 0
    ) {
      element.pause();
      element.currentTime = 0;
      return;
    }

    const startTime = performance.now();
    const durationMs = durationSec * 1000;
    const initialVol = element.volume;

    const step = (timestamp?: number) => {
      const now = typeof timestamp === 'number' ? timestamp : performance.now();
      const elapsed = now - startTime;
      const progress = durationMs > 0 ? Math.min(Math.max(0, elapsed / durationMs), 1.0) : 1.0;

      element.volume = Math.max(0, Math.min(1, initialVol * (1.0 - progress)));

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
```

---

## 5. Unit Test Suite Hardening (`tests/unit/audio.test.ts`)

To ensure regressions are permanently prevented and caught automatically by `npm test`, add explicit assertions to `tests/unit/audio.test.ts`:

### 5.1 Volume Clamping Unit Test
Add tests verifying:
- `synth.setMasterVolume(NaN)` clamps to `0.0`.
- `synth.setMasterVolume(-5)` clamps to `0.0`.
- `synth.setMasterVolume(9999)` clamps to `1.0`.
- `synth.setMasterVolume(Infinity)` clamps to `1.0`.
- `synth.setMasterVolume(-Infinity)` clamps to `0.0`.
- `synth.setSfxVolume(NaN)` clamps to `0.0`.
- `new SoundSynthesizer({ masterVolume: NaN, sfxVolume: NaN })` sets safe volumes.

### 5.2 AudioContext Throwing Constructor Test
Add a test in the `SoundSynthesizer Web Audio Node Graph Simulation` suite:
```typescript
  it('handles throwing AudioContext constructor gracefully without uncaught rejection', async () => {
    vi.stubGlobal('window', {
      AudioContext: class ThrowsContext {
        constructor() {
          throw new Error('NotAllowedError: AudioContext was not allowed to start');
        }
      },
    });

    const throwingSynth = new SoundSynthesizer();
    await expect(throwingSynth.init()).resolves.toBeUndefined();
    expect(throwingSynth.isSupported).toBe(false);
    expect(() => throwingSynth.playSwordSwing()).not.toThrow();
    expect(throwingSynth.callCounts.swordSwing).toBe(1);
  });
```

### 5.3 MusicPlayer Robustness Tests
Add unit tests verifying:
- `music.setMusicVolume(NaN)` sets volume to `0`.
- `music.crossfadeTo('game', 0)` executes synchronously without error and doesn't assign `NaN`.
- `music.duck(2.0, 0.1)` clamps volume to `<= 1.0`.
- `music.duck(-0.5, 0.1)` clamps volume to `>= 0.0`.

---

## 6. Implementation Checklist for Worker

1. [ ] Update `src/audio/SoundSynthesizer.ts`:
   - [ ] Add `clampVolume` private helper.
   - [ ] Update `constructor` to use `this.clampVolume`.
   - [ ] Update `setMasterVolume` to use `this.clampVolume`.
   - [ ] Update `setSfxVolume` to use `this.clampVolume`.
   - [ ] Update `playPortalHum` with duration guard.
   - [ ] Wrap `init()` AudioContext creation in `try...catch` and set `this._isSupported = false` on error.
2. [ ] Update `src/audio/MusicPlayer.ts`:
   - [ ] Update `setMusicVolume` with finite clamping.
   - [ ] Update `duck` with `[0, 1]` clamping for multiplier and duration guard.
   - [ ] Update `crossfadeTo` and `fadeOut` with `durationSec <= 0` guard.
3. [ ] Update `tests/unit/audio.test.ts` with edge-case tests.
4. [ ] Run verification:
   - `npm test`
   - `npx vite-node .agents/teamwork/teamwork_challenger_m1_2/audio_stress_harness.ts`
   - `npx vite-node .agents/teamwork/teamwork_challenger_m1_2/browser_audio_stress.ts`
