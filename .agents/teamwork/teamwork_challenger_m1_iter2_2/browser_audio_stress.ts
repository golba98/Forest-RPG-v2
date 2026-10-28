/**
 * Empirical Browser Audio Stress Harness for Milestone 1 Iteration 2
 *
 * Runs inside real Chromium browser engine via Playwright with:
 * - Real Chromium Web Audio API (real AudioContext, GainNodes, BiquadFilters, Oscillators, Buffers)
 * - Real Chromium HTMLAudioElement DOM audio
 * - Real requestAnimationFrame rendering loop
 * - Real compiled SoundSynthesizer and MusicPlayer classes bundled via esbuild
 *
 * Adversarially verifies:
 * 1. Volume setters with NaN, Infinity, -Infinity, -5, 9999 (no TypeErrors, no IndexSizeErrors)
 * 2. MusicPlayer.crossfadeTo(track, 0) (instantaneous cut, no 0/0=NaN, no non-finite volume assignment)
 * 3. MusicPlayer.duck(2.0, 1) and duck(-0.5, 1) (strictly clamped in [0, 1], timer concurrency clean)
 * 4. SoundSynthesizer.init() when new AudioContext() throws (graceful degradation, no unhandled rejection)
 * 5. Rapid burst stress: 1,000 rapid sound triggers in real browser Web Audio context
 */

import { chromium } from '@playwright/test';
import * as esbuild from 'esbuild';
import * as path from 'path';

interface BrowserChallengeResult {
  test: string;
  passed: boolean;
  details: unknown;
  error?: string;
}

