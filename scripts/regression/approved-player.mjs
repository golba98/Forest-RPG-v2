import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(
  await readFile('docs/assets/source/player-face-continuity/approval.json', 'utf8'),
);
if (manifest.status !== 'approved' || Object.keys(manifest.files ?? {}).length === 0)
  throw new Error('The approved player manifest is missing or empty');
const failures = [];
for (const [path, expected] of Object.entries(manifest.files)) {
  try {
    const actual = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
    if (actual !== expected) failures.push(`${path}: differs from approved character`);
  } catch {
    failures.push(`${path}: missing`);
  }
}
if (failures.length) throw new Error(failures.join('\n'));
console.info(`Verified ${Object.keys(manifest.files).length} approved character files`);
