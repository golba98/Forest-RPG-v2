import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

import { pathToFileURL } from 'node:url';

export function prepareRuleset(ruleset, actionsId) {
  const status = ruleset.rules.find((r) => r.type === 'required_status_checks')?.parameters;
  const rules = ruleset.rules.filter((r) => r.type !== 'required_status_checks');
  rules.push({
    type: 'required_status_checks',
    parameters: {
      ...status,
      strict_required_status_checks_policy: true,
      do_not_enforce_on_create: false,
      required_status_checks: [
        ...(status?.required_status_checks ?? []).filter(
          (check) => check.context !== 'critical-regressions',
        ),
        { context: 'critical-regressions', integration_id: actionsId },
      ],
    },
  });
  return {
    name: ruleset.name,
    target: ruleset.target,
    enforcement: 'active',
    conditions: ruleset.conditions,
    bypass_actors: [],
    rules,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Read-only against GitHub. Applying these payloads is a separate publication step.
  const repository = 'golba98/Forest-RPG-v2';
  const api = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
  const ruleset = api(`repos/${repository}/rulesets/25995348`);
  const owner = api('users/golba98');
  const actions = api('apps/github-actions');
  const directory = 'artifacts/merge-protection';
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/ruleset.json`,
    JSON.stringify(prepareRuleset(ruleset, actions.id), null, 2) + '\n',
  );
  writeFileSync(
    `${directory}/environment.json`,
    JSON.stringify(
      {
        reviewers: [{ type: 'User', id: owner.id }],
        prevent_self_review: false,
        can_admins_bypass: false,
        deployment_branch_policy: null,
      },
      null,
      2,
    ) + '\n',
  );
  console.info(
    `Prepared ${directory}/ruleset.json and environment.json. No GitHub settings changed.`,
  );
  console.info(
    'Publish and verify the workflow before requiring its status check. See docs/development/safe-integration.md.',
  );
}
