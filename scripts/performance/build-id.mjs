import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
export async function buildId(root, destination) {
  const files = [];
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(full);
      else {
        const data = await readFile(full);
        files.push({
          path: path.relative(root, full),
          bytes: data.length,
          sha256: createHash('sha256').update(data).digest('hex'),
        });
      }
    }
  }
  await visit(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const result = {
    root,
    hash: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
    files,
  };
  if (destination) {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(result, null, 2));
  }
  return result;
}
if (process.argv[1]?.endsWith('/build-id.mjs'))
  console.info((await buildId(process.argv[2], process.argv[3])).hash);
