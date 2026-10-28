# Milestone 1: Retro Web Audio Synthesizer & Music Player Specification

**Author**: teamwork_explorer_m1_3  
**Status**: Ready for Implementation (Milestone 1)  
**Target Subsystem**: `src/audio/`  
**Dependencies**: Zero runtime external dependencies (Native Web Audio API & HTML5 Audio)  
**Applicability**: Standalone browser client & Headless Vitest / Playwright test environments  

---

## 1. Executive Summary & Problem Analysis

### 1.1 Legacy Forensic Analysis
In the legacy university project (`/home/k9-vortex/Development/1-JavaScript/3-Game Development/`):
1. **Silent Combat**: The only sound effect in the entire game was `Button_Press.mp3` (19.2 KB). Melee sword swings, hits, enemy damage, player death, coin pickups, potion consumption, portal activation, and leveling up were **100% silent**.
2. **Bloated Asset Loading**: Background music relied on two uncompressed WAV files: `game_music.wav` (13.9 MB) and `menu_music.wav` (15.2 MB). Attempting to load and decode ~30 MB of audio at startup via `p5.sound` caused noticeable frame freezes and frequent failures.
3. **Headless Incompatibility**: `p5.sound` threw uncaught exceptions when executed in headless test runners lacking DOM/AudioContext.

### 1.2 Forest RPG V2 Audio Architecture Solution
Forest RPG V2 introduces a high-performance, zero-dependency audio architecture:
- **`SoundSynthesizer.ts`**: Pure procedural audio synthesis using native `AudioContext`, `OscillatorNode`, `BiquadFilterNode`, and `GainNode`. Produces authentic, customizable 16-bit retro arcade SFX at runtime with **0 bytes of static audio download** for SFX.
- **`MusicPlayer.ts`**: Dual-channel streaming HTML5 Audio controller with asynchronous crossfading, looping, and volume ducking for `game_music.wav` and `menu_music.wav`. Prevents RAM bloat by streaming rather than buffering 30MB of raw PCM.
- **Headless & CI Resilience**: Complete mock/no-op fallback mode when running under Node.js / Vitest / headless CI, ensuring 100% unit test execution without crashes.

---

## 2. Subsystem Architecture & Node Topology

### 2.1 Web Audio Node Routing Graph

```
========================================================================================
                                AUDIO NODE ROUTING GRAPH
========================================================================================

    [Procedural SFX Oscillators]  ---\
    [Noise AudioBufferSourceNodes] ---> [sfxGainNode] ------\
    [BiquadFilterNodes (Sweep/EQ)] --/                       |
                                                             v
    [Music Player HTML5 Audio] --------> [musicGainNode] -> [masterGainNode] -> [destination]
                                                             ^
                                                             |
                                           Mute Switch / Volume Ramps
========================================================================================
```

- **`masterGainNode`**: Master volume scalar $[0.0, 1.0]$. Manages master mute without losing individual slider positions.
- **`sfxGainNode`**: SFX volume scalar $[0.0, 1.0]$.
- **`musicGainNode`**: Music volume scalar $[0.0, 1.0]$.
- **Smooth Ramping**: Volume changes use `linearRampToValueAtTime` over 50 ms to avoid audible clicks or speaker pop.

---

## 3. TypeScript Interfaces & Type Contracts

```typescript
// src/audio/types.ts

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
  | 'spellCast';

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
```

---

## 4. Retro SFX Synthesis Formulas & Node Implementations

### Critical Web Audio Pitfall Guards
1. **Exponential Ramp Clamping**: In the Web Audio API, calling `exponentialRampToValueAtTime(0, time)` throws `RangeError: The float target value must be positive and non-zero`. All exponential gain decays must ramp to an epsilon value (e.g. `0.0001`) and then use `setValueAtTime(0, endTime)`.
2. **Garbage Collection & Disconnection**: Every temporary `OscillatorNode` and `AudioBufferSourceNode` must attach an `onended` handler that disconnects the node and its immediate gain envelope to prevent memory leaks during intense combat.

