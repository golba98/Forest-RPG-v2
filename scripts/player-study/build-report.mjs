// Assemble unscaled evidence from the dedicated study's browser captures.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const root = 'artifacts/player-rework';
const dirs = ['S', 'E', 'NE'],
  suffixes = ['south', 'east', 'northeast'];
const phases = ['original', 'rejected', 'candidate'];
const label = (width, height, texts) =>
  Buffer.from(
    `<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#18271e"/><g fill="#f2ecdc" font-family="sans-serif" font-size="16">${texts.map(([x, y, t]) => `<text x="${x}" y="${y}">${t}</text>`).join('')}</g></svg>`,
  );
const files = (await fs.readdir(root, { recursive: true })).map((p) => p.replaceAll('\\', '/'));
const comparisons = [],
  matchAudit = [];
for (const browser of ['chromium', 'firefox'])
  for (const width of [1280, 2560]) {
    const folders = phases.map(
      (phase) => `matched/player-study-${phase}-matched-scenes-${width}-${browser}`,
    );
    const metadata = await Promise.all(
      folders.map((folder) =>
        fs.readFile(`${root}/${folder}/capture-metadata.json`, 'utf8').then(JSON.parse),
      ),
    );
    for (let i = 0; i < metadata[0].length; i++) {
      const entries = metadata.map((rows) => rows[i]);
      const reference = entries[0];
      const identical = entries.every(
        (e) =>
          e.sprite.facing === reference.sprite.facing &&
          e.sprite.frame.x === 0 &&
          e.state.camera.zoom === reference.state.camera.zoom &&
          Math.abs(e.state.camera.x - reference.state.camera.x) < 0.001 &&
          Math.abs(e.state.camera.y - reference.state.camera.y) < 0.001 &&
          e.state.world.daylightCycleRatio === reference.state.world.daylightCycleRatio &&
          e.state.world.weather === reference.state.world.weather,
      );
      matchAudit.push({
        browser,
        width,
        scene: reference.scene,
        facing: reference.facing,
        matched: identical,
        zoom: reference.state.camera.zoom,
        frame: 0,
      });
      if (!identical)
        throw Error(
          `Capture conditions differ: ${browser}/${width}/${reference.scene}/${reference.facing}`,
        );
    }
    for (const direction of dirs)
      for (const scene of ['tree', 'rock', 'bridge', 'overlap', 'rain']) {
        const cw = width === 1280 ? 320 : 512,
          ch = width === 1280 ? 300 : 448;
        const crops = [];
        const full = [];
        for (let i = 0; i < 3; i++) {
          const phase = phases[i];
          const entry = metadata[i].find(
            (e) => e.facing === direction && e.scene === (scene === 'rain' ? 'tree' : scene),
          );
          const b = entry.sprite.bounds,
            zoom = entry.state.camera.zoom;
          const cx = b.x + b.width / 2,
            foot = b.y + 54 * zoom;
          const file = `${folders[i]}/${phase}-${direction}-${scene === 'rain' ? 'rain' : scene}-idle.png`;
          const crop = {
            left: Math.max(0, Math.round(cx - cw / 2)),
            top: Math.max(0, Math.round(foot - ch * 0.78)),
            width: cw,
            height: ch,
          };
          crops.push({
            input: await sharp(`${root}/${file}`).extract(crop).png().toBuffer(),
            left: i * cw,
            top: 32,
          });
          full.push(file);
        }
        const out = `compare-${browser}-${width}-${direction}-${scene}.png`;
        await sharp(
          label(cw * 3, ch + 32, [
            [10, 23, 'Original'],
            [cw + 10, 23, 'Rejected remaster'],
            [cw * 2 + 10, 23, 'Candidate · same gameplay scale'],
          ]),
        )
          .composite(crops)
          .png()
          .toFile(`${root}/${out}`);
        comparisons.push({ browser, width, direction, scene, file: out, full });
      }
  }
// Native pixels: unscaled, tightly cropped only. Original has half-resolution
// source artwork and was displayed at 2×; the other two display at source 1×.
const nativeLayers = [],
  texts = [
    [12, 24, 'Native source pixels — original (runtime 2×) / rejected (1×) / candidate (1×)'],
  ];
