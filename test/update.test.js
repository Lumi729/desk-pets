const test = require('node:test');
const assert = require('node:assert');
const { compareVersions, checkForUpdate } = require('../lib/update');

test('compares versions part by part', () => {
  assert.strictEqual(compareVersions('v1.2.10', '1.2.9'), 1);
  assert.strictEqual(compareVersions('1.0.0', 'v1.0'), 0);
  assert.strictEqual(compareVersions('1.0.0', '1.1.0'), -1);
});

const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('reports a newer release', async () => {
  const found = await checkForUpdate('1.0.0', reply(200, { tag_name: 'v1.1.0', html_url: 'https://github.com/Lumi729/desk-pets/releases/tag/v1.1.0' }));
  assert.deepStrictEqual(found, { version: '1.1.0', url: 'https://github.com/Lumi729/desk-pets/releases/tag/v1.1.0' });
});

test('nothing to do when up to date, unreleased or a pre-release', async () => {
  assert.strictEqual(await checkForUpdate('1.1.0', reply(200, { tag_name: 'v1.1.0' })), null);
  assert.strictEqual(await checkForUpdate('1.0.0', reply(404, {})), null);
  assert.strictEqual(await checkForUpdate('1.0.0', reply(200, { tag_name: 'v2.0.0', prerelease: true })), null);
});

test('network trouble is an error, not an update', async () => {
  await assert.rejects(checkForUpdate('1.0.0', reply(500, {})));
});
