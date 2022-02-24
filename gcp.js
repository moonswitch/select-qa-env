const core = require('@actions/core');
const { FieldValue, Firestore } = require('@google-cloud/firestore');

const db = new Firestore();

let gcp = async function (table_name, pr, branch) {
  const table = db.collection(table_name);
  let env;
  let data;

  // First check if there is already an environment assigned to this PR.
  core.debug(`Checking if there is already an environment assinged to ${pr}...`);
  const current_envs = await table.where('pull_requests', 'array-contains', pr).where('in_use', '==', true).limit(1).get();

  if (!current_envs.empty) {
    core.debug(`Found an active QA environment for ${pr}`);
    env = current_envs.docs[0];
  } else {
    // Check for another env using the same branch name
    core.debug(`No active QA environment for ${pr}. Looking for an active QA environment with the same branch (${branch})..`);
    const branch_envs = await table.where('branch', '==', branch).where('in_use', '==', true).limit(1).get();
    if (!branch_envs.empty) {
      core.debug(`Found an active QA environment for branch ${branch}. Adding ${pr} to it...`);
      env = branch_envs.docs[0];

    } else {
      // No environment currently assigned. Check for available environments.
      core.debug(`No active QA environment for ${pr}. Looking for an available environment...`);
      const envs = await table.where('in_use', '==', false).limit(1).get();

      // No environments available. Bail out.
      if (envs.empty) {
        throw new Error('No QA environments available.');
      }

      env = envs.docs[0];
    }
    // Mark the environment as in_use and set the PR for reference.
    core.debug(`Found an available environment. Marking it as in_use by ${pr}`);
    await env.ref.update({
      in_use: true,
      branch: branch,
      pull_requests: FieldValue.arrayUnion(pr),
    });
  }

  data = env.data();
  return data;
}

module.exports = gcp;