for (let row = 0; row < 3; row++)
  for (let col = 0; col < 3; col++) {
    const direction = suffixes[row],
      phase = phases[col];
    let frame;
    if (phase === 'original') {
      const file = `docs/assets/source/player-remaster/original/idle/idle_${direction}.png`,
        m = await sharp(file).metadata();
      frame = await sharp(file)
        .extract({ left: 0, top: 0, width: 20, height: m.height })
        .png()
        .toBuffer();
    } else if (phase === 'rejected')
      frame = await sharp(`docs/assets/source/player-rework/rejected/idle/idle_${direction}.png`)
        .extract({ left: 0, top: 0, width: 64, height: 64 })
        .png()
        .toBuffer();
    else
      frame = await fs.readFile(`docs/assets/source/player-rework/frames/${direction}/idle-0.png`);
    const cropped = await sharp(frame).trim().png().toBuffer(),
      m = await sharp(cropped).metadata();
    nativeLayers.push({
      input: cropped,
      left: col * 180 + 90 - Math.floor(m.width / 2),
      top: row * 92 + 105 - m.height,
    });
    if (col === 0) texts.push([12, row * 92 + 65, dirs[row]]);
  }
await sharp(label(720, 320, texts))
  .composite(nativeLayers)
  .png()
  .toFile(`${root}/native-comparison.png`);
await sharp(`${root}/native-comparison.png`)
  .resize(1440, 640, { kernel: 'nearest' })
  .png()
  .toFile(`${root}/native-comparison-2x.png`);
await fs.writeFile(`${root}/capture-match-audit.json`, JSON.stringify(matchAudit, null, 2));
const video = (phase, browser) =>
  files.find(
    (p) =>
      p.startsWith('browser/') &&
      p.includes(
        phase === 'candidate' ? 'andidate-live-sample-motion' : 'rejected-live-sample-motion',
      ) &&
      p.endsWith(`-${browser}/video.webm`),
  );
