import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const { GameLoop } = await server.ssrLoadModule('/src/core/loop/GameLoop.ts'),
    rows = [];
  for (const refresh of [60, 120, 144, 170, 240])
    for (const cap of [0, 60, 120]) {
      const loop = new GameLoop({ onFixedUpdate() {}, onRender() {} });
      loop.setMaxFps(cap);
      let count = 0;
      const samples = [];
      let previous;
      for (let i = 0; i < refresh * 60; i++) {
        const t = (i * 1000) / refresh;
        if (loop.shouldRunFrame(t)) {
          count++;
          if (previous !== undefined) samples.push(t - previous);
          previous = t;
        }
      }
      rows.push({
        refresh,
        cap,
        count,
        deliveredFps: count / 60,
        minimumIntervalMs: Math.min(...samples),
        maximumIntervalMs: Math.max(...samples),
      });
    }
  await mkdir('artifacts/performance/refresh', { recursive: true });
  await writeFile(
    'artifacts/performance/refresh/ideal-input-model.json',
    JSON.stringify(
      {
        method:
          'Synthetic ideal-rAF inputs to the actual unchanged GameLoop.shouldRunFrame. This is a logic reproduction, not measured browser FPS.',
        rows,
      },
      null,
      2,
    ),
  );
  console.info(rows);
} finally {
  await server.close();
}
