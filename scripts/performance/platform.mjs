import { openBrowser, checkpoint } from './browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const root = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/platform';
await mkdir(root, { recursive: true });
const rows = [];
for (let repeat = 0; repeat < 3; repeat++) {
  const session = await openBrowser({ profileDir: root + '/browser-profile-' + repeat });
  try {
    const first = await checkpoint(session, false);
    await session.page.waitForTimeout(10000);
    rows.push({
      repeat,
      environment: session.config,
      first,
      settled: await checkpoint(session, false),
    });
    await writeFile(root + '/blank-browser.json', JSON.stringify(rows, null, 2));
  } finally {
    await session.browser.close();
  }
}
