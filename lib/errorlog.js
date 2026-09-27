// 错误日志：只记错误信息、时间、版本号，写在本机的一个文本文件里。
// 不记窗口标题、键盘这些隐私；路径里的用户名换成 ~。
const fs = require('node:fs');
const os = require('node:os');

const MAX_BYTES = 200 * 1024; // 文件太大就只留后面的
const SEP = '\n----------------\n';

function pad(n) { return String(n).padStart(2, '0'); }
function stamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 错误 → 一段文字（去掉用户名，太长的截断）
function describeError(error, home = os.homedir()) {
  let message, stack = '';
  if (error instanceof Error) { message = `${error.name}: ${error.message}`; stack = error.stack || ''; }
  else if (error && typeof error === 'object') { message = String(error.message ?? JSON.stringify(error)); stack = String(error.stack || ''); }
  else message = String(error);
  const clean = text => (home ? text.split(home).join('~') : text).replace(/\r/g, '');
  message = clean(message).slice(0, 500);
  stack = clean(stack).split('\n').slice(1, 12).join('\n').slice(0, 1500); // 第一行就是 message
  return { message, stack };
}

function formatEntry({ where, message, stack }, version, date = new Date()) {
  return `[${stamp(date)}] 版本 ${version} · ${where}\n${message}${stack ? `\n${stack}` : ''}`;
}

function createErrorLog(file, version, { now = () => new Date() } = {}) {
  const recent = new Map(); // 同一个错误 1 分钟内只记一次
  let last = '';
  return {
    file,
    // 记下来了返回 true（重复的不记）
    write(where, error) {
      const { message, stack } = describeError(error);
      const key = `${where}|${message}`;
      const t = now().getTime();
      if (t - (recent.get(key) ?? -Infinity) < 60_000) return false;
      recent.set(key, t);
      last = formatEntry({ where, message, stack }, version, now());
      try {
        let old = '';
        try { old = fs.readFileSync(file, 'utf8'); } catch {}
        let text = old ? old + SEP + last : last;
        if (Buffer.byteLength(text) > MAX_BYTES) text = text.slice(-MAX_BYTES).replace(/^[\s\S]*?\n-{16}\n/, '');
        fs.writeFileSync(file, text + '\n');
      } catch {}
      return true;
    },
    // 最近一条（这次没记过就从文件里找最后一条）
    latest() {
      if (last) return last;
      try { return fs.readFileSync(file, 'utf8').trim().split(SEP).pop() || ''; } catch { return ''; }
    },
  };
}

module.exports = { createErrorLog, describeError, formatEntry };
