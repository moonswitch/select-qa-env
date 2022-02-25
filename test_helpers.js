const { CreateTableCommand, DeleteTableCommand, ListTablesCommand, waitUntilTableExists, waitUntilTableNotExists } = require("@aws-sdk/client-dynamodb");

let wait = function (milliseconds) {
  return new Promise((resolve) => {
    if (typeof milliseconds !== 'number') {
      throw new Error('milliseconds not a number');
    }
    setTimeout(() => resolve("done!"), milliseconds)
  });
};

async function setupFirebaseData(db, table_name) {
  const table = db.collection(table_name);

  if ((await table.listDocuments()).length > 0) {
    await deleteFirebaseData(db, table_name)
  }

  const qa_envs = ['qa1', 'qa2', 'qa3', 'qa4', 'qa5'];
  qa_envs.forEach(async (qa_env) => {
    await table.add({
      branch: '',
      env_name: qa_env,
      in_use: false,
      pull_requests: [],
      url: `${qa_env}.dev.moonswitch.com`
    });
  });
}

async function deleteFirebaseData(db, table_name) {
  const table = db.collection(table_name);
  return await db.recursiveDelete(table);
}

async function setupDynamoData(client, db, table_name) {

  await deleteDynamoData(client, table_name);

  // Create table
  const createTableCommand = new CreateTableCommand({
    TableName: table_name,
    KeySchema: [
      { AttributeName: "env_name", KeyType: "HASH" },
    ],
    AttributeDefinitions: [
      { AttributeName: "env_name", AttributeType: "S" },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1
    },
  });
  await client.send(createTableCommand);
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: table_name });

  // Add qa envs to table
  const qa_envs = ['qa1', 'qa2', 'qa3', 'qa4', 'qa5'];
  qa_envs.forEach(async (qa_env) => {
    await db.put({
      TableName: table_name,
      Item: {
        env_name: qa_env,
        branch: '',
        in_use: false,
        url: `${qa_env}.dev.moonswitch.com`,
        pull_requests: [],
      },
    });
  });

  // DynamoDb (and emulator) are eventually consistent so wait for all records to be ready
  while ((await db.scan({ TableName: table_name })).Count != qa_envs.length) {
    await wait(100);
  }
}

async function deleteDynamoData(client, table_name) {
  const listTablesCommand = new ListTablesCommand({});
  const tables = await client.send(listTablesCommand);

  if (tables.TableNames.includes(table_name)) {
    const deleteTableCommand = new DeleteTableCommand({ TableName: table_name });
    await client.send(deleteTableCommand);
    await waitUntilTableNotExists({ client, maxWaitTime: 60 }, { TableName: table_name });
  }
}

module.exports = {
  setupFirebaseData,
  deleteFirebaseData,
  setupDynamoData,
  deleteDynamoData,
  wait,
};