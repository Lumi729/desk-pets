const test = require('node:test');
const assert = require('node:assert');
const { addHooks, removeHooks, hasHooks, hookCommand, EVENTS } = require('../lib/claude-hooks');
const { createClaudeActivity } = require('../lib/claude-activity');

const other = { type: 'command', command: 'clawd-on-desk notify' };

test('adds our hooks without touching existing ones, and only once', () => {
  const before = { model: 'x', hooks: { Stop: [{ hooks: [other] }], PreToolUse: [{ matcher: 'Bash', hooks: [other] }] } };
  const after = addHooks(before);
  assert.deepStrictEqual(before.hooks.Stop, [{ hooks: [other] }]); // 原来的对象没被改
  assert.strictEqual(after.model, 'x');
  assert.ok(hasHooks(after));
  assert.deepStrictEqual(after.hooks.Stop[0], { hooks: [other] });
  assert.strictEqual(after.hooks.Stop.length, 2);
  assert.strictEqual(after.hooks.PreToolUse[1].matcher, '*');
  assert.deepStrictEqual(addHooks(after), after); // 再加一次不会重复
  for (const e of EVENTS) assert.ok(after.hooks[e].length >= 1);
});

test('removes only our hooks', () => {
  const mixed = addHooks({ hooks: { Stop: [{ hooks: [other] }] } });
  mixed.hooks.Notification[0].hooks.push(other); // 别人加进了同一组
  const back = removeHooks(mixed);
  assert.deepStrictEqual(back.hooks.Stop, [{ hooks: [other] }]);
  assert.deepStrictEqual(back.hooks.Notification, [{ hooks: [other] }]);
  assert.ok(!back.hooks.UserPromptSubmit);
  assert.ok(!hasHooks(back));
  assert.deepStrictEqual(removeHooks(addHooks({})), {});
  assert.deepStrictEqual(removeHooks({ a: 1 }), { a: 1 });
});

test('hook command is quiet, short, never fails, works in bash and PowerShell', () => {
  const cmd = hookCommand('Stop');
  assert.match(cmd, /^curl\.exe -s /);
  assert.match(cmd, /-o NUL/);
  assert.match(cmd, /--connect-timeout 1 -m 2/);
  assert.match(cmd, /"@-"/); // PowerShell 里 @ 要加引号
  assert.match(cmd, /http:\/\/127\.0\.0\.1:\d+\/desk-pets-claude\/Stop ; exit 0$/);
});

test('tracks sessions separately', () => {
  const events = [];
  const a = createClaudeActivity(e => events.push(e));
  a.event('UserPromptSubmit', 's1', 0);
  a.event('PreToolUse', 's2', 1000);
  assert.strictEqual(a.working, true);
  a.event('Stop', 's1', 5000);
  assert.strictEqual(a.working, true); // s2 还在干
  assert.deepStrictEqual(events.at(-1), { type: 'done', short: true, stillWorking: true });
  a.event('Stop', 's2', 61_000);
  assert.strictEqual(a.working, false);
  assert.deepStrictEqual(events.at(-1), { type: 'done', short: false, stillWorking: false });
  a.event('Notification', 's2', 62_000);
  assert.deepStrictEqual(events.at(-1), { type: 'notify' });
});

test('session end and 10 minutes of silence stop the typing', () => {
  const a = createClaudeActivity(() => {});
  a.event('PreToolUse', 's1', 0);
  a.event('SessionEnd', 's1', 10);
  assert.strictEqual(a.working, false);
  a.event('PreToolUse', 's2', 0);
  a.sweep(9 * 60_000);
  assert.strictEqual(a.working, true);
  a.sweep(11 * 60_000);
  assert.strictEqual(a.working, false);
});

test('waiting for the user stops the typing; tool results keep it going', () => {
  const a = createClaudeActivity(() => {});
  a.event('UserPromptSubmit', 's1', 0);
  a.event('Notification', 's1', 1000);
  assert.strictEqual(a.working, false);
  a.event('PostToolUse', 's1', 2000);
  assert.strictEqual(a.working, true);
});

test('older installs get the new hooks added', () => {
  const old = addHooks({});
  delete old.hooks.PostToolUse;
  assert.ok(!hasHooks(old));
  assert.ok(hasHooks(addHooks(old)));
  assert.strictEqual(addHooks(old).hooks.Stop.length, 1);
});
