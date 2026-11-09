import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewChanges, inspectDiff } from './critical-diff.mjs';
import { prepareRuleset } from './prepare-merge-protection.mjs';

const basePolicy = {
  requiredPaths: ['world.ts'],
  criticalPrefixes: ['biomes/'],
  approvalPrefixes: ['baselines/'],
};
const input = {
  changed: [],
  deleted: [],
  basePolicy,
  headPolicy: basePolicy,
  approvedFiles: ['player.png'],
};
test('unrelated improvements need no visual approval', () => {
  assert.deepEqual(reviewChanges({ ...input, changed: ['combat.ts'] }), []);
});
test('changing an approval manifest cannot hide changes to the base-approved character', () => {
  assert.deepEqual(reviewChanges({ ...input, changed: ['player.png'] }), ['player.png']);
});
test('critical deletions remain visible even when the PR edits its inventory', () => {
  assert.deepEqual(
    reviewChanges({
      ...input,
      deleted: ['world.ts', 'biomes/meadow.png'],
      headPolicy: { ...basePolicy, requiredPaths: [], criticalPrefixes: [] },
    }),
    ['world.ts', 'biomes/meadow.png'],
  );
});
test('intentional baseline updates require explicit review', () => {
  assert.deepEqual(reviewChanges({ ...input, changed: ['baselines/idle.png'] }), [
    'baselines/idle.png',
  ]);
});
test('stacked PRs cannot be mistaken for integration into main', () => {
  assert.throws(
    () => inspectDiff('0'.repeat(40), 'HEAD', 'already-merged-feature'),
    /must target main/,
  );
});

test('requiring gameplay preserves other checks and review rules while removing all bypasses', () => {
  const review = { type: 'pull_request', parameters: { required_approving_review_count: 1 } };
  const original = {
    name: 'Main',
    target: 'branch',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'] } },
    bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 5 }],
    rules: [
      review,
      { type: 'deletion' },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: [{ context: 'existing-check', integration_id: 42 }],
        },
      },
    ],
  };
  const prepared = prepareRuleset(original, 15368);
  assert.deepEqual(prepared.bypass_actors, []);
  assert.deepEqual(prepared.conditions, original.conditions);
  assert.deepEqual(
    prepared.rules.find((r) => r.type === 'pull_request'),
    review,
  );
  assert.ok(prepared.rules.some((r) => r.type === 'deletion'));
  const status = prepared.rules.find((r) => r.type === 'required_status_checks').parameters;
  assert.equal(status.strict_required_status_checks_policy, true);
  assert.deepEqual(status.required_status_checks, [
    { context: 'existing-check', integration_id: 42 },
    { context: 'critical-regressions', integration_id: 15368 },
  ]);
});

test('preparing merge protection again does not duplicate required gameplay checks', () => {
  const original = { name: 'Main', target: 'branch', conditions: {}, rules: [] };
  const once = prepareRuleset(original, 15368);
  assert.deepEqual(prepareRuleset(once, 15368), once);
});
