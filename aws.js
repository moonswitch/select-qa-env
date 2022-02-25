const core = require('@actions/core');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');
const isTest = process.env.JEST_WORKER_ID;

let aws = async function (table_name, pr, branch) {
  // TODO: abstract client / db setup out to a setup method
  const client = new DynamoDBClient({
    ...(isTest && {
      endpoint: 'http://localhost:8000',
      sslEnabled: false,
      region: 'local-env',
      credentials: {
        accessKeyId: 'fakeMyKeyId',
        secretAccessKey: 'fakeSecretAccessKey'
      }
    })
  });
  
  const marshallOptions = {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false, // false, by default.
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: false, // false, by default.
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: false, // false, by default.
  };
  
  const unmarshallOptions = {
    // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
    wrapNumbers: false, // false, by default.
  };
  
  const translateConfig = { marshallOptions, unmarshallOptions };

  const db = DynamoDBDocument.from(client, translateConfig)

  const scanByPr = {
    TableName: table_name,
    FilterExpression: 'contains (pull_requests, :pull_request)',
    ExpressionAttributeValues: { ':pull_request': pr },
  }

  const scanByBranch = {
    TableName: table_name,
    FilterExpression: 'branch = :branch',
    ExpressionAttributeValues: { ':branch': branch },
  }

  const scanByInUse = {
    TableName: table_name,
    FilterExpression: 'in_use = :in_use',
    ExpressionAttributeValues: { ':in_use': false },
  }

  let env;

  // First check if there is already an environment assigned to this PR.
  core.debug(`Checking if there is already an environment assinged to ${pr}...`);
  const current_envs = await db.scan(scanByPr);

  if (current_envs.Count == 1) {
    core.debug(`Found an active QA environment for ${pr}`);
    env = current_envs.Items[0];
  } else if (current_envs.Count > 1) {
    throw new Error(`PR is assigned to multiple QA environments (${current_envs.Items.map(item => `${item.env_name}, `)})`);
  } else {
    // Check for another env using the same branch name
    core.debug(`No active QA environment for ${pr}. Looking for an active QA environment with the same branch (${branch})..`);
    const branch_envs = await db.scan(scanByBranch);

    if (branch_envs.Count > 0) {
      core.debug(`Found an active QA environment for branch ${branch}. Adding ${pr} to it...`);
      env = branch_envs.Items[0];
    } else {
      // No environment currently assigned. Check for available environments.
      core.debug(`No active QA environment for ${pr}. Looking for an available environment...`);
      const available_envs = await db.scan(scanByInUse);

      // No environments available. Bail out.
      if (available_envs.Count == 0) {
        throw new Error('No QA environments available.')
      }

      env = available_envs.Items[0];
    }
  }

  // Mark the environment as in_use and set the PR for reference.
  core.debug(`Found an available environment. Marking it as in_use by ${pr}`);
  env.pull_requests.push(pr);
  const update = {
    TableName: table_name,
    Key: {
      env_name: env.env_name,
    },
    UpdateExpression: 'set in_use = :in_use, branch = :branch, pull_requests = :pull_requests',
    ExpressionAttributeValues: {
      ':in_use': true,
      ':branch': branch,
      ':pull_requests': env.pull_requests,
    },
  };

  await db.update(update);

  return {
    url: env.url,
    env_name: env.env_name,
  };
};

module.exports = aws;