---

### SFX 1: `playSwordSwing()` — Quick Descending Noise Sweep
- **Acoustic Character**: Sharp, swooshing blade cutting through air.
- **Duration**: 80 ms (0.08 s).
- **Formula**:
  - Sound Source: 100 ms White Noise buffer $N(t) \sim \mathcal{U}(-1, 1)$.
  - Filter: Bandpass filter (`type = 'bandpass'`, $Q = 3.0$).
  - Filter Frequency Ramp: Sweeps down exponentially from $2200\text{ Hz}$ to $400\text{ Hz}$ over $80\text{ ms}$:
    $$f_c(t) = 2200 \times \left(\frac{400}{2200}\right)^{t / 0.08}$$
  - Gain Envelope: Attack in 5 ms to 0.7, exponential decay to 0.0001 at 80 ms.
- **TypeScript Code**:
```typescript
public playSwordSwing(): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
  const t = ctx.currentTime;

  const noise = ctx.createBufferSource();
  noise.buffer = this.getSharedNoiseBuffer();

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
  gain.connect(this.sfxGain!);

  noise.start(t);
  noise.stop(t + 0.081);
  noise.onended = () => {
    noise.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}
```

---

### SFX 2: `playEnemyHit()` — Punchy Pitch Drop with Transient Decay
- **Acoustic Character**: Crisply articulated 8-bit/16-bit arcade impact punch.
- **Duration**: 100 ms (0.10 s).
- **Formula**:
  - Layer 1 (Punch Oscillator): Triangle wave diving rapidly from $320\text{ Hz}$ to $55\text{ Hz}$:
    $$f(t) = 320 \times \left(\frac{55}{320}\right)^{t / 0.10}$$
  - Layer 2 (Transient Click): Short 15 ms high-passed noise burst to provide impact crunch.
  - Gain Envelope: Instant attack to 0.9, steep exponential decay to 0.0001 at 100 ms.
- **TypeScript Code**:
```typescript
public playEnemyHit(): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
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
  oscGain.connect(this.sfxGain!);

  // Transient Crunch Layer
  const click = ctx.createBufferSource();
  click.buffer = this.getSharedNoiseBuffer();

  const clickFilter = ctx.createBiquadFilter();
  clickFilter.type = 'highpass';
  clickFilter.frequency.setValueAtTime(1000, t);

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.4, t);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  clickGain.gain.setValueAtTime(0, t + 0.021);

  click.connect(clickFilter);
  clickFilter.connect(clickGain);
  clickGain.connect(this.sfxGain!);

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
```

---

### SFX 3: `playPlayerHurt()` — Low Rumble Descending Saw Wave
- **Acoustic Character**: Gritty, menacing buzz signaling bodily danger.
- **Duration**: 150 ms (0.15 s).
- **Formula**:
  - Waveform: Sawtooth wave (`type = 'sawtooth'`).
  - Frequency Ramp: Starts at $160\text{ Hz}$, descends to $42\text{ Hz}$ over $150\text{ ms}$:
    $$f(t) = 160 \times \left(\frac{42}{160}\right)^{t / 0.15}$$
  - Lowpass Filter: $750\text{ Hz}$ cutoff ($Q = 2.0$) to tame harsh highs and amplify chest rumble.
  - Gain Envelope: Attack in 4 ms to 0.8, sustains slightly to 40 ms, decays exponentially to 0.0001 at 150 ms.
- **TypeScript Code**:
```typescript
public playPlayerHurt(): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
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
  gain.connect(this.sfxGain!);

  osc.start(t);
  osc.stop(t + 0.151);
  osc.onended = () => {
    osc.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}
```

---

