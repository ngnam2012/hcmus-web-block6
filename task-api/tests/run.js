'use strict';

const { assert, withApp, expectStatus, snapshot } = require('./helpers');
const { cloneDB } = require('../src/db');
const services = require('../src/taskService');
const { signToken } = require('../src/auth');
const { ORACLE_TESTS, applyFixture } = require('./oracle');
const { runEvidence } = require('./idor-regression');

const tests = [];
const test = (name, run) => tests.push({ name, run });
const permissions = { Viewer: ['read'], Member: ['read', 'edit'], Owner: ['read', 'edit', 'delete', 'members'] };
const actions = ['read', 'edit', 'delete', 'members'];

function call(version, db, user, action, id, data) {
  const service = services[version];
  if (action === 'read') return service.getTask(db, user, id || 'A1');
  if (action === 'edit') return service.editTask(db, user, id || 'A1', data === undefined ? { title: 'Updated title' } : data);
  if (action === 'delete') return service.deleteProject(db, user, id || 'alpha');
  return service.manageMembers(db, user, id || 'alpha', data);
}

function checkAction(db, before, action, response, status) {
  expectStatus(response, status);
  if (status !== 200) return assert.deepEqual(db, before, 'Denied requests must leave all data unchanged');
  if (action === 'read') {
    assert.equal(response.body.id, 'A1');
    assert.equal(response.body.title, before.tasks.A1.title);
    assert.deepEqual(db, before);
  } else if (action === 'edit') {
    assert.equal(db.tasks.A1.title, 'Updated title');
    assert.equal(db.tasks.A1.project, before.tasks.A1.project);
    assert.deepEqual(db.projects, before.projects);
  } else if (action === 'delete') {
    assert.equal(db.projects.alpha, undefined);
    assert.equal(db.tasks.A1, undefined);
    assert.equal(db.tasks.A2, undefined);
    assert.deepEqual(db.tasks.B1, before.tasks.B1);
  } else {
    assert.equal(response.body.ok, true);
    assert.deepEqual(db, before, 'An empty membership permission probe must not mutate data');
  }
}

// Each cell has a named test at all three authorization milestones: 36 cells.
for (const version of ['v2', 'v3', 'v4']) {
  for (const role of Object.keys(permissions)) {
    for (const action of actions) test(`${version} matrix ${role}.${action}`, () => {
      const db = cloneDB();
      db.projects.alpha.members.bob = role;
      const before = snapshot(db);
      checkAction(db, before, action, call(version, db, 'bob', action), permissions[role].includes(action) ? 200 : 403);
    });
  }
}

for (const [user, id, status] of [
  ['alice', 'A1', 200], ['alice', 'B1', 403], ['charlie', 'B1', 200],
  ['bob', 'A1', 200], ['bob', 'B1', 403], ['alice', 'missing', 404],
]) test(`v1 object-level read ${user}/${id} -> ${status}`, () => {
  const db = cloneDB();
  const before = snapshot(db);
  const response = expectStatus(services.v1.getTask(db, user, id), status);
  if (status === 200) assert.equal(response.body.id, id);
  else assert.equal(response.body.title, undefined);
  assert.deepEqual(db, before);
});

for (const version of ['v3', 'v4']) {
  for (const scenario of ['unassigned', 'assigned_to_other', 'closed', 'other_project']) test(`${version} Member edit denied: ${scenario}; no mutation`, () => {
    const db = cloneDB();
    if (scenario === 'unassigned') db.tasks.A1.assignee = null;
    if (scenario === 'assigned_to_other') db.tasks.A1.assignee = 'alice';
    if (scenario === 'closed') db.tasks.A1.status = 'Closed';
    const before = snapshot(db);
    expectStatus(services[version].editTask(db, 'bob', scenario === 'other_project' ? 'B1' : 'A1', { title: 'Unauthorized', assignee: 'bob', status: 'Open' }), 403);
    assert.deepEqual(db, before);
  });
  test(`${version} Owner can edit an unassigned Closed task`, () => {
    const db = cloneDB();
    db.tasks.A2.status = 'Closed';
    expectStatus(services[version].editTask(db, 'alice', 'A2', { title: 'Owner update' }), 200);
    assert.equal(db.tasks.A2.title, 'Owner update');
  });
}

