const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const Hooks = require('../lib/codex-hooks');
const { createCodexActivity, IDLE_TIMEOUT } = require('../lib/codex-activity');
const { createCodexLink } = require('../lib/codex-link');

test('Codex hooks 增删可重复，保留别人的命令与设置，格式坏了不覆盖', () => {
  const other = { type: 'command', command: 'echo hello' };
  const before = { description: 'existing', hooks: { Stop: [{ hooks: [other] }] } };
  const added = Hooks.addHooks(before);
  assert.ok(Hooks.hasHooks(added));
  assert.deepEqual(Hooks.addHooks(added), added);
  assert.deepEqual(Hooks.removeHooks(added), before);
  assert.deepEqual(before.hooks.Stop, [{ hooks: [other] }]);
  added.hooks.PreToolUse[0].hooks.push(other);
  assert.deepEqual(Hooks.removeHooks(added).hooks.PreToolUse, [{ hooks: [other] }]);
  delete added.hooks.Interrupt;
  assert.equal(Hooks.hasHooks(added), false);
  assert.ok(Hooks.hasHooks(Hooks.addHooks(added)));
  assert.throws(() => Hooks.addHooks({ hooks: { Stop: 'broken' } }));
  assert.throws(() => Hooks.addHooks([]));
  assert.throws(() => Hooks.hookCommand('Unknown'));
});

function tracker() {
  const changes = [];
  const a = createCodexActivity(e => changes.push(e));
  return { a, changes, send(event, session = 'a', turn = '1', now = 0, extra = {}) {
    return a.event(event, { session_id: session, turn_id: turn, sent_at: now, ...extra }, now);
  } };
}
test('几场聊天分别记：一场收工或等审批时，另一场仍然敲键盘', () => {
  const { a, changes, send } = tracker();
  send('UserPromptSubmit'); send('UserPromptSubmit', 'b');
  send('PermissionRequest', 'a', '1', 100);
  assert.equal(a.working, true);
  assert.deepEqual(changes.at(-1), { type: 'waiting', stillWorking: true });
  send('Stop', 'a', '1', 200);
  assert.equal(a.working, true);
  assert.equal(changes.filter(e => e.type === 'done').length, 0);
  send('Stop', 'b', '1', 15000);
  assert.equal(a.working, false);
  assert.deepEqual(changes.at(-1), { type: 'done', short: false });
});
test('等回应暂停，收到工具结果继续；中断停下且不庆祝', () => {
  const { a, changes, send } = tracker();
  send('UserPromptSubmit');
  send('PreToolUse', 'a', '1', 20, { needs_input: true });
  assert.equal(a.working, false);
  send('PostToolUse', 'a', '1', 30);
  assert.equal(a.working, true);
  send('Interrupt', 'a', '1', 40);
  assert.equal(a.working, false);
  assert.equal(changes.filter(e => e.type === 'done').length, 0);
  send('PostToolUse', 'a', '1', 50);
  assert.equal(a.working, false);
});
test('旧轮次、重复收工、过期消息不能把新轮次停掉或重新唤醒', () => {
  const { a, changes, send } = tracker();
  send('UserPromptSubmit'); send('Stop', 'a', '1', 10);
  send('Stop', 'a', '1', 11); send('PreToolUse', 'a', '1', 12);
  assert.equal(changes.filter(e => e.type === 'done').length, 1);
  assert.equal(a.working, false);
  send('UserPromptSubmit', 'a', '2', 30);
  assert.equal(send('Stop', 'a', '1', 40), false);
  assert.equal(send('UserPromptSubmit', 'a', '1', 20), false);
  assert.equal(a.working, true);
  assert.equal(a.event('Stop', { session_id: 'a', turn_id: '2', sent_at: 0 }, IDLE_TIMEOUT + 1), false);
  a.sweep(IDLE_TIMEOUT + 31);
  assert.equal(a.working, false);
  send('PreToolUse', 'b', '3', IDLE_TIMEOUT + 40);
  send('SessionEnd', 'b', '', IDLE_TIMEOUT + 50);
  assert.equal(a.working, false);
});
test('无效事件、空会话和无起点的收工不会触发动作', () => {
  const { a, changes, send } = tracker();
  assert.equal(send('Stop'), false);
  assert.equal(send('SomethingElse'), false);
  assert.equal(send('UserPromptSubmit', ''), false);
  assert.equal(a.event('PreToolUse', { session_id: 'x'.repeat(129) }), false);
  assert.deepEqual(changes, []);
});

async function post(port, event, body, headers = {}) {
  const result = await fetch(`http://127.0.0.1:${port}${Hooks.MARK}${event}`, {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers,
  });
  return { status: result.status, body: await result.text() };
}
test('本机端到端：事件进接口→开始/等待/恢复/收工，回复永远没有内容', async t => {
  const events = [], changes = [];
  const link = createCodexLink({ onChange: e => changes.push(e), onEvent: e => events.push(e) });
  t.after(() => link.stop());
  const port = await link.start(0);
  const info = { session_id: 's', turn_id: 't' };
  assert.deepEqual(await post(port, 'UserPromptSubmit', info), { status: 204, body: '' });
  assert.equal(link.activity.working, true);
  await post(port, 'PermissionRequest', info);
  assert.equal(link.activity.working, false);
  await post(port, 'PostToolUse', info);
  assert.equal(link.activity.working, true);
  await post(port, 'Stop', info);
  assert.equal(link.activity.working, false);
  assert.equal(changes.at(-1).type, 'done');
  assert.deepEqual(Object.keys(events[0]).sort(), ['at', 'event']);
  assert.equal((await post(port, 'UserPromptSubmit', info, { Origin: 'https://example.com' })).status, 404);
  assert.equal((await post(port, 'Unknown', info)).status, 404);
  await post(port, 'PreToolUse', '{');
  assert.equal(events.length, 4);
  await link.stop();
  const restarted = await link.start(0);
  assert.ok(restarted);
});
test('端口占用会明确失败，释放后可以再开', async t => {
  const first = createCodexLink({ onChange() {} });
  const second = createCodexLink({ onChange() {} });
  t.after(() => Promise.all([first.stop(), second.stop()]));
  const port = await first.start(0);
  await assert.rejects(second.start(port), { code: 'EADDRINUSE' });
  await first.stop();
  assert.equal(await second.start(port), port);
});

function runHook(event, port, input) {
  return new Promise((resolve, reject) => {
    const cmd = Hooks.hookCommand(event, port);
    const encoded = cmd.slice(cmd.lastIndexOf(' ') + 1);
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}
test('Windows 真正执行 hook：只转发状态，聊天和工具内容被丢弃；桌宠没开也静默成功', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', b => { body += b; });
    req.on('end', () => { received.push(JSON.parse(body)); res.writeHead(204); res.end(); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const input = JSON.stringify({ session_id: 'a', turn_id: 'b', tool_name: 'mcp__functions__request_user_input', prompt: '不要转发这句', tool_input: { secret: 'private' }, last_assistant_message: 'private' });
  const silent = { code: 0, stdout: '', stderr: '' };
  assert.deepEqual(await runHook('PreToolUse', port, input), silent);
  assert.equal(received.length, 1);
  assert.deepEqual(Object.keys(received[0]).sort(), ['needs_input', 'sent_at', 'session_id', 'turn_id']);
  assert.equal(received[0].needs_input, true);
  assert.equal(received[0].session_id, 'a');
  assert.deepEqual(await runHook('Stop', port, '{bad json'), silent);
  await new Promise(resolve => server.close(resolve));
  assert.deepEqual(await runHook('Stop', port, input), silent);
});
