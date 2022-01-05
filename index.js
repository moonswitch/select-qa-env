const core = require('@actions/core');
const Firestore = require('@google-cloud/firestore');
const github = require('@actions/github');

const db = new Firestore();

async function run() {
  try {
    const table_name = core.getInput('table');
    const table = db.collection(table_name);
    const number = github.context.issue.number;
    const pr = `pr-${number}`
    let env;
    let url;

    // First check if there is already an environment assigned to this PR.
    core.info(`Checking if there is already an environment assinged to ${pr}...`);
    const current_envs = await table.where('pr', '==', pr).where('in_use', '==', true).limit(1).get();

    if (!current_envs.empty) {
      core.info(`Found an active QA environment for ${pr}`)
      env = current_envs.docs[0];
    } else {
      // No environment currently assigned. Check for available environments.
      core.info(`No active QA environment for ${pr}. Looking for an available environment...`)
      const envs = await table.where('in_use', '==', false).limit(1).get()

      // No environments available. Bail out.
      if (envs.empty) {
        throw new Error('No QA environments available.');
      }
  
      env = envs.docs[0];
      // Mark the environment as in_use and set the PR for reference.
      core.info(`Found an available environment. Marking it as in_use by ${pr}`)
      env.ref.update({in_use: true, pr})
    }

    url = env.data().url; 
    core.setOutput('url', url);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
