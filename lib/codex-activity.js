// 按聊天分别记录开工、等待、收工；旧一轮的消息不能把新一轮停掉或重新唤醒。
const { EVENTS } = require('./codex-hooks');
const IDLE_TIMEOUT = 10 * 60_000;
function createCodexActivity(onChange) {
  const sessions = new Map();
  let working = false;
  function refresh() {
    const next = [...sessions.values()].some(s => s.working);
    if (next !== working) { working = next; onChange({ type: 'working', working }); }
  }
  return {
    get working() { return working; },
    event(event, info = {}, now = Date.now()) {
      if (!EVENTS.includes(event) || typeof info.session_id !== 'string' || !info.session_id || info.session_id.length > 128) return false;
      const id = info.session_id;
      const turn = typeof info.turn_id === 'string' ? info.turn_id.slice(0, 128) : '';
      const at = Number.isFinite(info.sent_at) ? info.sent_at : now;
      if (Math.abs(at - now) > IDLE_TIMEOUT) return false;
      let s = sessions.get(id);
      if (s && at < s.at) return false;
      if (event === 'SessionEnd') { sessions.delete(id); refresh(); return true; }
      if (s && turn && s.turn && turn !== s.turn && event !== 'UserPromptSubmit') return false;
      if (s?.closed && (!turn || turn === s.turn) && event !== 'UserPromptSubmit') return false;
      if (!s || event === 'UserPromptSubmit') {
        if (!s && ['Stop', 'Interrupt'].includes(event)) return false;
        if (!s && sessions.size >= 128) sessions.delete(sessions.keys().next().value);
        s = { turn, since: now, at, last: now, working: false, closed: false };
        sessions.set(id, s);
      }
      s.at = at;
      s.last = now;
      if (event === 'Stop' || event === 'Interrupt') {
        s.working = false;
        s.closed = true;
        refresh();
        if (event === 'Stop' && !working) onChange({ type: 'done', short: now - s.since < 10_000 });
      } else if (event === 'PermissionRequest' || (event === 'PreToolUse' && info.needs_input === true)) {
        s.working = false;
        refresh();
        onChange({ type: 'waiting', stillWorking: working });
      } else {
        s.working = true;
        refresh();
      }
      return true;
    },
    sweep(now = Date.now()) {
      for (const [id, s] of sessions) if (now - s.last > IDLE_TIMEOUT) sessions.delete(id);
      refresh();
    },
    clear() { sessions.clear(); refresh(); },
  };
}
module.exports = { createCodexActivity, IDLE_TIMEOUT };