for (const action of actions) {
  test(`v4 Admin own tenant ${action} allowed`, () => {
    const db = cloneDB();
    checkAction(db, snapshot(db), action, call('v4', db, 'dana', action), 200);
  });
  for (const user of ['dana', 'alice', 'charlie', 'nonmember']) test(`v4 ${user} forbidden scope ${action}; no mutation`, () => {
    const db = cloneDB();
    db.users.nonmember = { name: 'No membership', tenant: 'alpha' };
    const before = snapshot(db);
    const sameTenantTarget = user === 'charlie' || user === 'nonmember';
    const id = action === 'read' || action === 'edit' ? (sameTenantTarget ? 'A1' : 'B1') : (sameTenantTarget ? 'alpha' : 'beta');
    expectStatus(call('v4', db, user, action, id), 403);
    assert.deepEqual(db, before);
  });
  test(`Business entry point rejects missing/unknown principal for ${action}`, () => {
    for (const user of [null, '', 'missing', 'constructor', '__proto__']) {
      const db = cloneDB();
      const before = snapshot(db);
      expectStatus(call('v4', db, user, action), 401);
      assert.deepEqual(db, before);
    }
  });
}

for (const role of ['Admin', 'constructor', '__proto__', 'toString', 'Unknown']) test(`Unrecognized project role ${role} grants no access`, () => {
  const db = cloneDB();
  db.projects.alpha.members.bob = role;
  const before = snapshot(db);
  expectStatus(services.v4.getTask(db, 'bob', 'A1'), 403);
  expectStatus(services.v4.editTask(db, 'bob', 'A1', { title: 'Unexpected' }), 403);
  assert.deepEqual(db, before);
});

for (const entry of ORACLE_TESTS) test(`HTTP oracle V${entry.v}: ${entry.name}`, async () => {
  const db = applyFixture(cloneDB(), entry.fixture);
  const before = snapshot(db);
  await withApp({ version: 'v4', db }, async api => {
    const response = expectStatus(await api(entry.method, entry.path, entry), entry.status);
    if (entry.status >= 400) {
      assert.equal(response.body.title, undefined);
      assert.deepEqual(db, before);
    } else if (entry.method === 'GET') assert.equal(response.body.id, entry.path.split('/').pop());
    else if (entry.method === 'PATCH') assert.equal(db.tasks.A1.title, entry.body.title);
    else if (entry.method === 'DELETE') {
      assert.equal(db.projects.alpha, undefined);
      assert.equal(db.tasks.A1, undefined);
    } else assert.equal(response.body.ok, true);
  });
});

const endpoints = [['GET', '/tasks/A1'], ['PATCH', '/tasks/A1'], ['DELETE', '/projects/alpha'], ['POST', '/projects/alpha/members']];
for (const [method, path] of endpoints) test(`HTTP Anonymous ${method} ${path} -> 401`, async () => {
  const db = cloneDB();
  const before = snapshot(db);
  await withApp({ db }, async api => expectStatus(await api(method, path), 401));
  assert.deepEqual(db, before);
});

for (const [name, token] of [
  ['invalid signature', 'invalid.jwt.token'], ['expired token', signToken('alice', { iat: 1 })],
  ['unknown subject', signToken('unknown')], ['prototype subject', signToken('constructor')],
]) test(`HTTP authentication rejects ${name}`, async () => {
  await withApp({}, async api => expectStatus(await api('GET', '/tasks/A1', { token }), 401));
});

test('HTTP signed id/role/tenant claims cannot override verified sub', async () => {
  const db = cloneDB();
  const before = snapshot(db);
  await withApp({ db }, async api => {
    const token = signToken('bob', { id: 'alice', role: 'Admin', tenant: 'beta', tenantId: 'beta' });
    expectStatus(await api('DELETE', '/projects/alpha', { token }), 403);
    expectStatus(await api('GET', '/tasks/B1', { token }), 403);
    expectStatus(await api('PATCH', '/tasks/A2', { token, body: { title: 'Forged identity' } }), 403);
  });
  assert.deepEqual(db, before);
});

test('HTTP body userId and role cannot impersonate Owner', async () => {
  const db = cloneDB();
  const before = snapshot(db);
  await withApp({ db }, async api => {
    expectStatus(await api('DELETE', '/projects/alpha', { user: 'bob', body: { userId: 'alice', role: 'Admin' } }), 403);
    expectStatus(await api('POST', '/projects/alpha/members', { user: 'bob', body: { userId: 'bob', role: 'Owner' } }), 403);
  });
  assert.deepEqual(db, before);
});

