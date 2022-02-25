const { Firestore } = require('@google-cloud/firestore');
const { setupFirebaseData, deleteFirebaseData } = require('./test_helpers');
const table_name = 'gcp-tests';

const db = new Firestore();

describe('gcp', () => {
  jest.setTimeout(10000)
  beforeEach(async () => {
    return await setupFirebaseData(db, table_name);
  });
  
  afterEach(async () => {
    return await deleteFirebaseData(db, table_name);
  });

  const gcp = require('./gcp');

  it('should select an unused environment and mark it as in use', async () => {
    const pr = 'moonswitch/select-qa-env/pr-42';
    const branch = 'test-branch-1';
    const data = await gcp(table_name, pr, branch);
    const table = db.collection(table_name);
    const docs = await table.where('env_name', '==', data.env_name).limit(1).get();

    expect(docs.empty).toBe(false);

    const doc = docs.docs[0].data();

    expect(data.url).toMatch(/qa[1-5]\.dev\.moonswitch\.com/);
    expect(data.env_name).toMatch(/qa[1-5]/);


    expect(doc.in_use).toBe(true);
    expect(doc.branch).toBe(branch);
    expect(doc.pull_requests).toEqual(expect.arrayContaining([pr]));
  });

  it('should select the same environment on subsequent runs for the same pr', async () => {
    const pr = 'moonswitch/select-qa-env/pr-42';
    const branch = 'test-branch-1';
    
    // First run    
    const data1 = await gcp(table_name, pr, branch);

    expect(data1.url).toMatch(/qa[1-5]\.dev\.moonswitch\.com/);
    expect(data1.env_name).toMatch(/qa[1-5]/);

    // Second Run
    const data2 = await gcp(table_name, pr, branch);

    expect(data2.url).toEqual(data1.url);
    expect(data2.env_name).toEqual(data1.env_name);
  });

  it('should select the same environment based on a matching branch for a different pr', async () => {
    const pr1 = 'moonswitch/select-qa-env/pr-42';
    const pr2 = 'moonswitch/other-repo/pr-24';
    const branch = 'test-branch-1';
    
    // Run from first repo 
    const data1 = await gcp(table_name, pr1, branch);

    expect(data1.url).toMatch(/qa[1-5]\.dev\.moonswitch\.com/);
    expect(data1.env_name).toMatch(/qa[1-5]/);

    // Run from second repo
    const data2 = await gcp(table_name, pr2, branch);

    expect(data2.url).toEqual(data1.url);
    expect(data2.env_name).toEqual(data1.env_name);

    const table = db.collection(table_name);
    const docs = await table.where('env_name', '==', data1.env_name).limit(1).get();
    const doc = docs.docs[0].data();

    expect(doc.in_use).toBe(true);
    expect(doc.branch).toBe(branch);
    expect(doc.pull_requests).toEqual(expect.arrayContaining([pr1, pr2]));
  });

  it('should fail if there are no available environments', async () => {
    // Mark all envs as in_use: true
    const table = db.collection(table_name);
    const docRefs = await table.listDocuments();
    const docs = await db.getAll(...docRefs);
    docs.forEach(async (doc) => {
      await doc.ref.update({in_use: true});
    });

    // Run from pr
    const pr = 'moonswitch/select-qa-env/pr-42';
    const branch = 'test-branch-1';

    async function runTask() {
      return await gcp(table_name, pr, branch);
    }
    
    expect(runTask).rejects.toThrow('No QA environments available.')
  });
});