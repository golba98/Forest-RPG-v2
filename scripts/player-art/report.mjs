// Evidence assembly only; production art is built by build-player-final.mjs.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const root = 'artifacts/player-final';
const files = await fs.readdir(root, { recursive: true });
const comparisons = [],
  audit = [];
const label = (w, h, a, b) =>
  Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#1b2b20"/><g fill="#f3eddf" font-family="sans-serif" font-size="16"><text x="12" y="23">${a}</text><text x="${w / 2 + 12}" y="23">${b}</text></g></svg>`,
  );
for (const browser of ['chromium', 'firefox'])
  for (const width of [1280, 2560]) {
    const folders = ['candidate', 'final'].map(
      (p) => `matched/player-final-scenes-${p}-stable-model-comparison-${width}-${browser}`,
    );
    const metadata = await Promise.all(
      folders.map((f) => fs.readFile(`${root}/${f}/metadata.json`, 'utf8').then(JSON.parse)),
    );
    for (let i = 0; i < metadata[0].length; i++) {
      const pair = metadata.map((rows) => rows[i]),
        [a, b] = pair;
      if (
        a.name !== b.name ||
        a.sprite.facing !== b.sprite.facing ||
        a.sprite.frame.x !== 0 ||
        b.sprite.frame.x !== 0 ||
        a.state.camera.zoom !== b.state.camera.zoom ||
        Math.abs(a.state.camera.x - b.state.camera.x) > 0.001 ||
        Math.abs(a.state.camera.y - b.state.camera.y) > 0.001 ||
        a.state.world.daylightCycleRatio !== b.state.world.daylightCycleRatio ||
        a.state.world.weather !== b.state.world.weather
      )
        throw Error('Mismatched capture ' + a.name);
      audit.push({ browser, width, scene: a.name, matched: true, zoom: a.state.camera.zoom });
      const w = width === 1280 ? 320 : 512,
        h = width === 1280 ? 300 : 448;
      const layers = [];
      for (let n = 0; n < 2; n++) {
        const { bounds } = pair[n].sprite,
          zoom = pair[n].state.camera.zoom;
        const left = Math.round(bounds.x + bounds.width / 2 - w / 2),
          top = Math.round(bounds.y + 54 * zoom - h * 0.78);
        layers.push({
          input: await sharp(`${root}/${folders[n]}/${a.name}.png`)
            .extract({ left, top, width: w, height: h })
            .png()
            .toBuffer(),
          left: n * w,
          top: 32,
        });
      }
      const file = `compare-${browser}-${width}-${a.name}.png`;
      await sharp(label(w * 2, h + 32, 'Approved sample', 'Final · fixed proportions'))
        .composite(layers)
        .png()
        .toFile(`${root}/${file}`);
      comparisons.push({
        browser,
        width,
        name: a.name,
        file,
        full: folders.map((f) => `${f}/${a.name}.png`),
      });
    }
  }
await fs.writeFile(`${root}/capture-audit.json`, JSON.stringify(audit, null, 2));
// First-pose native comparison: no scaling inside this image.
const layers = [];
for (const [row, direction] of ['south', 'east', 'northeast'].entries())
  for (const [column, folder] of [
    'docs/assets/source/player-rework',
    'docs/assets/source/player-final',
  ].entries())
    layers.push({
      input: await fs.readFile(`${folder}/frames/${direction}/idle-0.png`),
      left: column * 192 + 64,
      top: row * 80 + 32,
    });
await sharp(label(384, 272, 'Approved sample', 'Final native pixels'))
  .composite(layers)
  .png()
  .toFile(`${root}/native-comparison.png`);
const section = (c) =>
  `<details ${c.browser === 'chromium' && c.width === 1280 && c.name.endsWith('tree') ? 'open' : ''}><summary>${c.browser} · ${c.width}×${(c.width * 9) / 16} · ${c.name}</summary><div class="scroll"><img src="${c.file}" alt="Matched approved sample and final character"></div><p>${c.full.map((p, i) => `<a href="${p}">${i ? 'Final' : 'Sample'} full frame</a>`).join(' · ')}</p></details>`;
const video = (b) =>
  files.find(
    (p) =>
      p.startsWith('motion/') &&
      p.includes('player-remaster-capture-') &&
      p.includes(`-${b}/`) &&
      p.endsWith('video.webm'),
  );
