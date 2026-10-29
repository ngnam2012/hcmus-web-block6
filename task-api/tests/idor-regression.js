'use strict';

const { assert, withApp, expectStatus } = require('./helpers');

// This exact assertion runs unchanged against V0 and V1.
function assertIdorDenied(response) {
  assert.equal(response.status, 403, 'Alice must not read task B1 outside her project');
  assert.equal(response.body.error, 'forbidden');
  assert.equal(response.body.title, undefined, 'A denied response must not contain task data');
}

async function runVersion(version) {
  return withApp({ version }, async api => ({ version, response: await api('GET', '/tasks/B1', { user: 'alice' }) }));
}

async function runEvidence({ log = true } = {}) {
  const before = await runVersion('v0');
  let caught;
  try { assertIdorDenied(before.response); } catch (error) { caught = error; }
  assert(caught instanceof assert.AssertionError, 'V0 must fail the unchanged regression assertion');
  assert.equal(before.response.status, 200);
  assert.equal(before.response.body.id, 'B1');
  assert.equal(typeof before.response.body.title, 'string');
  if (log) {
    console.log('[RED — expected regression failure] V0: expected 403, received 200');
    console.log(JSON.stringify(before.response));
  }
  const after = await runVersion('v1');
  assertIdorDenied(after.response);
  if (log) {
    console.log('[GREEN] V1: the SAME assertion expected 403, received 403');
    console.log(JSON.stringify(after.response));
  }
  await withApp({ version: 'v1' }, async api => {
    expectStatus(await api('GET', '/tasks/A1', { user: 'alice' }), 200);
    expectStatus(await api('GET', '/tasks/B1', { user: 'charlie' }), 200);
  });
  if (log) console.log('[GREEN] Positive controls: Alice reads A1; Charlie reads B1');
  return { before, after };
}

async function main() {
  const argument = process.argv.find(value => value.startsWith('--version='));
  if (!argument) return runEvidence();
  const version = argument.slice('--version='.length);
  if (!['v0', 'v1'].includes(version)) throw new Error('Use --version=v0 or --version=v1');
  const { response } = await runVersion(version);
  console.log(`${version}: ${JSON.stringify(response)}`);
  assertIdorDenied(response);
  console.log('[GREEN] IDOR regression assertion passed');
}

if (require.main === module) main().catch(error => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
module.exports = { assertIdorDenied, runEvidence };