for (const attempt of [
  { name: 'query', path: '/tasks/B1?version=v0' },
  { name: 'header', path: '/tasks/B1', headers: { 'x-version': 'v0' } },
]) test(`HTTP client ${attempt.name} cannot downgrade V4`, async () => {
  await withApp({}, async api => {
    expectStatus(await api('GET', attempt.path, { user: 'alice', headers: attempt.headers }), 403);
    assert.equal(expectStatus(await api('GET', '/api/version'), 200).body.version, 'v4');
  });
});

for (const [method, path, body] of [
  ['POST', '/api/version', { version: 'v0' }], ['GET', '/api/tokens'], ['GET', '/api/db'],
  ['POST', '/test/reset', { fixture: 'viewer' }], ['POST', '/api/test/reset', { fixture: 'closed' }],
]) test(`HTTP normal API has no demo helper ${method} ${path}`, async () => {
  const db = cloneDB();
  const before = snapshot(db);
  await withApp({ db }, async api => {
    expectStatus(await api(method, path, { body }), 404);
    expectStatus(await api(method, path, { user: 'dana', body }), 404);
    assert.equal((await api('GET', '/api/version')).body.version, 'v4');
  });
  assert.deepEqual(db, before);
});

test('HTTP demo switching is explicit and isolated from the normal API', async () => {
  await withApp({ demo: true }, async demo => withApp({}, async normal => {
    expectStatus(await demo('GET', '/api/tokens'), 200);
    expectStatus(await demo('GET', '/api/db'), 404);
    expectStatus(await demo('GET', '/tasks/B1?version=v0', { user: 'alice' }), 403);
    expectStatus(await demo('POST', '/api/version', { body: { version: 'v0' } }), 200);
    assert.equal(expectStatus(await demo('GET', '/tasks/B1', { user: 'alice' }), 200).body.id, 'B1');
    expectStatus(await normal('GET', '/tasks/B1', { user: 'alice' }), 403);
    assert.equal((await normal('GET', '/api/version')).body.version, 'v4');
    expectStatus(await demo('POST', '/api/version', { body: { version: 'constructor' } }), 400);
  }));
});

for (const [name, body] of [
  ['cross-tenant project transfer', { project: 'beta', assignee: 'charlie' }], ['same-tenant project reassignment', { project: 'alpha' }],
  ['task id', { id: 'B1' }], ['tenant', { tenant: 'beta' }], ['tenantId', { tenantId: 'beta' }], ['role', { role: 'Owner' }],
  ['unknown field', { arbitrary: true }], ['invalid status', { status: 'Deleted' }], ['invalid title', { title: 123 }], ['empty title', { title: '' }],
  ['foreign assignee', { assignee: 'charlie' }], ['unknown assignee', { assignee: 'missing' }], ['array', []], ['null', null],
  ['prototype mutation', JSON.parse('{"__proto__":{"project":"beta"}}')],
]) test(`HTTP PATCH rejects ${name} and preserves data`, async () => {
  const db = cloneDB();
  const before = snapshot(db);
  await withApp({ db }, async api => {
    expectStatus(await api('PATCH', '/tasks/A1', { user: 'bob', body }), 400);
    expectStatus(await api('GET', '/tasks/A1', { user: 'charlie' }), 403);
    const response = expectStatus(await api('GET', '/tasks/A1', { user: 'alice' }), 200);
    assert.equal(response.body.project, 'alpha');
    assert.equal(response.body.title, before.tasks.A1.title);
  });
  assert.deepEqual(db, before);
  assert.equal(Object.prototype.project, undefined);
});

test('HTTP authorized PATCH persists allowed fields; closed task cannot be reopened by Member', async () => {
  const db = cloneDB();
  await withApp({ db }, async api => {
    expectStatus(await api('PATCH', '/tasks/A1', { user: 'bob', body: { title: 'Finished', status: 'Closed', assignee: 'alice' } }), 200);
    const task = expectStatus(await api('GET', '/tasks/A1', { user: 'alice' }), 200).body;
    assert.equal(task.title, 'Finished');
    assert.equal(task.status, 'Closed');
    assert.equal(task.assignee, 'alice');
    assert.equal(task.project, 'alpha');
    const before = snapshot(db);
    expectStatus(await api('PATCH', '/tasks/A1', { user: 'bob', body: { status: 'Open', assignee: 'bob' } }), 403);
    assert.deepEqual(db, before);
  });
});