### SFX 4: `playEnemySplat()` — Squishy Low-Frequency Burst (Crush Execution)
- **Acoustic Character**: Heavy, visceral squish used when an enemy is smashed into a solid wall or rock.
- **Duration**: 220 ms (0.22 s).
- **Formula**:
  - Layer 1 (Sub Dive): Square wave plunging $140\text{ Hz} \to 28\text{ Hz}$.
  - Layer 2 (Resonant Wet Noise): White noise passed through a resonant lowpass filter ($Q = 5.5$) sweeping from $1100\text{ Hz} \to 90\text{ Hz}$.
  - Gain Envelope: Attack in 4 ms to 0.95, 30 ms wet sustain, decaying to 0.0001 at 220 ms.
- **TypeScript Code**:
```typescript
public playEnemySplat(): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
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
  noise.buffer = this.getSharedNoiseBuffer();

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
  oscGain.connect(this.sfxGain!);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(this.sfxGain!);

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
```

---

### SFX 5: `playCoinPickup()` — Bright Two-Tone Chime (B5 $\to$ E6 Arpeggio)
- **Acoustic Character**: Gleaming, cheerful 2-note pickup chime.
- **Duration**: 140 ms total (Note 1: 60 ms, Note 2: 80 ms).
- **Formula**:
  - Note 1: $B_5 = 987.77\text{ Hz}$ at $t \in [0, 60\text{ ms}]$, sine wave.
  - Note 2: $E_6 = 1318.51\text{ Hz}$ at $t \in [60\text{ ms}, 140\text{ ms}]$, sine wave.
  - Sparkle Layer: Low-amplitude octave overtone ($E_7 = 2637\text{ Hz}$) at gain 0.12.
- **TypeScript Code**:
```typescript
public playCoinPickup(): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(987.77, t);          // B5
  osc.frequency.setValueAtTime(1318.51, t + 0.06);   // E6

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.5, t + 0.005);
  gain.gain.setValueAtTime(0.3, t + 0.055);
  gain.gain.linearRampToValueAtTime(0.65, t + 0.065);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  gain.gain.setValueAtTime(0, t + 0.141);

  osc.connect(gain);
  gain.connect(this.sfxGain!);

  osc.start(t);
  osc.stop(t + 0.141);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
```

---

### SFX 6: `playPotionDrink()` — Ascending Bubble Glissando
- **Acoustic Character**: 4 rapid ascending liquid bubble chirps ("bloop-bloop-bloop-bloop").
- **Duration**: 240 ms (0.24 s).
- **Formula**:
  - Bubble 1: $t + 0.00\text{s} \to 0.05\text{s}$, sine sweep $300\text{ Hz} \to 480\text{ Hz}$.
  - Bubble 2: $t + 0.05\text{s} \to 0.10\text{s}$, sine sweep $450\text{ Hz} \to 720\text{ Hz}$.
  - Bubble 3: $t + 0.10\text{s} \to 0.16\text{s}$, sine sweep $650\text{ Hz} \to 1050\text{ Hz}$.
  - Bubble 4: $t + 0.16\text{s} \to 0.24\text{s}$, sine sweep $900\text{ Hz} \to 1450\text{ Hz}$.
- **TypeScript Code**:
```typescript
public playPotionDrink(): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
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
    gain.connect(this.sfxGain!);

    osc.start(t + b.start);
    osc.stop(t + b.end + 0.001);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}
```

---

### SFX 7: `playLevelUp()` — Victorious 4-Note Ascending Fanfare
- **Acoustic Character**: Triumphant NES/SNES-style brass fanfare with ringing vibrato on final note.
- **Duration**: 600 ms (0.60 s).
- **Formula**:
  - Chord Progression: Major triad arpeggio resolving to octave:
    - Note 1: $C_5 = 523.25\text{ Hz}$, $t \in [0.00, 0.09\text{s}]$
    - Note 2: $E_5 = 659.25\text{ Hz}$, $t \in [0.09, 0.18\text{s}]$
    - Note 3: $G_5 = 783.99\text{ Hz}$, $t \in [0.18, 0.27\text{s}]$
    - Note 4: $C_6 = 1046.50\text{ Hz}$, $t \in [0.27, 0.60\text{s}]$
  - Timbre: Blend of triangle wave (70%) and square wave (30%) for authentic retro warmth.
