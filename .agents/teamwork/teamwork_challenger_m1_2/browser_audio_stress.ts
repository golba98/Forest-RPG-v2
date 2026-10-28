/**
 * Real Browser Audio Stress Harness via Playwright Chromium
 *
 * Runs inside actual Chromium browser engine with real Web Audio Context and real HTMLAudioElement.
 */

import { chromium } from '@playwright/test';

interface BrowserTestResult {
  test: string;
  passed: boolean;
  details: unknown;
  error?: string;
}

async function runBrowserTests() {
  const results: BrowserTestResult[] = [];
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });

  const page = await browser.newPage();

  // Test 1: Real Chromium Rapid Firing Web Audio
  const rapidFiringResult = await page.evaluate(async () => {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const masterGain = ctx.createGain();
    const sfxGain = ctx.createGain();
    sfxGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Create shared noise buffer
    const bufferSize = ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    let thrown = null;
    let completedSounds = 0;
    const startTime = performance.now();

    try {
      for (let i = 0; i < 100; i++) {
        // Sword swing simulation
        const t = ctx.currentTime;
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
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

        // Coin pickup simulation
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, t);
        osc.frequency.setValueAtTime(1318.51, t + 0.06);

        const cGain = ctx.createGain();
        cGain.gain.setValueAtTime(0.0001, t);
        cGain.gain.linearRampToValueAtTime(0.5, t + 0.005);
        cGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        cGain.gain.setValueAtTime(0, t + 0.141);

        osc.connect(cGain);
        cGain.connect(sfxGain);
        osc.start(t);
        osc.stop(t + 0.141);
        osc.onended = () => {
          osc.disconnect();
          cGain.disconnect();
        };

        completedSounds += 2;
      }
    } catch (e) {
      thrown = (e as Error).message;
    }

    const elapsed = performance.now() - startTime;
    return { thrown, completedSounds, elapsed, audioState: ctx.state };
  });

  results.push({
    test: 'Chromium Web Audio Rapid Firing (200 sounds in burst)',
    passed: rapidFiringResult.thrown === null && rapidFiringResult.completedSounds === 200,
    details: rapidFiringResult,
  });

  // Test 2: Volume Bounds in Real Chromium
  const volumeBoundsResult = await page.evaluate(() => {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const gainNode = ctx.createGain();
    const audio = new Audio();

    const results: Array<{ test: string; passed: boolean; error?: string; valueAssigned?: number }> = [];

    // Helper simulating current SoundSynthesizer clamping logic:
    const clampCurrent = (val: number) => Math.max(0, Math.min(1, val));

    // Test extreme values
    for (const val of [-5, 9999, Infinity, -Infinity]) {
      const clamped = clampCurrent(val);
      let err: string | undefined;
      try {
        gainNode.gain.cancelScheduledValues(ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(clamped, ctx.currentTime + 0.05);
      } catch (e) {
        err = (e as Error).message;
      }
      results.push({ test: `SoundSynthesizer clamp(${val})`, passed: !err && (clamped === 0 || clamped === 1), error: err, valueAssigned: clamped });
    }

    // Test NaN on Web Audio linearRampToValueAtTime
    const nanClamped = clampCurrent(NaN);
    let synthNanErr: string | undefined;
    try {
      gainNode.gain.cancelScheduledValues(ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(nanClamped, ctx.currentTime + 0.05);
    } catch (e) {
      synthNanErr = (e as Error).message;
    }
    results.push({
      test: 'SoundSynthesizer clamp(NaN) -> linearRampToValueAtTime',
      passed: !synthNanErr,
      error: synthNanErr,
      valueAssigned: nanClamped,
    });

    // Test NaN on HTMLAudioElement.volume
    let audioNanErr: string | undefined;
    try {
      audio.volume = nanClamped;
    } catch (e) {
      audioNanErr = (e as Error).message;
    }
    results.push({
      test: 'HTMLAudioElement volume = clamp(NaN)',
      passed: !audioNanErr,
      error: audioNanErr,
      valueAssigned: nanClamped,
    });

    // Test MusicPlayer ducking with multiplier = 2.0 when targetVolume is 0.6 (0.6 * 2 = 1.2)
    let duckErr: string | undefined;
    try {
      const duckedVol = 0.6 * 2.0; // 1.2 (> 1.0)
      audio.volume = duckedVol;
    } catch (e) {
      duckErr = (e as Error).message;
    }
    results.push({
      test: 'MusicPlayer duck multiplier > 1.0 (exceeding 1.0 volume)',
      passed: !duckErr,
      error: duckErr,
    });

    // Test MusicPlayer ducking with negative multiplier
    let duckNegErr: string | undefined;
    try {
      const duckedVol = 0.6 * -0.5; // -0.3 (< 0.0)
      audio.volume = duckedVol;
    } catch (e) {
      duckNegErr = (e as Error).message;
    }
    results.push({
      test: 'MusicPlayer duck negative multiplier (< 0.0 volume)',
      passed: !duckNegErr,
      error: duckNegErr,
    });

    return results;
  });

  for (const r of volumeBoundsResult) {
    results.push({
      test: `Chromium: ${r.test}`,
      passed: r.passed,
      details: { valueAssigned: r.valueAssigned },
      error: r.error,
    });
  }

  // Test 3: MusicPlayer 0-duration crossfade in real Chromium
  const crossfadeZeroDurationResult = await page.evaluate(async () => {
    const audioOut = new Audio();
    const audioIn = new Audio();

    let err: string | undefined;
    const durationMs = 0;
    const startTime = performance.now();

    // In requestAnimationFrame callback when elapsed = 0:
    const now = startTime;
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1.0); // 0 / 0 = NaN

    try {
      audioOut.volume = Math.max(0, 1.0 * (1.0 - progress));
    } catch (e) {
      err = (e as Error).message;
    }

    return { progress, err };
  });

  results.push({
    test: 'Chromium: MusicPlayer crossfade with durationSec = 0 (NaN progress)',
    passed: !crossfadeZeroDurationResult.err,
    details: { progress: crossfadeZeroDurationResult.progress },
    error: crossfadeZeroDurationResult.err,
  });

  await browser.close();
  return results;
}

runBrowserTests().then((res) => {
  console.log('=== CHROMIUM REAL BROWSER AUDIO CHALLENGE RESULTS ===\n');
  for (const r of res) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.test}`);
    if (r.details) console.log('Details:', JSON.stringify(r.details));
    if (r.error) console.log('Thrown Error:', r.error);
    console.log('---');
  }
});
