# MusicPlayer & Audio Robustness Fix Strategy

**Author**: `teamwork_explorer_m1_iter2_2`  
**Date**: 2026-10-27  
**Target Files**:
- Primary: `src/audio/MusicPlayer.ts`
- Interface: `src/audio/types.ts`
- Secondary context: `src/audio/SoundSynthesizer.ts`
- Verification Suite: `tests/unit/audio.test.ts`

---

## Executive Summary

During adversarial stress testing by `teamwork_challenger_m1_2`, the audio subsystem revealed three critical input validation vulnerabilities that cause unhandled runtime exceptions (`TypeError: The provided double value is non-finite` and `IndexSizeError: The volume provided is outside the range [0, 1]`) in Chromium and WebKit browsers:
1. `crossfadeTo(track, 0)` produces `0 / 0 = NaN` progress on frame 0, assigning `NaN` to `HTMLMediaElement.volume`.
2. `duck(multiplier, durationSec)` does not clamp `multiplier * normalVol`, allowing volumes exceeding `1.0` or below `0.0`.
3. `setMusicVolume(NaN)` assigns `NaN` because `Math.max(0, Math.min(1, NaN))` evaluates to `NaN`.

This document specifies a bulletproof, zero-regression remediation plan for the Worker agent to implement.

---

## 1. Problem Analysis & Code Invariants

### 1.1 `crossfadeTo(track, durationSec)` & `fadeOut(element, durationSec)`
- **Current Vulnerability** (`MusicPlayer.ts:95-98` and `MusicPlayer.ts:182-183`):
  ```typescript
  const elapsed = now - startTime;
  const progress = Math.min(elapsed / durationMs, 1.0);
  outgoing.volume = Math.max(0, initialOutVol * (1.0 - progress));
  ```
  When `durationSec = 0`, `durationMs = 0`. At frame 0, `elapsed = 0`, giving `0 / 0 = NaN`.
  `outgoing.volume` is assigned `NaN`, which immediately throws `TypeError` in Chromium.
  Notice that `fadeOut()` (called when `track === 'silence'`) suffers from the identical flaw.
  Furthermore, passing non-finite or negative durations (`NaN`, `Infinity`, `-1`) leads to broken animation loops.

- **Invariant Requirements**:
  1. Any duration where `durationSec <= 0 || !Number.isFinite(durationSec)` MUST bypass animation and trigger an **immediate synchronous cut**.
  2. For `track === 'silence'`, `outgoing` must be paused, rewound to 0, and volume zeroed synchronously without scheduling `requestAnimationFrame`.
  3. For tracks other than silence, `outgoing` must be stopped immediately, and `incoming` must be set to `this.isMuted ? 0 : this.targetVolume` and started without division or animation steps.
  4. Even within RAF `step`, calculations must be guarded with `durationMs > 0 ? ... : 1.0` and clamped with `Number.isFinite`.

---

### 1.2 `duck(multiplier, durationSec)`
- **Current Vulnerability** (`MusicPlayer.ts:153-156`):
  ```typescript
  const normalVol = this.targetVolume;
  const duckedVol = normalVol * multiplier;
  active.volume = duckedVol;
  ```
  When `normalVol = 0.6` and `multiplier = 2.0`, `duckedVol = 1.2` (exceeds 1.0).
  When `multiplier = -0.5`, `duckedVol = -0.3` (less than 0.0).
  In real browsers, `HTMLMediaElement.volume` throws `IndexSizeError` whenever volume is not in `[0.0, 1.0]`.
  When `multiplier = NaN`, setting `active.volume = NaN` throws `TypeError`.
  In addition, calling `duck()` rapidly sets multiple overlapping `setTimeout` callbacks that prematurely restore `active.volume` before the latest duck duration completes.

