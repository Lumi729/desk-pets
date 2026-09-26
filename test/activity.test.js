const test = require('node:test');
const assert = require('node:assert');
const { classify } = require('../lib/activity');

test('recognises coding, video and music windows', () => {
  assert.strictEqual(classify('Code', 'pets.js - desk-pets - Visual Studio Code'), 'code');
  assert.strictEqual(classify('chrome', '【猫猫】超可爱_哔哩哔哩_bilibili - Google Chrome'), 'video');
  assert.strictEqual(classify('msedge', 'Lofi girl - YouTube - Microsoft Edge'), 'video');
  assert.strictEqual(classify('cloudmusic', '晴天 - 周杰伦'), 'music');
  assert.strictEqual(classify('Spotify', 'Spotify Premium'), 'music');
});

test('everything else is nothing special', () => {
  assert.strictEqual(classify('explorer', '下载'), null);
  assert.strictEqual(classify('', ''), null);
  assert.strictEqual(classify(undefined, undefined), null);
});
