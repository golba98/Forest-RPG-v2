/**
 * Deep Adversarial Edge Case & Malformed Input Test Suite
 * Stress-tests audio subsystem against malformed types, negative numbers, rapid concurrency,
 * and boundary conditions.
 */

import { SoundSynthesizer, MusicPlayer } from '../../../src/audio';
import { createAuditedMockWebAudio, createAuditedMockDOMAudio } from '../teamwork_challenger_m1_2/audio_stress_harness';

async function runAdversarialEdgeCases() {
  console.log('=== RUNNING DEEP ADVERSARIAL AUDIO CHALLENGE ===\n');
  const failures: string[] = [];

  // 1. Malformed and weird inputs to SoundSynthesizer volume setters
  const { stats: synthStats, MockAudioContext } = createAuditedMockWebAudio();
  const origWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = {
    AudioContext: MockAudioContext,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const synth = new SoundSynthesizer({ masterVolume: 0.5, sfxVolume: 0.5 });
  await synth.init();

  const malformedInputs = [
    null,
    undefined,
    '',
    '0.8',
    'invalid',
    {},
    [],
    [1],
    true,
    false,
    NaN,
    Infinity,
    -Infinity,
    -1e10,
    1e10,
    -0,
    0,
  ];

  for (const input of malformedInputs) {
    try {
      synth.setMasterVolume(input as unknown as number);
      synth.setSfxVolume(input as unknown as number);
      const m = (synth as unknown as { masterVolume: number }).masterVolume;
      const s = (synth as unknown as { sfxVolume: number }).sfxVolume;

      if (!Number.isFinite(m) || m < 0 || m > 1) {
        failures.push(`SoundSynthesizer.setMasterVolume(${String(input)}) resulted in invalid volume: ${m}`);
      }
      if (!Number.isFinite(s) || s < 0 || s > 1) {
        failures.push(`SoundSynthesizer.setSfxVolume(${String(input)}) resulted in invalid volume: ${s}`);
      }
    } catch (e) {
      failures.push(`SoundSynthesizer threw on input ${String(input)}: ${(e as Error).message}`);
    }
  }

  // 2. Portal hum with extreme duration values
  const portalHumDurations = [-1000, 0, NaN, Infinity, -Infinity, null, undefined, '500', 10000];
  for (const d of portalHumDurations) {
    try {
      synth.playPortalHum(d as unknown as number);
    } catch (e) {
      failures.push(`SoundSynthesizer.playPortalHum(${String(d)}) threw: ${(e as Error).message}`);
    }
  }

  // 3. MusicPlayer with malformed inputs
  const { MockAudioElement, mockRaf, mockCancelRaf, invalidVolumeAssignments } = createAuditedMockDOMAudio();
  (globalThis as unknown as { Audio: unknown }).Audio = MockAudioElement;
  (globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = mockRaf;
  (globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = mockCancelRaf;

  const music = new MusicPlayer();
  await music.init();

  for (const input of malformedInputs) {
    try {
      music.setMusicVolume(input as unknown as number);
      music.setVolume(input as unknown as number);
      const vol = (music as unknown as { targetVolume: number }).targetVolume;
      if (!Number.isFinite(vol) || vol < 0 || vol > 1) {
        failures.push(`MusicPlayer.setMusicVolume(${String(input)}) resulted in invalid volume: ${vol}`);
      }
    } catch (e) {
      failures.push(`MusicPlayer threw on input ${String(input)}: ${(e as Error).message}`);
    }
  }

  // 4. Ducking with extreme inputs and durations
  for (const mult of malformedInputs) {
    for (const dur of [-1, 0, 0.1, NaN, Infinity, null, undefined]) {
      try {
        music.duck(mult as unknown as number, dur as unknown as number);
      } catch (e) {
        failures.push(`MusicPlayer.duck(${String(mult)}, ${String(dur)}) threw: ${(e as Error).message}`);
      }
    }
  }

  // 5. Crossfade with malformed tracks and durations
  for (const dur of [-1, 0, 0.5, NaN, Infinity, -Infinity, null, undefined]) {
    try {
      await music.crossfadeTo('game', dur as unknown as number);
      await music.crossfadeTo('silence', dur as unknown as number);
      await music.crossfadeTo('menu', dur as unknown as number);
    } catch (e) {
      failures.push(`MusicPlayer.crossfadeTo duration ${String(dur)} threw: ${(e as Error).message}`);
    }
  }

  // Restore environment
  (globalThis as unknown as { window?: unknown }).window = origWindow;
  delete (globalThis as unknown as { Audio?: unknown }).Audio;
  delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  delete (globalThis as unknown as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;

  console.log(`AudioParam invalid values logged: ${synthStats.invalidParamValues.length}`);
  console.log(`HTMLAudioElement invalid volume assignments: ${invalidVolumeAssignments.length}`);
  console.log(`Failures recorded: ${failures.length}`);

  if (failures.length > 0) {
    console.error('FAILURES:', failures);
    process.exit(1);
  } else {
    console.log('ALL DEEP ADVERSARIAL TESTS PASSED!');
    process.exit(0);
  }
}

runAdversarialEdgeCases();
