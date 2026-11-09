import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { stagingDirectory } from './output-directory.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forest-output-'));
  for (const dir of ['src', 'public', 'docs/assets/source', 'tests/fixtures'])
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('default output stages in artifacts without creating files', (t) => {
  const root = fixture(t);
  const output = stagingDirectory(undefined, 'artifacts/player/sheets', root);
  assert.equal(output, path.join(root, 'artifacts/player/sheets'));
  assert.equal(fs.existsSync(output), false);
});

test('explicit temporary destinations remain supported', (t) => {
  const root = fixture(t);
  assert.equal(
    stagingDirectory(path.join(root, 'review'), 'unused', root),
    path.join(root, 'review'),
  );
});

test('production, source art, fixtures and their ancestors are rejected', (t) => {
  const root = fixture(t);
  for (const output of [
    '.',
    '..',
    'src/generated',
    'public/assets/images',
    'docs',
    'docs/assets/source/player',
    'tests',
    'tests/fixtures/new',
  ]) {
    assert.throws(() => stagingDirectory(output, 'unused', root), /protected/);
  }
});

test('existing ancestor symlinks cannot redirect output into production', (t) => {
  const root = fixture(t);
  fs.symlinkSync(path.join(root, 'public'), path.join(root, 'redirect'), 'dir');
  assert.throws(() => stagingDirectory('redirect/new', 'unused', root), /protected/);
});

test('nested symlinks in an existing destination are rejected', (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'review'));
  fs.symlinkSync(path.join(root, 'public'), path.join(root, 'review/player'), 'dir');
  assert.throws(() => stagingDirectory('review', 'unused', root), /symlink/);
});

test('dangling symlinks to protected descendants are rejected', (t) => {
  const root = fixture(t);
  fs.symlinkSync(path.join(root, 'public/not-created'), path.join(root, 'dangling'), 'dir');
  assert.throws(() => stagingDirectory('dangling', 'unused', root), /protected/);
});

test('historical CLI entrypoints reject production output before processing art', () => {
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  for (const script of [
    'assets/sanitize-assets.js',
    'player-art/prepare-player-remaster.mjs',
    'player-art/prepare-player-study.mjs',
    'player-art/import-player-study.mjs',
    'player-art/import-model.mjs',
    'player-art/build-player-final.mjs',
  ]) {
    const result = spawnSync(process.execPath, [`scripts/${script}`, 'public/assets'], {
      cwd: repository,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, script);
    assert.match(result.stderr, /Output overlaps protected repository files/, script);
  }
});
