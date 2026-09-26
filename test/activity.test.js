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

const { parseLine } = require('../lib/activity');

test('parses window position and only classifies in full mode', () => {
  const line = '﻿{"h":1234,"r":"100,200,900,700","p":"Code","t":"a.js - Visual Studio Code"}';
  assert.deepStrictEqual(parseLine(line, true), { handle: 1234, rect: { x: 100, y: 200, width: 800, height: 500 }, kind: 'code' });
  assert.deepStrictEqual(parseLine(line, false), { handle: 1234, rect: { x: 100, y: 200, width: 800, height: 500 }, kind: null });
});

test('minimised or hidden windows have no position', () => {
  assert.strictEqual(parseLine('{"h":5,"r":""}', false).rect, null);
  assert.strictEqual(parseLine('{"h":5,"r":"10,10,10,50"}', false).rect, null);
});
