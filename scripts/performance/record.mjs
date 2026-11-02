import { openBrowser, boot, collect } from './browser.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const root = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/video';
await mkdir(root, { recursive: true });
const session = await openBrowser({
  profileDir: root + '/browser-profile',
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: root + '/recordings', size: { width: 1280, height: 720 } },
});
const video = session.page.video();
try {
  await boot(session, { cap: 60, warmup: 5000 });
  const route = JSON.parse(await readFile('artifacts/performance/routes/seed-42.json', 'utf8'));
  await session.page.screenshot({ path: root + '/start.png' });
  await session.page.evaluate((points) => {
    window.__PERF__.start('evidence-video');
    window.__PERF__.route({ points });
  }, route.points);
  const run = await collect(session, root, 30000, { resourceEveryMs: 30000 });
  await writeFile(
    root + '/capture-notice.json',
    JSON.stringify(
      {
        evidenceOnly: true,
        excludeFromHeadlineTiming: true,
        reason: 'Playwright video capture adds screencast/encoding work',
        runStatus: run.status,
      },
      null,
      2,
    ),
  );
  await session.page.screenshot({ path: root + '/end.png' });
} finally {
  await session.browser.close();
  if (video) await video.saveAs(root + '/exploration.webm');
}
