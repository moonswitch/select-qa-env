async function setupFirebaseData(db, table_name) {
  const table = db.collection(table_name);

  if ((await table.listDocuments()).length > 0) {
    await deleteFirebaseData()
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

module.exports = {
  setupFirebaseData,
  deleteFirebaseData,
};