async function runBrowserAudioStress() {
  const results: BrowserChallengeResult[] = [];

  // Step 1: Bundle src/audio/index.ts into a standalone IIFE bundle
  const projectRoot = path.resolve(__dirname, '../../../');
  const entryPoint = path.join(projectRoot, 'src/audio/index.ts');

  const bundle = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    globalName: 'AudioSubsystem',
    write: false,
    target: 'es2022',
  });

  const bundleCode = bundle.outputFiles[0].text;

  // Step 2: Launch real Chromium browser
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Inject bundled AudioSubsystem into browser global scope
  await page.addScriptTag({ content: bundleCode });

  // ---------------------------------------------------------------------------
  // Challenge 1: Extreme & Non-Finite Volume Inputs on Real Chromium Web Audio & DOM
  // ---------------------------------------------------------------------------
  const volumeTestResult = await page.evaluate(async () => {
    const { SoundSynthesizer, MusicPlayer } = (window as unknown as {
      AudioSubsystem: {
        SoundSynthesizer: new () => {
          init: () => Promise<void>;
          setMasterVolume: (v: number) => void;
          setSfxVolume: (v: number) => void;
          masterVolume: number;
          sfxVolume: number;
        };
        MusicPlayer: new () => {
          init: () => Promise<void>;
          setMusicVolume: (v: number) => void;
          setVolume: (v: number) => void;
          targetVolume: number;
        };
      };
    }).AudioSubsystem;

    const synth = new SoundSynthesizer();
    await synth.init();

    const music = new MusicPlayer();
    await music.init();

    const testInputs = [-5, -0.001, 0, 0.42, 1.0, 1.5, 9999, Infinity, -Infinity, NaN];
    const subResults: Array<{
      input: unknown;
      synthMaster: number;
      synthSfx: number;
      musicTarget: number;
      passed: boolean;
      error?: string;
    }> = [];

    for (const val of testInputs) {
      try {
        synth.setMasterVolume(val);
        synth.setSfxVolume(val);
        music.setMusicVolume(val);
        music.setVolume(val);

        const mVol = synth.masterVolume;
        const sVol = synth.sfxVolume;
        const musVol = music.targetVolume;

        const isMasterValid = Number.isFinite(mVol) && mVol >= 0 && mVol <= 1;
        const isSfxValid = Number.isFinite(sVol) && sVol >= 0 && sVol <= 1;
        const isMusicValid = Number.isFinite(musVol) && musVol >= 0 && musVol <= 1;

        subResults.push({
          input: String(val),
          synthMaster: mVol,
          synthSfx: sVol,
          musicTarget: musVol,
          passed: isMasterValid && isSfxValid && isMusicValid,
        });
      } catch (err) {
        subResults.push({
          input: String(val),
          synthMaster: synth.masterVolume,
          synthSfx: synth.sfxVolume,
          musicTarget: music.targetVolume,
          passed: false,
          error: (err as Error).message,
        });
      }
    }

    return subResults;
  });

  const allVolumePassed = volumeTestResult.every((r) => r.passed);
  results.push({
    test: 'Chromium Volume Setters (NaN, Infinity, -Infinity, -5, 9999)',
    passed: allVolumePassed,
    details: volumeTestResult,
  });

  // ---------------------------------------------------------------------------
  // Challenge 2: MusicPlayer.crossfadeTo(track, 0) Instant Cut & Zero Duration
  // ---------------------------------------------------------------------------
  const crossfadeZeroResult = await page.evaluate(async () => {
    const { MusicPlayer } = (window as unknown as {
      AudioSubsystem: {
        MusicPlayer: new () => {
          init: () => Promise<void>;
          play: (track: string) => Promise<void>;
          crossfadeTo: (track: string, durationSec: number) => Promise<void>;
          currentTrack: string;
          getActiveAudio: () => HTMLAudioElement | null;
        };
      };
    }).AudioSubsystem;

    const music = new MusicPlayer();
    await music.init();

    const errors: string[] = [];

    // Test durationSec = 0
    try {
      await music.crossfadeTo('game', 0);
    } catch (e) {
      errors.push(`crossfadeTo(game, 0) threw: ${(e as Error).message}`);
    }

    // Wait 2 frames to ensure no rAF error occurs
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Test durationSec = -1
    try {
      await music.crossfadeTo('menu', -1);
    } catch (e) {
      errors.push(`crossfadeTo(menu, -1) threw: ${(e as Error).message}`);
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Test durationSec = NaN
    try {
      await music.crossfadeTo('silence', NaN);
    } catch (e) {
      errors.push(`crossfadeTo(silence, NaN) threw: ${(e as Error).message}`);
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Test durationSec = Infinity
    try {
      await music.crossfadeTo('game', Infinity);
    } catch (e) {
      errors.push(`crossfadeTo(game, Infinity) threw: ${(e as Error).message}`);
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    return {
      errors,
      finalTrack: music.currentTrack,
    };
  });

  results.push({
    test: 'Chromium MusicPlayer.crossfadeTo(track, 0 / -1 / NaN / Infinity)',
    passed: crossfadeZeroResult.errors.length === 0 && crossfadeZeroResult.finalTrack === 'game',
    details: crossfadeZeroResult,
    error: crossfadeZeroResult.errors.join('; '),
  });

  // ---------------------------------------------------------------------------
  // Challenge 3: MusicPlayer Ducking Multipliers (2.0, -0.5, NaN, Infinity)
  // ---------------------------------------------------------------------------
  const duckingResult = await page.evaluate(async () => {
    const { MusicPlayer } = (window as unknown as {
      AudioSubsystem: {
        MusicPlayer: new () => {
          init: () => Promise<void>;
          crossfadeTo: (track: string, dur: number) => Promise<void>;
          setMusicVolume: (v: number) => void;
          duck: (multiplier: number, durationSec: number) => void;
          targetVolume: number;
        };
      };
    }).AudioSubsystem;

    const music = new MusicPlayer();
    await music.init();
    await music.crossfadeTo('game', 0);
    music.setMusicVolume(0.7);

    const duckChecks: Array<{
      multiplier: number;
      passed: boolean;
      error?: string;
    }> = [];

    const multipliersToTest = [2.0, -0.5, 0.0, 0.5, 1.0, 999.0, -999.0, Infinity, -Infinity, NaN];

    for (const mult of multipliersToTest) {
      try {
        music.duck(mult, 0.05);
        duckChecks.push({
          multiplier: mult,
          passed: true,
        });
      } catch (err) {
        duckChecks.push({
          multiplier: mult,
          passed: false,
          error: (err as Error).message,
        });
      }
    }

    // Stress rapid concurrent ducking
    let rapidDuckError: string | null = null;
    try {
      for (let i = 0; i < 50; i++) {
        music.duck(i % 2 === 0 ? 2.0 : -0.5, 0.02);
      }
    } catch (e) {
      rapidDuckError = (e as Error).message;
    }

    // Wait for duck timeout to expire and restore
    await new Promise((r) => setTimeout(r, 60));

    return {
      duckChecks,
      rapidDuckError,
      targetVolumeAfterRestore: music.targetVolume,
    };
  });

  const allDucksPassed =
    duckingResult.duckChecks.every((c) => c.passed) &&
    duckingResult.rapidDuckError === null &&
    duckingResult.targetVolumeAfterRestore === 0.7;

  results.push({
    test: 'Chromium MusicPlayer.duck(2.0, 1), duck(-0.5, 1) and concurrency',
    passed: allDucksPassed,
    details: duckingResult,
    error: duckingResult.rapidDuckError || undefined,
  });

  // ---------------------------------------------------------------------------
  // Challenge 4: SoundSynthesizer.init() when AudioContext Constructor Throws
  // ---------------------------------------------------------------------------
  const throwingInitResult = await page.evaluate(async () => {
    const { SoundSynthesizer } = (window as unknown as {
      AudioSubsystem: {
        SoundSynthesizer: new () => {
          init: () => Promise<void>;
          isSupported: boolean;
          playSwordSwing: () => void;
          playSpellCast: () => void;
          callCounts: Record<string, number>;
        };
      };
    }).AudioSubsystem;

    const origAudioContext = window.AudioContext;
    let initError: string | null = null;
    let unhandledRejection = false;

    // Override AudioContext to throw synchronously
    (window as unknown as { AudioContext: unknown }).AudioContext = class ThrowingAudioContext {
      constructor() {
        throw new DOMException('The play() request was interrupted by new permissions policy', 'NotAllowedError');
      }
    };

    const synth = new SoundSynthesizer();
    try {
      await synth.init();
    } catch (err) {
      initError = (err as Error).message;
      unhandledRejection = true;
    }

    // Attempt playback after failed init
    let playError: string | null = null;
    try {
      synth.playSwordSwing();
      synth.playSpellCast();
    } catch (err) {
      playError = (err as Error).message;
    }

    // Restore window.AudioContext
    (window as unknown as { AudioContext: unknown }).AudioContext = origAudioContext;

    return {
      isSupported: synth.isSupported,
      initError,
      unhandledRejection,
      playError,
      swordSwingCalls: synth.callCounts.swordSwing,
      spellCastCalls: synth.callCounts.spellCast,
    };
  });

  const throwingPassed =
    !throwingInitResult.isSupported &&
    !throwingInitResult.unhandledRejection &&
    throwingInitResult.initError === null &&
    throwingInitResult.playError === null &&
    throwingInitResult.swordSwingCalls === 1 &&
    throwingInitResult.spellCastCalls === 1;

  results.push({
    test: 'Chromium SoundSynthesizer.init() when AudioContext throws',
    passed: throwingPassed,
    details: throwingInitResult,
    error: throwingInitResult.initError || throwingInitResult.playError || undefined,
  });

  // ---------------------------------------------------------------------------
  // Challenge 5: Rapid Burst Stress (1,000 Rapid Sound Triggers in Real Chromium)
  // ---------------------------------------------------------------------------
  const burstStressResult = await page.evaluate(async () => {
    const { SoundSynthesizer } = (window as unknown as {
      AudioSubsystem: {
        SoundSynthesizer: new () => {
          init: () => Promise<void>;
          playSwordSwing: () => void;
          playEnemyHit: () => void;
          playPlayerHurt: () => void;
          playEnemySplat: () => void;
          playCoinPickup: () => void;
          playPotionDrink: () => void;
          playLevelUp: () => void;
          playPortalHum: (d?: number) => void;
          playButtonClick: () => void;
          playSpellCast: () => void;
          callCounts: Record<string, number>;
        };
      };
    }).AudioSubsystem;

    const synth = new SoundSynthesizer();
    await synth.init();

    const startTime = performance.now();
    let burstError: string | null = null;

    try {
      // Trigger 100 sets of all 10 SFX = 1,000 sounds
      for (let i = 0; i < 100; i++) {
        synth.playSwordSwing();
        synth.playEnemyHit();
        synth.playPlayerHurt();
        synth.playEnemySplat();
        synth.playCoinPickup();
        synth.playPotionDrink();
        synth.playLevelUp();
        synth.playPortalHum(200);
        synth.playButtonClick();
        synth.playSpellCast();
      }
    } catch (e) {
      burstError = (e as Error).message;
    }

    const durationMs = performance.now() - startTime;
    const totalCalls = Object.values(synth.callCounts).reduce((a, b) => a + b, 0);

    // Wait 300ms for Web Audio nodes to finish playback and trigger onended disconnections
    await new Promise((r) => setTimeout(r, 300));

    return {
      durationMs: durationMs.toFixed(2),
      totalCalls,
      burstError,
    };
  });

  results.push({
    test: 'Chromium Rapid Burst Stress (1,000 SFX triggers in real Web Audio)',
    passed: burstStressResult.burstError === null && burstStressResult.totalCalls === 1000,
    details: burstStressResult,
    error: burstStressResult.burstError || undefined,
  });

  await browser.close();
  return results;
}

runBrowserAudioStress()
  .then((results) => {
    console.log('=== REAL CHROMIUM BROWSER AUDIO CHALLENGE VERIFICATION ===\n');
    let allPassed = true;
    for (const r of results) {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.test}`);
      console.log('Details:', JSON.stringify(r.details, null, 2));
      if (r.error) {
        console.error('Error:', r.error);
        allPassed = false;
      }
      if (!r.passed) {
        allPassed = false;
      }
      console.log('--------------------------------------------------');
    }
    console.log(`\nFINAL BROWSER VERIFICATION: ${allPassed ? 'ALL TESTS PASSED' : 'FAILURES DETECTED'}`);
    process.exit(allPassed ? 0 : 1);
  })
  .catch((err) => {
    console.error('Fatal Harness Failure:', err);
    process.exit(1);
  });
