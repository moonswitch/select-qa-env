const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');
const { setupDynamoData, deleteDynamoData } = require('./test_helpers');
const table_name = 'aws-tests';

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  sslEnabled: false,
  region: 'local-env',
  credentials: {
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey'
  }
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

describe('aws', () => {
  jest.setTimeout(10000)
  beforeEach(async () => {
    return await setupDynamoData(client, db, table_name);
  });

  afterEach(async () => {
    return await deleteDynamoData(client, table_name);
  });

  afterAll(() => {
    return client.destroy();
  });

  const aws = require('./aws');

  it('should select an unused environment and mark it as in use', async () => {
    const pr = 'moonswitch/select-qa-env/pr-42';
    const branch = 'test-branch-1';
    const data = await aws(table_name, pr, branch);

    expect(data.url).toMatch(/qa[1-5]\.dev\.moonswitch\.com/);
    expect(data.env_name).toMatch(/qa[1-5]/);

    const doc = (await db.get({ TableName: table_name, Key: { env_name: data.env_name } })).Item;

    expect(doc.in_use).toBe(true);
    expect(doc.branch).toBe(branch);
    expect(doc.pull_requests).toEqual(expect.arrayContaining([pr]));
  });

  it('should select the same environment on subsequent runs for the same pr', async () => {
    const pr = 'moonswitch/select-qa-env/pr-42';
    const branch = 'test-branch-1';

    // First run    
    const data1 = await aws(table_name, pr, branch);

    expect(data1.url).toMatch(/qa[1-5]\.dev\.moonswitch\.com/);
    expect(data1.env_name).toMatch(/qa[1-5]/);

    // Second Run
    const data2 = await aws(table_name, pr, branch);

    expect(data2.url).toEqual(data1.url);
    expect(data2.env_name).toEqual(data1.env_name);
  });

  it('should select the same environment based on a matching branch for a different pr', async () => {
    const pr1 = 'moonswitch/select-qa-env/pr-42';
    const pr2 = 'moonswitch/other-repo/pr-24';
    const branch = 'test-branch-1';

    // Run from first repo 
    const data1 = await aws(table_name, pr1, branch);

    expect(data1.url).toMatch(/qa[1-5]\.dev\.moonswitch\.com/);
    expect(data1.env_name).toMatch(/qa[1-5]/);

    // Run from second repo
    const data2 = await aws(table_name, pr2, branch);

    expect(data2.url).toEqual(data1.url);
    expect(data2.env_name).toEqual(data1.env_name);

    const doc = (await db.get({ TableName: table_name, Key: { env_name: data1.env_name } })).Item;

    expect(doc.in_use).toBe(true);
    expect(doc.branch).toBe(branch);
    expect(doc.pull_requests).toEqual(expect.arrayContaining([pr1, pr2]));
  });

  it('should fail if there are no available environments', async () => {
    // Mark all envs as in_use: true
    const docs = (await db.scan({ TableName: table_name })).Items;
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
    await db.batchWrite(updateCommand);

    // Run from pr
    const pr = 'moonswitch/select-qa-env/pr-42';
    const branch = 'test-branch-1';

    await expect(aws(table_name, pr, branch)).rejects.toThrow('No QA environments available.');
  });
});