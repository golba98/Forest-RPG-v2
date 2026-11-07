// Read-only pixel analysis of approved artwork. No PNG is rewritten.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const dirs = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
};
const targets = { walk: {}, run: {} };
const audit = [];
for (const [direction, suffix] of Object.entries(dirs)) {
  const idle = await sharp(`public/assets/images/characters/player/idle/idle_${suffix}.png`)
    .extract({ left: 0, top: 0, width: 64, height: 64 })
    .raw()
    .toBuffer();
  for (const clip of ['walk', 'run']) {
    const scores = [];
    for (let frame = 0; frame < 8; frame++) {
      const pixels = await sharp(
        `public/assets/images/characters/player/${clip}/${clip}_${suffix}.png`,
      )
        .extract({ left: frame * 64, top: 0, width: 64, height: 64 })
        .raw()
        .toBuffer();
      let difference = 0;
      for (let p = 0; p < pixels.length; p += 4) {
        // Compare silhouette and opaque colour, ignoring RGB in transparent padding.
        difference += Math.abs(pixels[p + 3] - idle[p + 3]) * 3;
        if (pixels[p + 3] && idle[p + 3])
          for (let c = 0; c < 3; c++) difference += Math.abs(pixels[p + c] - idle[p + c]);
      }
      scores.push(difference);
    }
    // At most two chronological poses over 80 ms. Prefer the earliest pose on ties.
    targets[clip][direction] = Array.from({ length: 8 }, (_, f) =>
      [0, 1, 2].reduce(
        (best, step) => (scores[(f + step) % 8] < scores[(f + best) % 8] ? step : best),
        0,
      ),
    );
    for (let frame = 0; frame < 8; frame++) {
      const steps = targets[clip][direction][frame];
      audit.push({
        clip,
        direction,
        frame,
        steps,
        before: scores[frame],
        after: scores[(frame + steps) % 8],
      });
    }
  }
}
await fs.writeFile('src/animation/playerSettleSteps.json', JSON.stringify(targets, null, 2) + '\n');
console.log('Analysed existing pose-to-idle joins without changing artwork.');

await fs.mkdir('artifacts/player-flow', { recursive: true });
await fs.writeFile(
  'artifacts/player-flow/pose-join-audit.json',
  JSON.stringify(audit, null, 2) + '\n',
);
console.log(
  'Average reduction in final pose-to-idle pixel difference:',
  (
    100 *
    (1 - audit.reduce((s, r) => s + r.after, 0) / audit.reduce((s, r) => s + r.before, 0))
  ).toFixed(1) + '%',
);
