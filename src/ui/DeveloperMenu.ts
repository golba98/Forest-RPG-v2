import { ANIMATION_DEFS } from '../animation/AnimationDefs';
import { DIRECTIONS } from '../animation/PlayerSheets';
import { resolveSpriteFrame } from '../animation/resolveSpriteFrame';
import { environmentAssets } from '../rendering/environmentArt';
import { buildVisualManifest } from '../rendering/visualManifest';
import type { AnimState, Direction } from '../types/entities';
import { action } from './WorldLibraryMenu';

/** Demo-only content inspection. No simulation or player-save dependencies. */
export function developerMenu(host: HTMLElement, biomes: () => void, back: () => void): () => void {
  let frame = 0,
    disposed = false,
    elapsed = 0,
    paused = false,
    last = performance.now();
  const images = new Map<string, HTMLImageElement>();
  const manifest = buildVisualManifest();
  const paths = new Map(manifest.map((a) => [a.alias, a.path]));
  for (const a of environmentAssets()) paths.set(a.alias, a.src);
  const load = (path: string) => {
    let img = images.get(path);
    if (!img) {
      img = new Image();
      img.src = '/' + path;
      images.set(path, img);
    }
    return img;
  };
  const render = (category: string) => {
    cancelAnimationFrame(frame);
    host.className = 'menu-panel developer-panel';
    host.replaceChildren();
    const title = document.createElement('h1');
    title.textContent = 'Developer · Demo';
    host.append(title);
    const nav = document.createElement('nav');
    nav.className = 'developer-tabs';
    nav.setAttribute('aria-label', 'Developer categories');
    host.append(nav);
    action(nav, 'Biomes', biomes);
    for (const tab of ['Characters', 'Environment', 'Loot & Portals'])
      action(nav, tab, () => render(tab)).setAttribute('aria-pressed', String(category === tab));
    const label = document.createElement('label');
    label.textContent = 'Content';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Content');
    label.append(select);
    host.append(label);
    const keys =
      category === 'Characters'
        ? ['player', 'mantis', 'maggot', 'beetle', 'ghost']
        : category === 'Environment'
          ? [
              ...manifest
                .filter((a) => !a.animation && !a.id.startsWith('actor:portal'))
                .map((a) => a.alias),
              ...environmentAssets().map((a) => a.alias),
            ]
          : ['coin', 'health_potion', 'speed_potion', 'chest', 'portal', 'acid'];
    for (const key of [...new Set(keys)]) {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = key.replaceAll('_', ' ');
      select.append(o);
    }
    const controls = document.createElement('div');
    controls.className = 'preview-controls';
    host.append(controls);
    const anim = document.createElement('select');
    anim.setAttribute('aria-label', 'Animation');
    const dir = document.createElement('select');
    dir.setAttribute('aria-label', 'Direction');
    for (const d of DIRECTIONS) {
      const o = document.createElement('option');
      o.textContent = d;
      dir.append(o);
    }
    dir.value = 'S';
    for (const [text, control] of [
      ['Animation', anim],
      ['Direction', dir],
    ] as const) {
      const label = document.createElement('label');
      label.textContent = text;
      label.append(control);
      controls.append(label);
    }
    const activeLabel = document.createElement('label');
    activeLabel.textContent = 'Active portal';
    const active = document.createElement('input');
    active.type = 'checkbox';
    activeLabel.append(active);
    controls.append(activeLabel);
    action(controls, 'Pause / Play', () => {
      paused = !paused;
    });
    action(controls, 'Replay', () => {
      elapsed = 0;
      paused = false;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 300;
    canvas.className = 'content-preview';
    canvas.setAttribute('aria-label', 'Selected content preview');
    host.append(canvas);
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    host.append(status);
    const choose = () => {
      elapsed = 0;
      anim.replaceChildren();
      const clips = Object.keys(ANIMATION_DEFS[select.value]?.clips ?? { idle: true });
      if (select.value === 'player') clips.push('attack2', 'attack3');
      for (const a of clips) {
        const o = document.createElement('option');
        o.textContent = a;
        anim.append(o);
      }
      anim.disabled = !ANIMATION_DEFS[select.value];
      dir.disabled = anim.disabled;
      activeLabel.hidden = select.value !== 'portal';
    };
    select.onchange = choose;
    anim.onchange = () => {
      elapsed = 0;
    };
    choose();
    action(host, 'Back', back);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const tick = (now: number) => {
      if (disposed) return;
      if (!paused) elapsed += Math.min(now - last, 100);
      last = now;
      ctx.fillStyle = '#12271f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const key = select.value,
        animated = !!ANIMATION_DEFS[key];
      const ref = animated
        ? resolveSpriteFrame({
            spriteKey: key,
            anim: (anim.value.startsWith('attack') ? 'attack' : anim.value) as AnimState,
            facing: dir.value as Direction,
            animTimeMs: elapsed,
            active: active.checked,
            ...(key === 'player' && anim.value.startsWith('attack')
              ? {
                  attack: {
                    swingId: 0,
                    comboStep: Number(anim.value.slice(6)) || 1,
                    direction: dir.value as Direction,
                    elapsedMs: elapsed,
                  },
                }
              : {}),
          })
        : undefined;
      const path = paths.get(ref?.textureAlias ?? key);
      if (path) {
        const img = load(path);
        if (img.complete && img.naturalWidth) {
          const r = ref?.frame ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
          const scale = Math.min(4, 420 / r.w, 250 / r.h),
            w = r.w * scale,
            h = r.h * scale;
          ctx.save();
          ctx.translate(240, 150);
          if (ref?.flipX) ctx.scale(-1, 1);
          ctx.drawImage(img, r.x, r.y, r.w, r.h, -w / 2, -h / 2, w, h);
          ctx.restore();
          status.textContent = key.replaceAll('_', ' ');
        } else
          status.textContent = img.complete
            ? 'Asset unavailable. Select another item or reopen to retry.'
            : 'Loading preview…';
      } else status.textContent = 'No preview asset available.';
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    select.focus();
  };
  render('Characters');
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    images.clear();
  };
}