- **Invariant Requirements**:
  1. `multiplier` must be guarded with `Number.isFinite`. If non-finite (`NaN`, `Infinity`), fallback safely to `normalVol` (no-op).
  2. `duckedVol` must strictly be clamped: `Math.max(0, Math.min(1, rawDucked))`.
  3. Concurrent duck calls must cancel previous pending duck timeouts (`clearTimeout(this.duckTimeoutId)`).
  4. `stop()` and `crossfadeTo()` should cancel active duck timeouts to prevent zombie volume restores.

---

### 1.3 `setMusicVolume(volume)` & `setVolume(volume)`
- **Current Vulnerability** (`MusicPlayer.ts:141-147`):
  ```typescript
  public setMusicVolume(volume: number): void {
    this.targetVolume = Math.max(0, Math.min(1, volume));
    const active = this.getActiveAudio();
    if (active && !this.isMuted) {
      active.volume = this.targetVolume;
    }
  }
  ```
  `Math.min(1, NaN)` is `NaN`, and `Math.max(0, NaN)` is `NaN`.
  Passing `NaN` sets `this.targetVolume = NaN` and `active.volume = NaN`, throwing `TypeError`.
  Furthermore, `IMusicPlayer` and external callers frequently reference `setVolume(volume)` as an alias.

- **Invariant Requirements**:
  1. `volume` must be guarded with `Number.isFinite`.
  2. If `!Number.isFinite(volume)`:
     - `NaN` clamps to `0.0`
     - `+Infinity` clamps to `1.0`
     - `-Infinity` clamps to `0.0`
     (Elegantly implemented via: `this.targetVolume = volume > 0 ? 1 : 0;`).
  3. If finite, `Math.max(0, Math.min(1, volume))` clamps to `[0, 1]`.
  4. Implement `public setVolume(volume: number): void { this.setMusicVolume(volume); }` as an alias.

---

## 2. Concrete Implementation Blueprint

### 2.1 Modifications to `src/audio/MusicPlayer.ts`

```typescript
// 1. Add duck timeout tracking property:
private duckTimeoutId: ReturnType<typeof setTimeout> | null = null;

// 2. Add setVolume alias and harden setMusicVolume:
public setMusicVolume(volume: number): void {
  if (!Number.isFinite(volume)) {
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

// 3. Harden crossfadeTo:
public async crossfadeTo(track: MusicTrackKey, durationSec: number = 1.5): Promise<void> {
  if (typeof window === 'undefined' || !this.channelA || !this.channelB) {
    this.currentTrackKey = track;
    return;
  }

  // Cancel any in-flight crossfade animation
  if (this.crossfadeAnimationId !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(this.crossfadeAnimationId);
    this.crossfadeAnimationId = null;
  }

  // Cancel any active duck timer when switching tracks
  if (this.duckTimeoutId !== null) {
    clearTimeout(this.duckTimeoutId);
    this.duckTimeoutId = null;
  }

  const nextChannelKey = this.activeChannel === 'A' ? 'B' : 'A';
  const outgoing = this.activeChannel === 'A' ? this.channelA : this.channelB;
  const incoming = nextChannelKey === 'A' ? this.channelA : this.channelB;

  this.currentTrackKey = track;
  this.activeChannel = nextChannelKey;

  const isInstant = durationSec <= 0 || !Number.isFinite(durationSec);

  if (track === 'silence') {
    if (isInstant) {
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

  // Instant cut transition when duration <= 0 or non-finite or no rAF available
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

// 4. Harden fadeOut:
private fadeOut(element: HTMLAudioElement, durationSec: number): void {
  if (durationSec <= 0 || !Number.isFinite(durationSec) || typeof requestAnimationFrame === 'undefined') {
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

// 5. Harden duck:
public duck(multiplier: number, durationSec: number): void {
  const active = this.getActiveAudio();
  if (!active || this.isMuted) return;

  if (this.duckTimeoutId !== null) {
    clearTimeout(this.duckTimeoutId);
    this.duckTimeoutId = null;
  }

  const normalVol = this.targetVolume;
  const rawDucked = Number.isFinite(multiplier) ? normalVol * multiplier : normalVol;
  const duckedVol = Math.max(0, Math.min(1, rawDucked));
  active.volume = duckedVol;

  const validDurationMs = Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : 0;

  this.duckTimeoutId = setTimeout(() => {
    if (!this.isMuted && active) {
      active.volume = this.targetVolume;
    }
    this.duckTimeoutId = null;
  }, validDurationMs);
}

// 6. In stop(), clear any pending duck timeout:
public stop(): void {
  if (this.duckTimeoutId !== null) {
    clearTimeout(this.duckTimeoutId);
    this.duckTimeoutId = null;
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
```

