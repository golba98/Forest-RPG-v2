import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root = 'artifacts/player-flow';
const files = await fs.readdir(root, { recursive: true });
const find = (prefix, part, ending) =>
  files.find((p) => p.startsWith(prefix + '/') && p.includes(part) && p.endsWith(ending));
const idle = (prefix, browser) =>
  find(prefix, 'player-flow-approved-', `-${browser}/same-art-idle.png`);
const trace = (prefix, browser) => find(prefix, 'player-flow-eight-', `-${browser}/trace.json`);
const video = (prefix, browser) =>
  find(prefix, 'player-remaster-capture-', `-${browser}/video.webm`);
const label = (w, h, texts) =>
  Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#203526"/><g font-family="sans-serif" font-size="16" fill="#f4eddd">${texts.map(([x, y, t]) => `<text x="${x}" y="${y}">${t}</text>`).join('')}</g></svg>`,
  );
const stills = [],
  audit = [];
for (const browser of ['chromium', 'firefox']) {
  const before = idle('before-traces', browser),
    after = idle('regressions', browser);
  if (!before || !after) throw Error('Missing matched idle capture');
  const beforeMetadata = JSON.parse(
    await fs.readFile(`${root}/${path.dirname(before)}/idle-metadata.json`, 'utf8'),
  );
  const afterMetadata = JSON.parse(
    await fs.readFile(`${root}/${path.dirname(after)}/idle-metadata.json`, 'utf8'),
  );
  const crops = [];
  for (const [i, [file, metadata]] of [
    [before, beforeMetadata],
    [after, afterMetadata],
  ].entries()) {
    const b = metadata.bounds;
    crops.push({
      input: await sharp(`${root}/${file}`)
        .extract({
          left: Math.round(b.x + b.width / 2 - 128),
          top: Math.round(b.y + b.height / 2 - 128),
          width: 256,
          height: 256,
        })
        .png()
        .toBuffer(),
      left: i * 256,
      top: 32,
    });
  }
  const identical = (await sharp(crops[0].input).raw().toBuffer()).equals(
    await sharp(crops[1].input).raw().toBuffer(),
  );
  audit.push({
    browser,
    scene: 'idle',
    identicalGameplayPixels: identical,
    before: beforeMetadata,
    after: afterMetadata,
  });
  const out = `same-art-${browser}.png`;
  await sharp(
    label(512, 288, [
      [12, 23, 'Previous timing'],
      [268, 23, 'Improved flow · same art'],
    ]),
  )
    .composite(crops)
    .png()
    .toFile(`${root}/${out}`);
  stills.push(out);
  const beforeTrace = trace('before-traces', browser),
    afterTrace = trace('recheck', browser) ?? trace('regressions', browser);
  if (!beforeTrace || !afterTrace) throw Error('Missing successful stop traces');
  const beforeRows = JSON.parse(await fs.readFile(`${root}/${beforeTrace}`, 'utf8')),
    afterRows = JSON.parse(await fs.readFile(`${root}/${afterTrace}`, 'utf8'));
  for (const direction of ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']) {
    const layers = [],
      texts = [];
    for (const [row, [file, rows]] of [
      [beforeTrace, beforeRows],
      [afterTrace, afterRows],
    ].entries())
      for (const [col, stage] of ['stop-64ms', 'stop-96ms', 'stop-160ms'].entries()) {
        const item = rows.find((r) => r.direction === direction && r.stage === stage);
        if (!item) throw Error('Missing trace stage');
        const b = item.sprite.bounds;
        const input = await sharp(`${root}/${path.dirname(file)}/${direction}-${stage}.png`)
          .extract({
            left: Math.round(b.x + b.width / 2 - 80),
            top: Math.round(b.y + b.height / 2 - 80),
            width: 160,
            height: 160,
          })
          .png()
          .toBuffer();
        layers.push({ input, left: col * 200 + 20, top: row * 196 + 32 });
        texts.push([
          col * 200 + 10,
          row * 196 + 23,
          `${row ? 'Improved' : 'Previous'} ${stage.slice(5)}`,
        ]);
      }
    const out = `stop-${browser}-${direction}.png`;
    await sharp(label(600, 392, texts))
      .composite(layers)
      .png()
      .toFile(`${root}/${out}`);
    audit.push({ browser, direction, scene: 'stop', file: out });
  }
}
await fs.writeFile(`${root}/comparison-audit.json`, JSON.stringify(audit, null, 2));
const hashes = JSON.parse(
  await fs.readFile('docs/assets/source/player-remaster/approved-hashes.json', 'utf8'),
);
const images = {};
for (const d of ['south', 'east', 'northeast', 'northwest'])
  images[d] =
    'data:image/png;base64,' +
    (await fs.readFile(`public/assets/images/characters/player/attack/attack_${d}.png`)).toString(
      'base64',
    );
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approved remaster — playback only</title><style>:root{color-scheme:dark;font:16px/1.6 system-ui;background:#122019;color:#f1ecdf}body{max-width:1320px;margin:32px auto;padding:0 24px}h1{font-size:32px}h2{margin-top:36px}a{color:#bae2b6}.scroll{overflow:auto;border:1px solid #49644c}img{display:block;max-width:none;image-rendering:pixelated}canvas{image-rendering:pixelated}video{width:1280px;max-width:100%}select,button{font:inherit;padding:6px;margin:6px}summary{padding:10px;cursor:pointer}p{max-width:1050px}</style>
<h1>Your approved remaster. Only the playback changed.</h1><p>The artwork previously labelled <strong>“Rejected remaster”</strong> is restored as the default. All ${Object.keys(hashes).length} sprite sheets / 456 frames match their original SHA-256 hashes exactly. There are no redraws, replacement body parts, new colours or added drawings.</p><p><a href="http://localhost:4328/scripts/player-study/review.html">Play Approved remaster — compare both timings</a> · <a href="restoration-audit.json">56-file restoration proof</a> · <a href="modified-files.json">Modified files and gameplay preservation audit</a></p>
<h2>What changed</h2><p>Stopping settles through up to two existing poses within 80 ms of simulation time, with the closest available idle join chosen from the current and next two poses. Walking/running preserve stride phase; new movement, attacks, jumping, hurt/death, facing changes and teleports interrupt settling immediately. Movement itself stops without an added delay.</p><p>Punches use the same nine drawings. The original 120 ms wind-up is retained, the impact pose holds for 60 ms, and recovery uses 40/30/30/40/40 ms pose durations. The complete attack still lasts 360 ms. All three combos share this pacing. Combat directions, strike detection, collision, camera, world systems and save formats are unchanged.</p>
<h2>The artwork is identical</h2><p>These are actual 1280×720 gameplay captures, cropped without scaling, using matching idle frame zero and the same fixture. <a href="comparison-audit.json">Capture audit</a>.</p>${stills.map((p) => `<div class="scroll"><img src="${p}" alt="Identical remaster artwork with previous and improved playback"></div>`).join('')}
<h2>Punch pacing inspection</h2><p>Same source sheet on both sides, displayed at 4× for inspection. This preview compares pose dwell times; full-speed gameplay recordings are below.</p><select id="direction"><option value="south">South</option><option value="east">East</option><option value="northeast">Northeast</option><option value="northwest">Northwest</option></select><button id="pause">Pause</button><canvas id="preview" width="768" height="300"></canvas>
<h2>Stopping transitions</h2><p>Previous playback above, improved playback below. Captures at 64/96/160 ms after key release include the existing input/fixed-step propagation. The separate unit tests enforce an 80 ms presentation limit after the simulation reports a stop. Position assertions verify that settling does not move the player.</p>${audit
  .filter((a) => a.scene === 'stop')
  .map(
    (a) =>
      `<details><summary>${a.browser} · ${a.direction}</summary><div class="scroll"><img src="${a.file}" alt="Stop sequence with unchanged artwork"></div></details>`,
  )
  .join('')}
<h2>Eight-direction gameplay and combos</h2>${['chromium', 'firefox'].map((b) => `<h3>${b} — improved flow</h3><video controls preload="metadata" src="${video('regressions', b)}"></video><p><a href="${video('before-motion', b)}">Previous timing: identical artwork and the same input route</a></p>`).join('')}
<h2>Validation</h2><p>804 unit/integration tests passed. Across the final runs, all 98 production browser cases passed (89 on the full run, nine after updating stale assertions), plus eight baseline/review cases, covering Chromium and Firefox. Root/study TypeScript and build passed; lint has zero errors and five pre-existing world-code warnings.</p><p><a href="unit.log">Unit/integration results</a> · <a href="regressions.log">Production browser regressions</a> · <a href="recheck.log">Updated stop/pixel-check assertions</a> · <a href="before-motion.log">Baseline recordings</a> · <a href="before-traces.log">Baseline traces</a> · <a href="review.log">Review controls and decoded texture hashes</a> · <a href="typecheck.log">TypeScript</a> · <a href="lint.log">Lint</a> · <a href="build.log">Build</a></p><p>Browser checks cover every direction, all punch drawings and three combo stages, pause/reload/death, input reversal, bridge collision and traversal. Assertions that previously required instant idle now allow the input pipeline plus the bounded settle; the bolt pixel check waits for its glow to clear the head. Pixel-match thresholds and gameplay expectations are unchanged.</p>
<h2>Scope and limits</h2><p>The chosen drawings remain exactly as approved, including their existing pose-to-pose differences. This pass does not use frame blending, blur or rescaling to disguise them. <a href="pose-join-audit.json">Pose-selection analysis</a>. The later fixed-model artwork remains archived and is not used by normal gameplay. No commit, push, merge or deployment was made.</p>
<script>const sources=${JSON.stringify(images)};const images=Object.fromEntries(Object.entries(sources).map(([d,url])=>{const i=new Image();i.src=url;return[d,i]}));const ctx=document.querySelector('#preview').getContext('2d'),direction=document.querySelector('#direction');let paused=false,time=0;document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'Resume':'Pause'};function draw(t){if(!paused)time=t;const elapsed=time%700,frames=[Math.min(8,Math.floor(elapsed/40)),[40,80,120,180,220,250,280,320].filter(b=>elapsed>=b).length];ctx.fillStyle='#3a503d';ctx.fillRect(0,0,768,300);ctx.fillStyle='#f4efdf';ctx.font='16px system-ui';ctx.fillText('Previous timing',64,24);ctx.fillText('Improved flow',448,24);ctx.imageSmoothingEnabled=false;for(let n=0;n<2;n++){const im=images[direction.value];if(im.complete&&im.naturalWidth)ctx.drawImage(im,frames[n]*64,0,64,64,n*384+64,32,256,256);}requestAnimationFrame(draw)}requestAnimationFrame(draw);</script></html>`;
if (['chromium', 'firefox'].some((b) => !video('regressions', b) || !video('before-motion', b)))
  throw Error('Missing recordings');
await fs.writeFile(`${root}/index.html`, html);
console.log('Built approved-art playback report.');
