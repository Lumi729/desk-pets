// Claude Code 联动：往 Claude Code 的 settings.json 里加 / 删我们的 hooks。
// 只动我们自己加的那几条（命令里带 MARK），别的软件加的 hooks 一条都不碰。
const PORT = 47291;
const MARK = '/desk-pets-claude/';
// PermissionRequest 只是看一眼：命令没有任何输出，所以不会替你允许或拒绝
const EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'StopFailure', 'Notification', 'PermissionRequest', 'SessionEnd'];

// Git Bash 和 PowerShell 都能跑的一行命令：
// curl.exe 把 hook 收到的 JSON（标准输入）转发给桌宠；-s + -o NUL 保证没有任何输出（UserPromptSubmit 的输出会进 Claude 的上下文）；
// 连不上（桌宠没开）1 秒就放弃；最后 exit 0，桌宠没开也不算出错
function hookCommand(event, port = PORT) {
  return `curl.exe -s --connect-timeout 1 -m 2 -o NUL -H "Content-Type: application/json" --data-binary "@-" http://127.0.0.1:${port}${MARK}${event} ; exit 0`;
}

const isOurs = hook => typeof hook?.command === 'string' && hook.command.includes(MARK);

// 加上我们的 hooks（已经有了就不重复加）。返回新的设置对象，不改原来的
function addHooks(settings, port = PORT) {
  const next = JSON.parse(JSON.stringify(settings || {}));
  if (!next.hooks || typeof next.hooks !== 'object' || Array.isArray(next.hooks)) next.hooks = {};
  for (const event of EVENTS) {
    const groups = Array.isArray(next.hooks[event]) ? next.hooks[event] : [];
    if (!groups.some(group => (group?.hooks || []).some(isOurs))) {
      const group = { hooks: [{ type: 'command', command: hookCommand(event, port), timeout: 5 }] };
      if (['PreToolUse', 'PostToolUse', 'PermissionRequest'].includes(event)) group.matcher = '*';
      groups.push(group);
    }
    next.hooks[event] = groups;
  }
  return next;
}

// 只删我们加的；被我们删空的组 / 事件 / hooks 才一起删掉
function removeHooks(settings) {
  const next = JSON.parse(JSON.stringify(settings || {}));
  if (!next.hooks || typeof next.hooks !== 'object') return next;
  for (const [event, groups] of Object.entries(next.hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept = [];
    for (const group of groups) {
      const hooks = Array.isArray(group?.hooks) ? group.hooks : null;
      if (!hooks || !hooks.some(isOurs)) { kept.push(group); continue; }
      const rest = hooks.filter(hook => !isOurs(hook));
      if (rest.length) kept.push({ ...group, hooks: rest });
    }
    if (kept.length) next.hooks[event] = kept;
    else delete next.hooks[event];
  }
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return next;
}

const hasHooks = settings => EVENTS.every(event => (settings?.hooks?.[event] || []).some(group => (group?.hooks || []).some(isOurs)));

module.exports = { PORT, MARK, EVENTS, hookCommand, addHooks, removeHooks, hasHooks };
