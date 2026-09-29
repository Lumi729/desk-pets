// macOS 使用桌宠自带的 Electron/Node，不要求用户安装 Python、Node 或 PowerShell。
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
function clientScript(event, port) {
  return `// desk-pets-codex
const http = require('node:http');
const finish = () => process.exit(0);
process.on('uncaughtException', finish);
setTimeout(finish, 1800);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; if (input.length > 1048576) finish(); });
process.stdin.on('error', finish);
process.stdin.on('end', () => {
  try {
    const m = JSON.parse(input);
    const body = JSON.stringify({session_id: String(m.session_id || ''), turn_id: String(m.turn_id || ''), sent_at: Date.now(), needs_input: /(^|__)request_user_input(_async)?$/.test(m.tool_name || '')});
    const req = http.request({hostname: '127.0.0.1', port: ${port}, path: '/desk-pets-codex/${event}', method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)}, agent: false}, res => { res.resume(); res.on('end', finish); });
    req.on('error', finish);
    req.setTimeout(800, () => { req.destroy(); finish(); });
    req.end(body);
  } catch { finish(); }
});`;
}
function command(event, port, executable) {
  const encoded = Buffer.from(clientScript(event, port)).toString('base64');
  const script = `require('node:vm').runInThisContext(Buffer.from('${encoded}','base64').toString('utf8'))`;
  return `ELECTRON_RUN_AS_NODE=1 ${quote(executable)} -e ${quote(script)} >/dev/null 2>&1; exit 0 # desk-pets-codex-posix`;
}
module.exports = { command, clientScript };