const section = (c) =>
  `<details ${c.browser === 'chromium' && c.width === 1280 && c.scene === 'tree' ? 'open' : ''}><summary>${c.browser} · ${c.width}×${(c.width * 9) / 16} · ${c.direction} · ${c.scene}</summary><div class="scroll"><img src="${c.file}" alt="Matched original, rejected and candidate character"></div><p>${c.full.map((p, i) => `<a href="${p}">${phases[i]} full frame</a>`).join(' · ')}</p></details>`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Player rework — art review checkpoint</title><style>:root{color-scheme:dark;font:16px/1.6 system-ui;background:#101c15;color:#eeeade}body{max-width:1320px;margin:32px auto;padding:0 24px}h1{font-size:34px}h2{margin-top:40px}a{color:#b6e9b3}.cta{display:inline-block;background:#315737;color:white;padding:10px 18px;border-radius:6px;font-weight:600}.scroll{overflow:auto;border:1px solid #415647;border-radius:6px}img{display:block;max-width:none;image-rendering:pixelated}video{width:1280px;max-width:100%}p{max-width:1000px}summary{cursor:pointer;padding:10px}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #526451}small{color:#bec8bc}code{font-size:14px}</style>
<h1>Player rework — playable art review</h1><p><strong>69 working sample frames; awaiting your art assessment.</strong> South, east and northeast each have six idle, eight walk and nine first-punch poses. This is the agreed checkpoint before extending the treatment to the complete set.</p>
<p><a class="cta" href="http://localhost:4328/scripts/player-study/review.html">Open the playable comparison</a></p><p>If the local server has stopped: <code>node scripts/player-art/prepare-player-study.mjs</code>, then <code>npx vite --config scripts/player-study/vite.config.mjs</code>.</p>
<h2>Actual gameplay size</h2><p>Original / rejected / candidate. Captured with matching world, resolution, zoom, light, direction and idle frame zero. Images below retain their actual pixel size; scroll instead of shrinking them. The original artwork is adapted to current cells for comparison, not presented as a recreation of its former animation clock.</p>
${comparisons
  .filter((c) => c.browser === 'chromium' && c.scene === 'tree')
  .map(section)
  .join('')}
<h2>What was reworked</h2><p>The rejected artwork relies on a broad flat cream head fill, heavy dark contour and weak body separation. Its preparation independently stretched generated poses to preset dimensions. The candidate redraw uses substantial crown, midtone and side-shadow clusters, selective warm outlines, attached shoulder/arm shapes, clearer feet, braced punch poses and alternating walk contacts. The original rounded white protagonist, dash eyes, small cheeks and short limbs remain the reference.</p><p>There is no new game lighting/filter trick. Every generated sheet is reduced once with the same uniform scale, fringe is removed, and native frames are registered by translation only. The final packer copies pixels without resizing or recolouring. All 69 native frames and explicit crop/registration records are retained. The old importer remains solely for reproducing the rejected complete set.</p>
<h2>Native artwork</h2><div class="scroll"><img src="native-comparison.png" width="720" height="320" alt="Native source-pixel comparison"></div><p><a href="native-comparison-2x.png">2× inspection copy</a> · <a href="native-gallery.png">All 69 native poses</a> · <a href="gallery-3x.png">3× pose inspection</a> · <a href="../../docs/assets/source/player-rework/manifest.json">Frame rectangles, translations and palette</a></p>
<h2>Motion in the actual game</h2><p>Each recording shows S, E and NE idle, walking and a first punch at normal speed, using actual keyboard gameplay. Candidate videos are 1280×720. The playable comparison includes controls for resetting the scene and inspecting either version.</p>${['chromium', 'firefox'].map((b) => `<h3>${b} — candidate</h3><video controls preload="metadata" src="${video('candidate', b)}"></video><p><a href="${video('rejected', b)}">Rejected-remaster recording, same route</a></p>`).join('')}
<h2>Environment and visibility</h2><p>Tree, rock, bridge, partial canopy occlusion and rainy/dark captures are preserved for all three sample directions, both browsers and both resolutions. <a href="capture-match-audit.json">Capture-condition audit</a>. The supplied October 31 20:16:40 recording was located and inspected; the comparison fixture uses controlled existing assets rather than claiming to recreate its unavailable save state.</p>${comparisons
  .filter((c) => !(c.browser === 'chromium' && c.scene === 'tree'))
  .map(section)
  .join('')}
<h2>Integration and validation</h2><p>Normal game assets are unchanged during this review. The dedicated Vite plugin alone selects the nine candidate strips. Decoded Pixi texture hashes verify the artwork actually used, including worker loading. Foot reference (32,54), scale 1 and existing timing metadata are retained. Combat, movement, collision, world rendering and save code were not edited for this sample.</p><ul><li><a href="unit.log">73 unit/integration files, 797 tests passed</a>; the new asset test verifies all 69 native frames, palette/alpha, clipping, foot registration and pixel-exact packing.</li><li><a href="browser.log">20 sample browser checks passed</a> · <a href="matched.log">12 final camera/phase-matched capture checks passed</a> · <a href="regressions.log">90 existing eight-direction, combo, bridge and water regressions passed</a></li><li><a href="typecheck.log">TypeScript</a> · <a href="lint.log">Lint</a> · <a href="build.log">Production build</a></li><li><a href="../../docs/assets/source/player-rework/provenance.json">Source prompts, hashes and provenance</a> · <a href="ownership.json">Changes and preserved-file audit</a> · <a href="sample-only.patch">Incremental sample-only patch</a></li></ul>
<h2>What still needs your assessment</h2><p>The stronger head shadow is intentionally visible at game scale; it may need softer transitions if it reads as a band rather than rounded volume. Native pose silhouettes still vary by roughly a pixel. The front sample is slightly slimmer than the original: 21–22 pixels wide versus 24; profile samples are 21–22 versus 20. Resting height is 31–32 pixels. These are review considerations, not a claim that proportions are pixel-identical.</p><p>The remaining five directions, sprint, jump and combo stages 2/3 have not been redrawn yet. They still use the previous artwork in the review game, clearly labelled as outside this sample. Hurt/death retain existing fallbacks. The complete art set and its final acceptance are pending this review. No commits, pushes, deployments or merges were made.</p><p><strong>Review decision:</strong> assess whether this treatment preserves the character and provides the required improvement in shape, volume and animation. Approve it for full-set production, or identify what needs revision in this playable sample first.</p></html>`;
await fs.writeFile(`${root}/index.html`, html);
console.log(
  `Built ${comparisons.length} matched comparison strips; all ${matchAudit.length} capture-condition checks passed.`,
);