- **TypeScript Code**:
```typescript
public playLevelUp(): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
  const t = ctx.currentTime;

  const notes = [
    { start: 0.00, end: 0.09, freq: 523.25, gain: 0.5 },  // C5
    { start: 0.09, end: 0.18, freq: 659.25, gain: 0.55 }, // E5
    { start: 0.18, end: 0.27, freq: 783.99, gain: 0.6 },  // G5
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
      lfo.onended = () => { lfo.disconnect(); lfoGain.disconnect(); };
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t + n.start);
    gain.gain.linearRampToValueAtTime(n.gain, t + n.start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.end);
    gain.gain.setValueAtTime(0, t + n.end + 0.001);

    osc.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start(t + n.start);
    osc.stop(t + n.end + 0.001);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}
```

---

### SFX 8: `playPortalHum()` — Gentle Pulsating Ambient Drone
- **Acoustic Character**: Hypnotic, otherworldly beating hum indicating portal proximity.
- **Duration**: 1200 ms (1.20 s) single pulse or continuous loop.
- **Formula**:
  - Dual Detuned Sine Waves: $f_1 = 110\text{ Hz}$ ($A_2$), $f_2 = 112.5\text{ Hz}$ ($A_2 + 2.5\text{ Hz}$).
  - Acoustic Beating Frequency: $|f_1 - f_2| = 2.5\text{ Hz}$.
  - Lowpass Filter Modulation: $Q = 2.5$, frequency sweeping gently between $250\text{ Hz} \leftrightarrow 600\text{ Hz}$.
  - Gain Envelope: Smooth rise over 300 ms, soft peak at 0.35, gentle decay.
- **TypeScript Code**:
```typescript
public playPortalHum(durationMs: number = 1200): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
  const t = ctx.currentTime;
  const durationSec = durationMs / 1000;

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
  gain.connect(this.sfxGain!);

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
```

---

### Additional SFX: `playButtonClick()` & `playSpellCast()`
```typescript
/**
 * Zero-dependency UI click SFX (drop-in replacement for Button_Press.mp3).
 */
public playButtonClick(): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
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
  gain.connect(this.sfxGain!);
  osc.start(t);
  osc.stop(t + 0.026);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}

/**
 * Arcane projectile cast SFX (Key Q AoE or Key E Magic Bolt).
 */
public playSpellCast(): void {
  if (!this.canPlay()) return;
  const ctx = this.ctx!;
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
  gain.connect(this.sfxGain!);
  osc.start(t);
  osc.stop(t + 0.121);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}
```

---

## 5. Safe Browser Audio Lifecycle & Context Management

### 5.1 Autoplay Policy & Interaction Hook
Modern browsers block Web Audio from producing sound until the user interacts with the page:
1. When `SoundSynthesizer` instantiates, `this.ctx.state` is typically `'suspended'`.
2. The synthesizer attaches lightweight one-time listeners to `window` for `pointerdown`, `keydown`, and `touchstart`.
3. Upon any user gesture, `this.ctx.resume()` is called, immediately enabling crystal-clear audio output without user disruption.

```typescript
private setupInteractionUnlock(): void {
  if (typeof window === 'undefined') return;

  const unlock = async () => {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('[Audio] Failed to resume AudioContext:', err);
      }
    }
    // Clean up one-time listeners
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}
```

### 5.2 Reusable Shared Noise Buffer
Allocating new noise buffers for every sword swing or hit introduces unnecessary GC churn. `SoundSynthesizer` lazily creates a single 1-second white noise `AudioBuffer` and reuses it across all noise-based effects:

```typescript
private sharedNoiseBuffer: AudioBuffer | null = null;

private getSharedNoiseBuffer(): AudioBuffer {
  if (!this.sharedNoiseBuffer && this.ctx) {
    const bufferSize = this.ctx.sampleRate; // 1.0 second of noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    this.sharedNoiseBuffer = buffer;
  }
  return this.sharedNoiseBuffer!;
}
```

