import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedPaths, eligiblePaths } from './format-changed.mjs';

test('format selection excludes approved code, source art, binaries and missing paths', async () => {
  const files = await eligiblePaths([
    'src/animation/PlayerMotion.ts',
    'src/rendering/PlayerCompositor.ts',
    'docs/assets/source/player-face-continuity/approval.json',
    'public/assets/images/items/coin.png',
    'missing-file.ts',
    'scripts/qa/format-changed.mjs',
    'docs/testing.md',
  ]);
  assert.deepEqual(files, ['scripts/qa/format-changed.mjs', 'docs/testing.md']);
});

test('new branch pushes with zero before SHA use the integration base', () => {
  assert.deepEqual(
    changedPaths('0000000000000000000000000000000000000000'),
    changedPaths('origin/main'),
  );
});
