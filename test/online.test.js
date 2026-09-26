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
  assert.deepStrictEqual(parseMessage('{"type":"pet","name":"千千"}'), { type: 'pet', name: '千千', pet: '' });
  assert.deepStrictEqual(parseMessage('{"type":"poke","name":"梨梨","extra":"x"}'), { type: 'poke', name: '梨梨', pet: '' });
  assert.deepStrictEqual(parseMessage('{"type":"visit-start","name":"千千","pet":"绿眼猫猫","screen":"..."}'), { type: 'visit-start', name: '千千', pet: '绿眼猫猫' });
  assert.deepStrictEqual(parseMessage('{"type":"visit-end","pet":"绿眼猫猫"}'), { type: 'visit-end', name: '', pet: '绿眼猫猫' });
  assert.deepStrictEqual(parseMessage('{"type":"presence","online":2}'), { type: 'presence', online: 2 });
  assert.strictEqual(parseMessage('{"type":"screen","data":"..."}'), null);
  assert.strictEqual(parseMessage('pong'), null);
});

test('names are trimmed and kept short', () => {
  assert.strictEqual(cleanName('  千千\n'), '千千');
  assert.strictEqual(cleanName('a'.repeat(50)).length, 20);
});

const { randomPairCode } = require('../lib/online');

test('random pairing codes are long and use easy-to-read letters', () => {
  const codes = new Set(Array.from({ length: 200 }, () => randomPairCode()));
  assert.strictEqual(codes.size, 200);
  for (const code of codes) assert.match(code, /^[a-hjkmnp-z2-9]{10}$/);
});
