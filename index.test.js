const process = require('process');
const cp = require('child_process');
const path = require('path');
const { Firestore } = require('@google-cloud/firestore');
const { setupFirebaseData, deleteFirebaseData } = require('./test_helpers');
const table_name = 'action-tests';

const db = new Firestore();

const github_context = {
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_EVENT_PATH: './test_data/pull_request.json'
};

const input_params = {
  INPUT_CLOUD_PROVIDER: 'gcp',
  INPUT_TABLE: 'qa-envs'
}

// shows how the runner will run a javascript action with env / stdout protocol
describe.skip('github action', () => {
  jest.setTimeout(10000)
  jest.mock('./gcp');
  beforeEach(async () => {
    return await setupFirebaseData(db, table_name);
  });
  
  afterEach(async () => {
    return await deleteFirebaseData(db, table_name);
  });

  it('runs', () => {
    const env = {
      ...process.env,
      ...github_context,
      ...input_params,
    }
    const ip = path.join(__dirname, 'index.js');
    const result = cp.execSync(`node ${ip}`, {env}).toString();
    console.log(result);
  })
})
