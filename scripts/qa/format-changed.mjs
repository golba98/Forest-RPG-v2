import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

export function changedPaths(base) {
  // A new branch's push event can have an all-zero before SHA.
  const reference = base && !/^0+$/.test(base) ? base : 'origin/main';
  const mergeBase = git('merge-base', reference, 'HEAD').trim();
  const tracked = git('diff', '--name-only', '-z', '--diff-filter=ACMR', mergeBase);
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z');
  return [...new Set(`${tracked}${untracked}`.split('\0').filter(Boolean))];
}

export async function eligiblePaths(paths) {
  const approval = JSON.parse(
    fs.readFileSync(
      path.join(root, 'docs/assets/source/player-face-continuity/approval.json'),
      'utf8',
    ),
  );
  const eligible = [];
  for (const file of paths) {
    if (file in approval.files || !fs.existsSync(path.join(root, file))) continue;
    const info = await prettier.getFileInfo(path.join(root, file), {
      ignorePath: path.join(root, '.prettierignore'),
    });
    if (!info.ignored && info.inferredParser) eligible.push(file);
  }
  return eligible;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await eligiblePaths(changedPaths(process.env.CHECK_BASE_SHA));
  if (files.length) {
    // Arguments are passed directly, including paths with spaces; no shell interpolation.
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules/prettier/bin/prettier.cjs'),
        process.argv.includes('--write') ? '--write' : '--check',
        ...files,
      ],
      { cwd: root, stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else console.info('No changed files eligible for formatting.');
}
