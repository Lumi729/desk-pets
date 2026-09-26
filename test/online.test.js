const test = require('node:test');
const assert = require('node:assert');
const { relayUrl, parseMessage, cleanName } = require('../lib/online');

test('builds the relay address from whatever was typed', () => {
  assert.strictEqual(relayUrl('desk-pets-relay.qq.workers.dev', 'meow1'), 'wss://desk-pets-relay.qq.workers.dev/ws?code=meow1');
  assert.strictEqual(relayUrl('https://desk-pets-relay.qq.workers.dev/', ' 猫猫 '), 'wss://desk-pets-relay.qq.workers.dev/ws?code=%E7%8C%AB%E7%8C%AB');
  assert.strictEqual(relayUrl('http://localhost:8787', 'abcd'), 'ws://localhost:8787/ws?code=abcd');
  assert.throws(() => relayUrl('', 'abcd'));
  assert.throws(() => relayUrl('ftp://x', 'abcd'));
});

test('only interaction events and presence get through', () => {
  assert.deepStrictEqual(parseMessage('{"type":"pet","name":"千千"}'), { type: 'pet', name: '千千' });
  assert.deepStrictEqual(parseMessage('{"type":"poke","name":"梨梨","extra":"x"}'), { type: 'poke', name: '梨梨' });
  assert.deepStrictEqual(parseMessage('{"type":"presence","online":2}'), { type: 'presence', online: 2 });
  assert.strictEqual(parseMessage('{"type":"screen","data":"..."}'), null);
  assert.strictEqual(parseMessage('pong'), null);
});

test('names are trimmed and kept short', () => {
  assert.strictEqual(cleanName('  千千\n'), '千千');
  assert.strictEqual(cleanName('a'.repeat(50)).length, 20);
});
