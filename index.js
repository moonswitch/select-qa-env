const core = require('@actions/core');
const github = require('@actions/github');
const { getDynamoDBClient, getDynamoDBInstance } = require('./aws_utils');
const aws = require('./aws');
const gcp = require('./gcp');

async function run() {
  try {
    const provider = core.getInput('cloud_provider');
    const table_name = core.getInput('table');
    const number = github.context.issue.number;
    const repo = github.context.payload.repository.full_name;
    const pr = `${repo}/pr-${number}`
    const branch = github.context.payload.pull_request.head.ref;

    let data;
    let ddbClient;
    let ddb;
    switch (provider) {
      case 'gcp':
        data = await gcp(table_name, pr, branch);
        break;
      case 'aws':
        ddbClient = getDynamoDBClient();        
        ddb = getDynamoDBInstance(ddbClient);
        data = await aws(ddb, table_name, pr, branch);
        break;
      default:
        throw new Error(`Unrecognized provider ${provider}. Only 'gcp' and 'aws' are supported.`);
    }
    core.setOutput('url', data.url);
    core.setOutput('env_name', data.env_name)
    core.notice(`PR ${pr} for branch ${branch} assigned to QA environment ${data.env_name} with url ${data.url}`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