### 5.3 Headless / Node.js Vitest Fallback Mode
When running inside Node.js during Vitest or unit tests:
- `window` or `window.AudioContext` does not exist.
- Instead of throwing errors or crashing test workers, `SoundSynthesizer` checks:
  ```typescript
  const AudioContextClass = typeof window !== 'undefined'
    ? (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    : undefined;
  ```
- If absent, `this.isSupported` is set to `false`, and all `play*()` methods silently and safely exit immediately (`if (!this.canPlay()) return;`).
- Additionally, telemetry counters (`this.callCounts[soundName]++`) are tracked in test mode to allow unit test assertions without mocking!

---

## 6. Background Music Player (`MusicPlayer.ts`)

### 6.1 HTML5 Audio Dual-Channel Streaming Architecture
Because `menu_music.wav` (15.2 MB) and `game_music.wav` (13.9 MB) are large files, loading them into memory via Web Audio `decodeAudioData` consumes ~60-100 MB of uncompressed 32-bit Float32 PCM RAM.

`MusicPlayer.ts` uses two persistent HTML5 `HTMLAudioElement` instances (`channelA` and `channelB`) for streaming:
1. **Zero RAM decode overhead**: Audio decodes via hardware stream buffers.
2. **Looping**: `audio.loop = true`.
3. **Crossfading**: Smoothly transitions between channels over an adjustable time window (default 1.5 seconds) using `requestAnimationFrame` volume interpolation.

```
========================================================================================
                                MUSIC PLAYER DUAL CHANNELS
========================================================================================
                       crossfadeTo('game', 1.5s)
 Channel A (Menu Music) : [ 1.0 ] ==========\ (fade out) ============> [ 0.0 ] (paused)
 Channel B (Game Music) : [ 0.0 ] ==========/ (fade in) =============> [ 1.0 ] (playing)
========================================================================================
```

### 6.2 Music Player Implementation Blueprint

```typescript
// src/audio/MusicPlayer.ts
import { IMusicPlayer, MusicTrackKey } from './types';

export class MusicPlayer implements IMusicPlayer {
  private channelA: HTMLAudioElement | null = null;
  private channelB: HTMLAudioElement | null = null;
  private activeChannel: 'A' | 'B' = 'A';
  
  private currentTrackKey: MusicTrackKey = 'silence';
  private targetVolume: number = 0.6;
  private isMuted: boolean = false;
  private crossfadeAnimationId: number | null = null;

  private readonly trackUrls: Record<MusicTrackKey, string> = {
    menu: '/assets/audio/music/menu_music.wav',
    game: '/assets/audio/music/game_music.wav',
    silence: '',
  };

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

    if (this.crossfadeAnimationId !== null) {
      cancelAnimationFrame(this.crossfadeAnimationId);
      this.crossfadeAnimationId = null;
    }

    const nextChannelKey = this.activeChannel === 'A' ? 'B' : 'A';
    const outgoing = this.activeChannel === 'A' ? this.channelA : this.channelB;
    const incoming = nextChannelKey === 'A' ? this.channelA : this.channelB;

    this.currentTrackKey = track;
    this.activeChannel = nextChannelKey;

    if (track === 'silence') {
      this.fadeOut(outgoing, durationSec);
      return;
    }

    incoming.src = this.trackUrls[track];
    incoming.volume = 0;

    try {
      await incoming.play();
    } catch {
      // Autoplay restriction: playback will resume on user gesture
    }

    const startTime = performance.now();
    const durationMs = durationSec * 1000;
    const initialOutVol = outgoing.volume;
    const finalInVol = this.isMuted ? 0 : this.targetVolume;

    const step = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1.0);

      outgoing.volume = Math.max(0, initialOutVol * (1.0 - progress));
      incoming.volume = Math.min(finalInVol, finalInVol * progress);

      if (progress < 1.0) {
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
    if (this.channelA) { this.channelA.pause(); this.channelA.currentTime = 0; }
    if (this.channelB) { this.channelB.pause(); this.channelB.currentTime = 0; }
    this.currentTrackKey = 'silence';
  }

  public setMusicVolume(volume: number): void {
    this.targetVolume = Math.max(0, Math.min(1, volume));
    const active = this.getActiveAudio();
    if (active && !this.isMuted) {
      active.volume = this.targetVolume;
    }
  }

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

  private getActiveAudio(): HTMLAudioElement | null {
    return this.activeChannel === 'A' ? this.channelA : this.channelB;
  }

  private fadeOut(element: HTMLAudioElement, durationSec: number): void {
    const startTime = performance.now();
    const durationMs = durationSec * 1000;
    const initialVol = element.volume;

    const step = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1.0);
      element.volume = Math.max(0, initialVol * (1.0 - progress));

      if (progress < 1.0) {
        requestAnimationFrame(step);
      } else {
        element.pause();
        element.currentTime = 0;
      }
    };
    requestAnimationFrame(step);
  }
}
```

