const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createErrorLog, describeError } = require('../lib/errorlog');

test('writes message, time and version, hides the user folder, skips repeats', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'errlog-')), '错误日志.txt');
  let t = new Date(2026, 8, 27, 12, 0, 0);
  const log = createErrorLog(file, '1.2.3', { now: () => t });
  const error = new Error(`找不到 ${os.homedir()}/secret.txt`);
  assert.ok(log.write('页面', error));
  assert.ok(!log.write('页面', error)); // 1 分钟内重复的不记
  t = new Date(2026, 8, 27, 12, 2, 0);
  assert.ok(log.write('页面', error));
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /\[2026-09-27 12:00:00\] 版本 1\.2\.3 · 页面/);
  assert.ok(!text.includes(os.homedir()));
  assert.match(log.latest(), /12:02:00/);
  assert.match(createErrorLog(file, '1.2.3').latest(), /12:02:00/);
});

test('describes non-Error values too', () => {
  assert.strictEqual(describeError('oops').message, 'oops');
  assert.strictEqual(describeError({ message: 'x' }).message, 'x');
});
