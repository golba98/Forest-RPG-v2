import {
  installPlayerStudy,
  type StudyDirection,
  type StudyScene,
} from '../../tests/fixtures/player-study';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw Error(`Missing review control ${selector}`);
  return element;
}
const frame = required<HTMLIFrameElement>('#game');
const art = required<HTMLSelectElement>('#art');
const playback = required<HTMLSelectElement>('#playback');
const direction = required<HTMLSelectElement>('#direction');
const scene = required<HTMLSelectElement>('#scene');
const weather = required<HTMLSelectElement>('#weather');
const status = required<HTMLElement>('#status');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let busy = false;

function reset() {
  const host = frame.contentWindow;
  if (!host?.__GAME__) return;
  installPlayerStudy(
    host,
    direction.value as StudyDirection,
    scene.value as StudyScene,
    weather.value === 'rain',
  );
  status.textContent = `${art.selectedOptions[0]?.text} · ${direction.value} · ${scene.value} · ${weather.value}`;
}
async function load() {
  status.textContent = 'Loading the same scene with selected artwork…';
  localStorage.setItem(
    'forestrpg.v2.settings',
    JSON.stringify({
      clouds: false,
      fireflies: false,
      particles: false,
      lighting: true,
      shake: false,
      tutorials: false,
      masterVolume: 0,
    }),
  );
  frame.src = `/?debug=1&autostart=1&tutorial=0&seed=42&playerArt=${art.value}&playerFlow=${playback.value}`;
  await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  for (let i = 0; i < 300 && !frame.contentWindow?.__GAME__; i++) await sleep(100);
  reset();
}
function key(code: string, down: boolean) {
  frame.contentWindow?.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code,
      key: code === 'KeyE' ? 'e' : code,
      bubbles: true,
    }),
  );
}
const movementKeys: Record<StudyDirection, string[]> = {
  S: ['KeyS'],
  SE: ['KeyS', 'KeyD'],
  E: ['KeyD'],
  NE: ['KeyW', 'KeyD'],
  N: ['KeyW'],
  NW: ['KeyW', 'KeyA'],
  W: ['KeyA'],
  SW: ['KeyS', 'KeyA'],
};
async function action(kind: 'walk' | 'run' | 'jump' | 'punch' | 'combo') {
  if (busy) return;
  busy = true;
  const held: string[] = [];
  try {
    reset();
    await sleep(150);
    if (kind === 'combo') {
      for (let stage = 0; stage < 3; stage++) {
        key('KeyE', true);
        await sleep(40);
        key('KeyE', false);
        await sleep(360);
      }
    } else {
      const moving = kind === 'walk' || kind === 'run';
      held.push(
        ...(moving
          ? movementKeys[direction.value as StudyDirection]
          : [kind === 'jump' ? 'Space' : 'KeyE']),
      );
      if (kind === 'run') held.push('ShiftLeft');
      for (const code of held) key(code, true);
      await sleep(moving ? 700 : 60);
      for (const code of held) key(code, false);
      await sleep(moving ? 400 : 600);
    }
  } finally {
    for (const code of held) key(code, false);
    busy = false;
  }
}
playback.addEventListener('change', () => {
  void load();
});
art.addEventListener('change', () => {
  void load();
});
for (const control of [direction, scene, weather]) control.addEventListener('change', reset);
document.querySelector('#reset')?.addEventListener('click', reset);
document.querySelector('#walk')?.addEventListener('click', () => {
  void action('walk');
});
document.querySelector('#punch')?.addEventListener('click', () => {
  void action('punch');
});
for (const kind of ['run', 'jump', 'combo'] as const)
  document.querySelector(`#${kind}`)?.addEventListener('click', () => {
    void action(kind);
  });
document.querySelector('#full')?.addEventListener('click', () => {
  void frame.requestFullscreen();
});
void load();
