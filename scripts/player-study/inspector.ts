import metadata from '../../src/animation/playerFluidMetadata.json';
import { PlayerPoseController } from '../../src/animation/PlayerMotion';
import { PlayerBlink } from '../../src/animation/PlayerBlink';
import { PlayerNativePresenter } from '../../src/animation/PlayerNativePresenter';
import { playerRgba } from '../../src/animation/playerPixelMath';
import type { PlayerClip } from '../../src/animation/PlayerMotion';
import type { RenderEntityView } from '../../src/types/render';
import type { Direction } from '../../src/types/entities';
function required<T extends Element = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw Error(`Missing inspection control: ${selector}`);
  return node;
}
// Approved native frames; the game below exercises the real presentation clock.
const canvas = required<HTMLCanvasElement>('#inspect');
const context = canvas.getContext('2d');
if (!context) throw Error('Missing inspection canvas context');
const ctx = context;
const select = required<HTMLSelectElement>('#inspect-clip');
const direction = required<HTMLSelectElement>('#direction');
const speed = required<HTMLSelectElement>('#inspect-speed');
const counts: Record<string, number> = metadata.counts;
const blink = new PlayerBlink();
let blinkElapsed = 0;
let elapsed = 0,
  last = performance.now(),
  paused = false;
let previousElapsed = 0;
let controller = new PlayerPoseController();
const presenter = new PlayerNativePresenter();
const native = document.createElement('canvas');
native.width = native.height = 64;
const nativeContext = native.getContext('2d')!;
function timing(clip: string): number[] {
  return metadata.durations[clip as keyof typeof metadata.durations];
}
function chosen() {
  let clip = select.value,
    t = elapsed;
  if (clip === 'sequence') {
    const seq = ['idle', 'walk', 'run', 'jump', 'attack', 'attack2', 'attack3'];
    const spans = seq.map((c) => timing(c).reduce((a, b) => a + b, 0));
    t %= spans.reduce((a, b) => a + b, 0);
    for (let n = 0; n < seq.length; n++) {
      clip = seq[n] ?? 'idle';
      if (t < (spans[n] ?? 0)) break;
      t -= spans[n] ?? 0;
    }
  }
  return { clip, t: t % timing(clip).reduce((a, b) => a + b, 0) };
}
required('#inspect-pause').addEventListener('click', () => {
  paused = !paused;
  required('#inspect-pause').textContent = paused ? 'Resume inspection' : 'Pause inspection';
});
required('#inspect-step').addEventListener('click', () => {
  paused = true;
  required('#inspect-pause').textContent = 'Resume inspection';
  const { clip, t } = chosen();
  const ds = timing(clip);
  let b = 0;
  for (const d of ds) {
    b += d;
    if (b > t + 0.01) {
      // Cross the native boundary by a tiny epsilon; adding an exact fractional
      // remainder to the accumulated clock can otherwise round back below it.
      const step = Math.min(b - t + 0.01, blink.nextChangeMs + 0.01);
      elapsed += step;
      blinkElapsed += step;
      blink.update(blinkElapsed);
      break;
    }
  }
});
required('#inspect-blink').addEventListener('click', () => blink.startBlink());
select.onchange = () => {
  elapsed = 0;
  previousElapsed = 0;
  controller = new PlayerPoseController();
  presenter.reset();
};
direction.addEventListener('change', () => {
  elapsed = 0;
  previousElapsed = 0;
  controller = new PlayerPoseController();
  presenter.reset();
});
function draw(now: number) {
  if (!paused) {
    const dt = (now - last) * Number(speed.value);
    elapsed += dt;
    blinkElapsed += dt;
  }
  const phase = blink.update(blinkElapsed);
  last = now;
  const { clip, t } = chosen(),
    ds = timing(clip);
  let local = t % ds.reduce((a, b) => a + b, 0),
    f = 0;
  while (f < ds.length - 1 && local >= (ds[f] ?? Infinity)) local -= ds[f++] ?? 0;
  const view: RenderEntityView = {
    id: 'inspection',
    kind: 'player',
    spriteKey: 'player',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    lift: 0,
    alpha: 1,
    hurtFlash: false,
    anim: 'idle',
    animTimeMs: t,
    facing: direction.value as Direction,
    vx: clip === 'walk' || clip === 'run' ? 1 : 0,
    isSprinting: clip === 'run',
    isJumping: clip === 'jump',
    jumpProgress: t / 500,
    attack: clip.startsWith('attack')
      ? {
          swingId: 1,
          comboStep: clip === 'attack3' ? 3 : clip === 'attack2' ? 2 : 1,
          direction: direction.value as Direction,
          elapsedMs: t,
        }
      : null,
  };
  const distance = (t / ds.reduce((a, b) => a + b, 0)) * 64;
  const delta = Math.max(0, elapsed - previousElapsed);
  const full = controller.update(view, distance, delta);
  previousElapsed = elapsed;
  const pose =
    select.value === 'sequence'
      ? full
      : {
          upper: { clip: clip as PlayerClip, frame: f, facing: direction.value as Direction },
          lower: { clip: clip as PlayerClip, frame: f, facing: direction.value as Direction },
        };
  ctx.fillStyle = '#344937';
  ctx.fillRect(0, 0, 1056, 344);
  ctx.imageSmoothingEnabled = false;
  ctx.font = '17px system-ui';
  ctx.fillStyle = '#f3efdf';
  ctx.fillText('Approved character · 4× inspection', 18, 25);
  ctx.fillText('Actual native pixels · 1×', 546, 25);
  const pixels = presenter.render(pose, phase);
  nativeContext.putImageData(
    new ImageData(new Uint8ClampedArray(playerRgba(pixels)), 64, 64),
    0,
    0,
  );
  ctx.drawImage(native, 48, 48, 256, 256);
  ctx.drawImage(native, 700, 144, 64, 64);
  canvas.dataset.phase = phase;
  canvas.dataset.frame = String(f);
  canvas.dataset.head = JSON.stringify(presenter.face);
  required('#inspect-status').textContent =
    `${direction.value} · ${clip} · frame ${f + 1}/${counts[clip]}${pose.transition ? ' · action transition' : ''} · eyes ${phase} · 4× inspection and actual 1× pixels`;
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