for (const [method, path] of [
  ['GET', '/tasks/missing'], ['PATCH', '/tasks/missing'], ['DELETE', '/projects/missing'], ['POST', '/projects/missing/members'],
  ['GET', '/tasks/constructor'], ['GET', '/tasks/__proto__'], ['DELETE', '/projects/constructor'], ['POST', '/projects/__proto__/members'],
]) test(`HTTP missing/prototype resource ${method} ${path} -> exactly 404`, async () => {
  const db = cloneDB();
  const before = snapshot(db);
  await withApp({ db }, async api => expectStatus(await api(method, path, { user: 'alice', body: method === 'PATCH' ? {} : undefined }), 404));
  assert.deepEqual(db, before);
});

test('HTTP Owner changes membership; same JWT loses permissions immediately', async () => {
  const db = cloneDB();
  const bobToken = signToken('bob');
  await withApp({ db }, async api => {
    expectStatus(await api('PATCH', '/tasks/A1', { token: bobToken, body: { title: 'Before demotion' } }), 200);
    expectStatus(await api('POST', '/projects/alpha/members', { user: 'alice', body: { userId: 'bob', role: 'Viewer' } }), 200);
    assert.equal(db.projects.alpha.members.bob, 'Viewer');
    expectStatus(await api('GET', '/tasks/A1', { token: bobToken }), 200);
    const before = snapshot(db);
    expectStatus(await api('PATCH', '/tasks/A1', { token: bobToken, body: { title: 'After demotion' } }), 403);
    assert.deepEqual(db, before);
    expectStatus(await api('POST', '/projects/alpha/members', { user: 'alice', body: { userId: 'bob', remove: true } }), 200);
    assert.equal(db.projects.alpha.members.bob, undefined);
    assert.equal(db.tasks.A1.assignee, null);
    expectStatus(await api('GET', '/tasks/A1', { token: bobToken }), 403);
  });
});

test('HTTP Owner adds same-tenant user and grants actual read access', async () => {
  const db = cloneDB();
  db.users.eve = { name: 'Eve', tenant: 'alpha' };
  await withApp({ db }, async api => {
    expectStatus(await api('GET', '/tasks/A1', { user: 'eve' }), 403);
    expectStatus(await api('POST', '/projects/alpha/members', { user: 'alice', body: { userId: 'eve', role: 'Viewer' } }), 200);
    assert.equal(db.projects.alpha.members.eve, 'Viewer');
    expectStatus(await api('GET', '/tasks/A1', { user: 'eve' }), 200);
    expectStatus(await api('PATCH', '/tasks/A1', { user: 'eve', body: { title: 'Viewer edit' } }), 403);
  });
});

for (const [name, body, status] of [
  ['cross-tenant user', { userId: 'charlie', role: 'Viewer' }, 400], ['unknown user', { userId: 'missing', role: 'Viewer' }, 400],
  ['invented Admin role', { userId: 'bob', role: 'Admin' }, 400], ['prototype role', { userId: 'bob', role: 'constructor' }, 400],
  ['remove final Owner', { userId: 'alice', remove: true }, 409], ['demote final Owner', { userId: 'alice', role: 'Viewer' }, 409],
]) test(`HTTP membership rejects ${name}`, async () => {
  const db = cloneDB();
  const before = snapshot(db);
  await withApp({ db }, async api => expectStatus(await api('POST', '/projects/alpha/members', { user: 'alice', body }), status));
  assert.deepEqual(db, before);
});

test('HTTP current server tenant/admin state overrides stale token claims', async () => {
  const db = cloneDB();
  const token = signToken('dana', { admin: true, tenant: 'alpha' });
  await withApp({ db }, async api => {
    expectStatus(await api('GET', '/tasks/A1', { token }), 200);
    db.users.dana.admin = false;
    expectStatus(await api('GET', '/tasks/A1', { token }), 403);
    db.users.dana.admin = true;
    db.users.dana.tenant = 'beta';
    expectStatus(await api('GET', '/tasks/A1', { token }), 403);
    expectStatus(await api('GET', '/tasks/B1', { token }), 200);
    delete db.users.dana;
    expectStatus(await api('GET', '/tasks/B1', { token }), 401);
  });
});

test('IDOR RED -> GREEN uses the unchanged deny assertion, with positive controls', async () => runEvidence());

async function main() {
  console.log('Task API — authorization regression suite (exact status + data invariants)');
  let passed = 0;
  let failed = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      passed++;
      console.log(`[PASS] ${name}`);
    } catch (error) {
      failed++;
      console.error(`[FAIL] ${name}\n${error.stack}`);
    }
  }
  console.log(`\nRESULT: ${passed}/${tests.length} passed; ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(error => {
  console.error(error.stack);
  process.exitCode = 1;
});