---

## 7. EventBus Integration Specification

The audio subsystem connects to the central simulation through the typed `EventBus`. Gameplay entities and systems do **not** call audio APIs directly, maintaining strict decoupling:

```typescript
// src/audio/AudioBridge.ts
import { IEventBus } from '../core/events';
import { ISoundSynthesizer, IMusicPlayer } from './types';

export function registerAudioEvents(
  eventBus: IEventBus,
  synth: ISoundSynthesizer,
  music: IMusicPlayer
): () => void {
  const unsubscribers = [
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
    eventBus.on('game:started', () => music.crossfadeTo('game', 1.5)),
    eventBus.on('ui:menuToggled', ({ menuId, open }) => {
      if (menuId === 'mainMenu' && open) {
        music.crossfadeTo('menu', 1.5);
      } else if (menuId === 'mainMenu' && !open) {
        music.crossfadeTo('game', 1.5);
      }
    }),
    eventBus.on('game:over', ({ victory }) => {
      if (victory) {
        synth.playLevelUp();
      }
      music.crossfadeTo('menu', 2.0);
    }),
  ];

  return () => unsubscribers.forEach((unsub) => unsub());
}
```

---

## 8. Verification & Test Plan

### 8.1 Headless Unit Tests (`tests/unit/audio/SoundSynthesizer.test.ts`)
1. **Mock Fallback Verification**: In pure Node.js Vitest environment without `window.AudioContext`, instantiating `SoundSynthesizer` does not crash, `isSupported` evaluates to `false`, and all `play*` methods complete with zero exceptions.
2. **Volume Clamping**: Tests that `setMasterVolume(-1)` clamps to `0.0`, and `setMasterVolume(2)` clamps to `1.0`.
3. **Mute State Toggle**: Tests `toggleMute()` toggles state predictably between `true` and `false`.
4. **Mock Tracking**: In test mode, `synth.playCoinPickup()` increments internal call telemetry for easy test assertions.

### 8.2 Browser / Integration Tests (`tests/integration/audio/AudioSubsystem.test.ts`)
1. **Web Audio Graph Construction**: When run under simulated or browser Web Audio, asserts that `masterGainNode`, `sfxGainNode`, and `musicGainNode` are created and connected to destination.
2. **Exponential Ramp Safety**: Verifies that no exponential ramp call passes `0` as the target value.
3. **Crossfade Execution**: Verifies that `MusicPlayer.crossfadeTo('game')` transitions channels and updates `currentTrack` property.

---

## 9. Implementation Checklist for Worker Agent (Milestone 1)

- [ ] Create `src/audio/types.ts` with all shared audio interfaces and configs.
- [ ] Create `src/audio/SoundSynthesizer.ts` with the complete 8 retro sound formulas and headless mock fallback.
- [ ] Create `src/audio/MusicPlayer.ts` with the dual-channel HTML5 streaming and crossfading.
- [ ] Create `src/audio/AudioBridge.ts` for GameEvents subscription.
- [ ] Create `src/audio/index.ts` exporting all public audio modules.
- [ ] Write `tests/unit/audio/SoundSynthesizer.test.ts` validating safe operation and volume mechanics.
