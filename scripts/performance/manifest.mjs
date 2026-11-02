import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
export async function manifest(destination, baseline = false) {
  const paths = execFileSync('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ])
    .toString()
    .split('\0')
    .filter((p) => /^(src\/|public\/|package[^/]*\.json$|vite\.config\.ts$)/.test(p))
    .filter((p) => !baseline || !p.startsWith('src/performance/'))
    .sort();
  const originals = new Map();
  if (baseline) {
    const base = 'artifacts/performance/baseline/build/assets';
    for (const file of await readdir(base))
      if (file.endsWith('.map')) {
        const map = JSON.parse(await readFile(base + '/' + file, 'utf8'));
        map.sources.forEach((source, i) => {
          const name = path.relative(process.cwd(), path.resolve(base, source));
          if (name.startsWith('src/') && map.sourcesContent?.[i])
            originals.set(name, map.sourcesContent[i]);
        });
      }
  }
  const files = [];
  for (const path of paths) {
    const bytes = originals.has(path) ? Buffer.from(originals.get(path)) : await readFile(path);
    files.push({
      path,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const command = (name, args) => {
    try {
      return execFileSync(name, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (error) {
      return 'Unavailable: ' + error.message;
    }
  };
  const data = {
    capturedAt: new Date().toISOString(),
    commit: command('git', ['rev-parse', 'HEAD']),
    branch: command('git', ['branch', '--show-current']),
    sourceHash: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
    files,
    node: process.version,
    os: os.release(),
    platform: os.platform(),
    cpu: os.cpus()[0]?.model,
    ram: os.totalmem(),
    gpu: command('nvidia-smi', [
      '--query-gpu=name,driver_version,memory.total,pstate,temperature.gpu',
      '--format=csv',
    ]),
    displays: command('xrandr', ['--current']),
    load: os.loadavg(),
    status: command('git', ['status', '--porcelain']),
  };
  await mkdir(destination, { recursive: true });
  await writeFile(destination + '/manifest.json', JSON.stringify(data, null, 2));
  return data;
}
if (process.argv[1]?.endsWith('/manifest.mjs'))
  await manifest(
    process.argv[2] ?? 'artifacts/performance/manifests/current',
    process.argv.includes('--baseline'),
  );
