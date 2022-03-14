const { getDynamoDBClient, getDynamoDBInstance } = require('./aws_utils');
const { setupDynamoData, deleteDynamoData } = require('./test_helpers');
const table_name = 'aws-tests';

const ddbClient = getDynamoDBClient({
  endpoint: 'http://localhost:8000',
  sslEnabled: false,
  region: 'local-env',
  credentials: {
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey'
  }
});

const ddb = getDynamoDBInstance(ddbClient);

describe('aws', () => {
  jest.setTimeout(10000)
  beforeEach(async () => {
    return await setupDynamoData(ddbClient, ddb, table_name);
  });

  afterEach(async () => {
    return await deleteDynamoData(ddbClient, table_name);
  });

  afterAll(() => {
    return ddbClient.destroy();
  });

  const aws = require('./aws');

  it('should select an unused environment and mark it as in use', async () => {
    const pr = 'moonswitch/select-qa-env/pr-42';
    const branch = 'test-branch-1';
    const data = await aws(ddb, table_name, pr, branch);

    expect(data.url).toMatch(/qa[1-5]\.dev\.moonswitch\.com/);
    expect(data.env_name).toMatch(/qa[1-5]/);

    const doc = (await ddb.get({ TableName: table_name, Key: { env_name: data.env_name } })).Item;

    expect(doc.in_use).toBe(true);
    expect(doc.branch).toBe(branch);
    expect(doc.pull_requests).toEqual(expect.arrayContaining([pr]));
  });

  it('should select the same environment on subsequent runs for the same pr', async () => {
    const pr = 'moonswitch/select-qa-env/pr-42';
    const branch = 'test-branch-1';

    // First run    
    const data1 = await aws(ddb, table_name, pr, branch);

    expect(data1.url).toMatch(/qa[1-5]\.dev\.moonswitch\.com/);
    expect(data1.env_name).toMatch(/qa[1-5]/);

    // Second Run
    const data2 = await aws(ddb, table_name, pr, branch);

    expect(data2.url).toEqual(data1.url);
    expect(data2.env_name).toEqual(data1.env_name);
    

    const doc = (await ddb.get({ TableName: table_name, Key: { env_name: data2.env_name } })).Item;

    expect(doc.pull_requests).toHaveLength(1);
  });

  it('should select the same environment based on a matching branch for a different pr', async () => {
    const pr1 = 'moonswitch/select-qa-env/pr-42';
    const pr2 = 'moonswitch/other-repo/pr-24';
    const branch = 'test-branch-1';

    // Run from first repo 
    const data1 = await aws(ddb, table_name, pr1, branch);

    expect(data1.url).toMatch(/qa[1-5]\.dev\.moonswitch\.com/);
    expect(data1.env_name).toMatch(/qa[1-5]/);

    // Run from second repo
    const data2 = await aws(ddb, table_name, pr2, branch);

    expect(data2.url).toEqual(data1.url);
    expect(data2.env_name).toEqual(data1.env_name);

    const doc = (await ddb.get({ TableName: table_name, Key: { env_name: data1.env_name } })).Item;

    expect(doc.in_use).toBe(true);
    expect(doc.branch).toBe(branch);
    expect(doc.pull_requests).toEqual(expect.arrayContaining([pr1, pr2]));
  });

  it('should fail if there are no available environments', async () => {
    // Mark all envs as in_use: true
    const docs = (await ddb.scan({ TableName: table_name })).Items;
    const updateDocs = docs.map((doc) => {
      doc.in_use = true;
      return {
        PutRequest: {
          Item: doc,
        },
      };
    });
    const updateCommand = { RequestItems: {} };
    updateCommand.RequestItems[table_name] = updateDocs;
    await ddb.batchWrite(updateCommand);

    // Run from pr
    const pr = 'moonswitch/select-qa-env/pr-42';
    const branch = 'test-branch-1';

    await expect(aws(ddb, table_name, pr, branch)).rejects.toThrow('No QA environments available.');
  });
});