// Codex 官方 hooks：只把事件和会话标识送到本机，绝不转发提示词、工具参数或聊天记录。
const PORT = 47292;
const MARK = '/desk-pets-codex/';
const SIGNATURE = '# desk-pets-codex\n';
const STATUS = '灰鸮桌宠联动';
const EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd'];

function hookScript(event, port = PORT) {
  if (!EVENTS.includes(event) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('无效的联动事件或端口');
  return `${SIGNATURE}$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $message = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $payload = @{
    session_id = [string]$message.session_id
    turn_id = [string]$message.turn_id
    sent_at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    needs_input = ([string]$message.tool_name -match '(^|__)request_user_input(_async)?$')
  } | ConvertTo-Json -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:${port}${MARK}${event}')
  $request.Method = 'POST'
  $request.ContentType = 'application/json'
  $request.ContentLength = $bytes.Length
  $request.Proxy = $null
  $request.KeepAlive = $false
  $request.Timeout = 800
  $request.ReadWriteTimeout = 800
  $stream = $request.GetRequestStream()
  try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
  $response = $request.GetResponse()
  $response.Dispose()
} catch {}
exit 0`;
}

// 编码只是为了让同一条命令在 PowerShell / Git Bash 中都不会被引号、$ 等改变含义。
// 明文脚本在 hookScript；没有审批决定、没有控制模型的输出、也不改变任何安全设置。
function hookCommand(event, port = PORT) {
  return `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${Buffer.from(hookScript(event, port), 'utf16le').toString('base64')}`;
}
function isOurs(hook) {
  if (hook?.type !== 'command' || hook.statusMessage !== STATUS) return false;
  const encoded = / -EncodedCommand ([A-Za-z0-9+/=]+)$/.exec(hook.command || '');
  return !!encoded && Buffer.from(encoded[1], 'base64').toString('utf16le').startsWith(SIGNATURE);
}
function copySettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('hooks.json 不是设置对象');
  if (settings.hooks != null && (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks))) throw new Error('hooks 格式不正确');
  return JSON.parse(JSON.stringify(settings));
}
function removeHooks(settings = {}) {
  const next = copySettings(settings);
  if (!next.hooks) return next;
  for (const [event, groups] of Object.entries(next.hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept = groups.flatMap(group => {
      if (!Array.isArray(group?.hooks) || !group.hooks.some(isOurs)) return [group];
      const hooks = group.hooks.filter(hook => !isOurs(hook));
      return hooks.length ? [{ ...group, hooks }] : [];
    });
    if (kept.length) next.hooks[event] = kept;
    else delete next.hooks[event];
  }
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return next;
}
function addHooks(settings = {}, port = PORT) {
  const next = removeHooks(settings);
  next.hooks ||= {};
  for (const event of EVENTS) {
    if (next.hooks[event] != null && !Array.isArray(next.hooks[event])) throw new Error(`${event} 格式不正确`);
    (next.hooks[event] ||= []).push({ hooks: [hookDefinition(event, port)] });
  }
  return next;
}
// 普通事件留足冷启动时间；Codex 对中断、会话结束的上限是 3 秒。
function hookDefinition(event, port = PORT) {
  return { type: 'command', command: hookCommand(event, port), timeout: ['Interrupt', 'SessionEnd'].includes(event) ? 3 : 10, statusMessage: STATUS };
}
// 旧命令或过短的超时也需要升级，但保留别人的 hook 和用户的信任决定。
const hasHooks = (settings, port = PORT) => EVENTS.every(event => {
  const expected = hookDefinition(event, port);
  return Array.isArray(settings?.hooks?.[event]) && settings.hooks[event].some(g =>
    !g?.matcher && Array.isArray(g?.hooks) && g.hooks.some(h => isOurs(h) && h.command === expected.command &&
      h.timeout === expected.timeout && !h.commandWindows && !h.command_windows && !h.async));
});
module.exports = { PORT, MARK, EVENTS, STATUS, hookScript, hookCommand, isOurs, addHooks, removeHooks, hasHooks };
