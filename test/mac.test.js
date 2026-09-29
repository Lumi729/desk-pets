const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const Hooks = require('../lib/codex-hooks');
const Claude = require('../lib/claude-hooks');
const { clientScript } = require('../lib/codex-posix');

function run(event, port, input, shell = false) {
  return new Promise((resolve, reject) => {
    const child = shell
      ? spawn('/bin/sh', ['-c', Hooks.hookCommand(event, port, 'darwin', process.execPath)])
      : spawn(process.execPath, ['-e', clientScript(event, port)]);
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Hook timed out')); }, 6000);
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
test('Mac Codex 命令保留签名，安全引用带空格、引号和美元符号的安装路径', () => {
  const command = Hooks.hookCommand('Stop', 47292, 'darwin', "/Applications/千千's $pet.app/Contents/MacOS/桌宠");
  assert.ok(command.startsWith("ELECTRON_RUN_AS_NODE=1 '/Applications/千千'\\''s $pet.app/Contents/MacOS/桌宠' -e "));
  assert.ok(Hooks.isOurs({ type: 'command', statusMessage: Hooks.STATUS, command }));
  assert.deepEqual(Hooks.removeHooks({ hooks: { Stop: [{ hooks: [{ type: 'command', statusMessage: Hooks.STATUS, command }] }] } }), {});
  assert.match(Claude.hookCommand('Stop', 47291, 'darwin'), /^\/usr\/bin\/curl .*\/dev\/null.*; exit 0$/);
});

for (const shell of [false, true]) {
  test(`Mac hook ${shell ? '真实 POSIX 命令' : '客户端'}：中文收工、隐私过滤、未启动时静默`, { skip: shell && process.platform === 'win32' }, async t => {
    const received = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', b => { body += b; });
      req.on('end', () => { received.push({ url: req.url, body: JSON.parse(body) }); res.writeHead(204).end(); });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const port = server.address().port;
    const silent = { code: 0, stdout: '', stderr: '' };
    for (const event of ['PreToolUse', 'Stop']) {
      assert.deepEqual(await run(event, port, JSON.stringify({ session_id: '中文🦊', turn_id: '一', tool_name: 'functions__request_user_input_async', prompt: 'SECRET', last_assistant_message: '秘密\n"回复"' }), shell), silent);
    }
    assert.equal(received.length, 2);
    assert.equal(received[1].url, '/desk-pets-codex/Stop');
    assert.deepEqual(Object.keys(received[0].body).sort(), ['needs_input', 'sent_at', 'session_id', 'turn_id']);
    assert.equal(received[0].body.session_id, '中文🦊');
    assert.equal(received[0].body.needs_input, true);
    assert.deepEqual(await run('Stop', port, 'not json', shell), silent);
    assert.equal(received.length, 2);
    await new Promise(resolve => server.close(resolve));
    assert.deepEqual(await run('Stop', port, '{"session_id":"s"}', shell), silent);
  });
}