const nativeSheets = {};
for (const d of ['south', 'east', 'northeast']) {
  nativeSheets[d] = {};
  for (const clip of ['idle', 'walk', 'attack'])
    nativeSheets[d][clip] = await Promise.all(
      [
        `artifacts/player-rework/sheets/${clip}/${clip}_${d}.png`,
        `public/assets/images/characters/player/${clip}/${clip}_${d}.png`,
      ].map(async (p) => 'data:image/png;base64,' + (await fs.readFile(p)).toString('base64')),
    );
}
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Player remaster — consistent proportions and motion</title><style>:root{color-scheme:dark;font:16px/1.6 system-ui;background:#111d16;color:#f0ebdf}body{max-width:1320px;margin:32px auto;padding:0 24px}a{color:#b6e5b8}h1{font-size:32px}h2{margin-top:36px}p{max-width:1050px}.scroll{overflow:auto;border:1px solid #53644f}img{display:block;max-width:none;image-rendering:pixelated}video{width:1280px;max-width:100%}summary{padding:10px;cursor:pointer}select,button{font:inherit;margin:6px;padding:5px}canvas{image-rendering:pixelated}code{font-size:14px}</style>
<h1>Same approved character, consistent animation</h1><p>All 456 frames across 56 strips now use fixed native head models and consistent body parts. The approved S/E/NE heads retain their pixels; five additional directions complete the set. There are no old-art substitutions in normal gameplay.</p><p><a href="http://localhost:4328/scripts/player-study/review.html">Play the updated review</a> · <a href="http://localhost:4328/?debug=1&autostart=1&seed=42">Open the full game</a></p>
<h2>What changed</h2><p>The sample's independently drawn poses changed head contours and volume, and unsupported states switched to the rejected set. The final pipeline reuses one native head per direction without resizing it, retains model torso clusters and animates shaded limbs through explicit poses. Small integer translations provide breathing, weight transfer and punch follow-through.</p><p>Each punch starts and ends at the same neutral pose as idle; all combo handoffs match exactly. Walking and jumping start there too, and landing returns there. The impact is still at 120 ms, and the attack ends at 360 ms. Direction locks, hit detection, collision, movement speed, camera scale and save code were not changed.</p>
<h2>Frame transitions</h2><p>Native sprite preview: approved sample on the left, final on the right, both enlarged 4× with nearest-neighbour display. This shows pose order; real gameplay speed is shown in the recordings below.</p><select id="direction"><option value="south">South</option><option value="east">East</option><option value="northeast">Northeast</option></select><select id="clip"><option>idle</option><option>walk</option><option>attack</option></select><button id="pause">Pause preview</button><div class="scroll"><canvas id="motion" width="768" height="300"></canvas></div><div class="scroll"><img src="native-comparison.png" alt="Unscaled native source comparison"></div>
<h2>Actual gameplay scale</h2><p>Every pair uses the same scene, camera position/zoom, resolution, light, facing and idle frame zero. Images retain their capture pixel size. <a href="capture-audit.json">28 matched-condition audits</a>.</p>${comparisons.map(section).join('')}
<h2>Eight-direction gameplay</h2><p>Walking, running, idle, all three punches and jumping in all eight directions. These recordings use the normal production assets and real keyboard input.</p>${['chromium', 'firefox'].map((b) => `<h3>${b}</h3><video controls preload="metadata" src="${video(b)}"></video>`).join('')}
<h2>Files and verification</h2><p>798 unit/integration tests passed. Browser validation passed: 92 production regressions, two complete eight-direction recordings, eight matched-scene cases and two interactive-control cases. TypeScript and production build passed; lint has zero errors and five existing world-code warnings. <a href="consistency-audit.json">Fixed-model and neutral-join audit</a>.</p><p>The initial recordings exposed a test-harness race: separate diagonal key-release calls allowed an intermediate cardinal step. The recorder now releases both keys in one browser turn; both final recordings passed. The serial unit run avoids the CPU-contention timeouts of the initial parallel run. Gameplay code was unchanged.</p><p><a href="../../docs/assets/source/player-final/manifest.json">456 frame definitions and anchors</a> · <a href="../../docs/assets/source/player-final/provenance.json">Source prompt, provenance and hashes</a> · <a href="native-gallery.png">All native poses</a> · <a href="modified-files.json">Changed-file audit</a></p><p><a href="unit.log">Unit/integration tests</a> · <a href="regressions.log">Production browser regressions</a> · <a href="motion.log">Final eight-direction recordings</a> · <a href="matched.log">8 matched-scene browser checks</a> · <a href="controls.log">Review controls</a> · <a href="typecheck.log">TypeScript</a> · <a href="lint.log">Lint</a> · <a href="build.log">Build</a></p>
<h2>Limits</h2><p>Native silhouettes differ by at most one pixel between viewing angles (21–22 px head width, 20–21 px head height), but never change size within an animation. Small 1 px pose translations remain intentional pixel-art motion. The rig uses discrete poses rather than blurred interpolation; it does not implement per-foot ground IK. Hurt/death retain the game's existing held-frame fallback. No commit, push, merge or deployment was made.</p>
<script>const sources=${JSON.stringify(nativeSheets)};const images={};for(const [d,clips]of Object.entries(sources)){images[d]={};for(const [c,urls]of Object.entries(clips))images[d][c]=urls.map(url=>{const im=new Image();im.src=url;return im;});}const canvas=document.querySelector('#motion'),ctx=canvas.getContext('2d'),dir=document.querySelector('#direction'),clip=document.querySelector('#clip');let paused=false,held=0;document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'Resume preview':'Pause preview';};function tick(t){if(!paused)held=t;ctx.fillStyle='#354a39';ctx.fillRect(0,0,768,300);ctx.fillStyle='#f6eee0';ctx.font='16px system-ui';ctx.fillText('Approved sample',70,26);ctx.fillText('Final',454,26);ctx.imageSmoothingEnabled=false;const n=clip.value==='idle'?6:clip.value==='walk'?8:9;const ms=clip.value==='idle'?200:clip.value==='walk'?70:40;const f=Math.floor(held/ms)%(n+(clip.value==='attack'?6:0));for(let i=0;i<2;i++){const im=images[dir.value][clip.value][i];if(im.complete)ctx.drawImage(im,Math.min(f,n-1)*64,0,64,64,i*384+64,36,256,256);}requestAnimationFrame(tick);}requestAnimationFrame(tick);</script></html>`;
if (['chromium', 'firefox'].some((b) => !video(b)))
  throw Error('Both successful motion recordings are required');
await fs.writeFile(`${root}/index.html`, html);
console.log(`Built ${comparisons.length} matched comparisons and motion review.`);