---

### 2.2 Secondary Recommendation for `src/audio/SoundSynthesizer.ts`
To resolve all challenger findings across the audio subsystem:
1. Wrap `new AudioCtxClass()` inside `init()` in `try...catch`:
   ```typescript
   try {
     this.ctx = new AudioCtxClass();
   } catch (err) {
     console.warn('[SoundSynthesizer] AudioContext construction failed:', err);
     this._isSupported = false;
     return;
   }
   ```
2. In `setMasterVolume` and `setSfxVolume`:
   ```typescript
   public setMasterVolume(volume: number): void {
     this.masterVolume = !Number.isFinite(volume) ? (volume > 0 ? 1 : 0) : Math.max(0, Math.min(1, volume));
     if (this.ctx && this.masterGain && !this._isMuted) {
       const t = this.ctx.currentTime;
       this.masterGain.gain.cancelScheduledValues(t);
       this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, t + 0.05);
     }
   }

   public setSfxVolume(volume: number): void {
     this.sfxVolume = !Number.isFinite(volume) ? (volume > 0 ? 1 : 0) : Math.max(0, Math.min(1, volume));
     if (this.ctx && this.sfxGain) {
       const t = this.ctx.currentTime;
       this.sfxGain.gain.cancelScheduledValues(t);
       this.sfxGain.gain.linearRampToValueAtTime(this.sfxVolume, t + 0.05);
     }
   }
   ```

---

## 3. Unit Test Hardening Strategy

Update `tests/unit/audio.test.ts`:
1. In `MockAudioElement`, enforce strict browser DOM property setter behavior:
   ```typescript
   class MockAudioElement {
     src = '';
     private _volume = 1;
     loop = false;
     paused = true;
     currentTime = 0;
     preload = '';

     get volume(): number {
       return this._volume;
     }

     set volume(val: number) {
       if (typeof val !== 'number' || !Number.isFinite(val)) {
         throw new TypeError("Failed to set 'volume': The provided double value is non-finite.");
       }
       if (val < 0 || val > 1) {
         throw new RangeError("Failed to set 'volume': The volume provided is outside the range [0, 1].");
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
   ```
2. Add explicit unit tests verifying:
   - `music.crossfadeTo('game', 0)` executes without throwing and sets volume correctly.
   - `music.crossfadeTo('silence', 0)` pauses and zeroes volume cleanly.
   - `music.duck(2.0, 0.1)` clamps volume to 1.0 (no RangeError).
   - `music.duck(-0.5, 0.1)` clamps volume to 0.0 (no RangeError).
   - `music.duck(NaN, 0.1)` maintains normal volume (no TypeError).
   - `music.setMusicVolume(NaN)` clamps to 0.0 without throwing.
   - `music.setMusicVolume(Infinity)` clamps to 1.0 without throwing.
   - `music.setVolume(0.4)` works as alias.

---

## 4. Verification Plan

1. **Vitest Unit Tests**:
   ```bash
   npx vitest run tests/unit/audio.test.ts
   ```
2. **Empirical Stress Harness**:
   ```bash
   npx vite-node .agents/teamwork/teamwork_challenger_m1_2/audio_stress_harness.ts
   ```
3. **Chromium Real Browser Harness**:
   ```bash
   npx vite-node .agents/teamwork/teamwork_challenger_m1_2/browser_audio_stress.ts
   ```
4. **Full Workspace Typecheck**:
   ```bash
   npm run typecheck
   ```
