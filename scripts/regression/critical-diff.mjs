import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function reviewChanges({ changed, deleted, basePolicy, headPolicy, approvedFiles }) {
  const visual = new Set(approvedFiles);
  const required = new Set([...basePolicy.requiredPaths, ...headPolicy.requiredPaths]);
  const criticalPrefixes = [...basePolicy.criticalPrefixes, ...headPolicy.criticalPrefixes];
  const approvalPrefixes = [...basePolicy.approvalPrefixes, ...headPolicy.approvalPrefixes];
  const reasons = changed.filter(
    (path) => visual.has(path) || approvalPrefixes.some((p) => path.startsWith(p)),
  );
  for (const path of deleted)
    if (required.has(path) || criticalPrefixes.some((p) => path.startsWith(p))) reasons.push(path);
  return [...new Set(reasons)];
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}
export function inspectDiff(base, head = 'HEAD', target = 'main') {
  if (target !== 'main')
    throw new Error(
      `Integration PR must target main, not ${target}. Retarget and revalidate the complete diff.`,
    );
  if (!/^[a-f0-9]{40}$/i.test(base))
    throw new Error('Use the exact 40-character target commit SHA');
  const policyPath = 'scripts/regression/critical-files.json';
  const headPolicy = JSON.parse(git('show', `${head}:${policyPath}`));
  const baseFiles = new Set(git('ls-tree', '-r', '--name-only', base).trim().split('\n'));
  // Bootstrap only: the first PR introduces this inventory. Later PRs always use both versions.
  const basePolicy = baseFiles.has(policyPath)
    ? JSON.parse(git('show', `${base}:${policyPath}`))
    : headPolicy;
  const approval = JSON.parse(
    git('show', `${base}:docs/assets/source/player-face-continuity/approval.json`),
  );
  const files = new Set(git('ls-tree', '-r', '--name-only', head).trim().split('\n'));
  const missing = headPolicy.requiredPaths.filter((p) => !files.has(p));
  if (missing.length) throw new Error(`Missing required capabilities: ${missing.join(', ')}`);
  const changed = git('diff', '--name-only', '-z', base, head).split('\0').filter(Boolean);
  const deleted = git('diff', '--name-only', '--diff-filter=D', '--no-renames', '-z', base, head)
    .split('\0')
    .filter(Boolean);
  return reviewChanges({
    changed,
    deleted,
    basePolicy,
    headPolicy,
    approvedFiles: Object.keys(approval.files),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reasons = inspectDiff(
    process.env.PR_BASE_SHA ?? process.argv[2],
    process.env.PR_HEAD_SHA ?? 'HEAD',
    process.env.PR_BASE_REF ?? 'main',
  );
  console.info(
    reasons.length
      ? `Human approval required for:\n${reasons.join('\n')}`
      : 'No approved visuals or critical deletions changed',
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `approval=${reasons.length > 0}\n`);
}
