// Claude Code 联动：按 session_id 记每个会话在不在干活，算出狗狗该做什么
const IDLE_TIMEOUT = 10 * 60_000; // 10 分钟没收到事件就当它不干了
const SHORT_TURN = 10_000;        // 10 秒内干完的一轮算「很短」

function createClaudeActivity(onChange) {
  const sessions = new Map(); // id → { working, since, last }
  let working = false;
  const refresh = () => {
    const now = [...sessions.values()].some(s => s.working);
    if (now !== working) { working = now; onChange({ type: 'working', working }); }
  };
  return {
    get working() { return working; },
    get sessions() { return sessions; },
    event(name, sessionId, now = Date.now()) {
      const id = String(sessionId || 'default').slice(0, 100);
      const s = sessions.get(id) || { working: false, since: 0, last: now };
      s.last = now;
      if (name === 'UserPromptSubmit' || name === 'PreToolUse' || name === 'PostToolUse') {
        if (!s.working) { s.working = true; s.since = now; }
        sessions.set(id, s);
      } else if (name === 'Stop') {
        const took = s.working ? now - s.since : Infinity;
        s.working = false;
        s.since = 0;
        sessions.set(id, s);
        refresh();
        onChange({ type: 'done', short: took < SHORT_TURN, stillWorking: working });
        return;
      } else if (name === 'Notification') {
        // 在等你批准或回复：这时候它没在干活（按了 Esc 打断、出错时不会有 Stop，靠这个也能停下来）
        s.working = false;
        s.since = 0;
        sessions.set(id, s);
        onChange({ type: 'notify' });
      } else if (name === 'SessionEnd') {
        sessions.delete(id);
      } else return;
      refresh();
    },
    // 定时调用：太久没消息的会话不算在干活了
    sweep(now = Date.now()) {
      for (const [id, s] of sessions) if (now - s.last > IDLE_TIMEOUT) sessions.delete(id);
      refresh();
    },
    clear() { sessions.clear(); refresh(); },
  };
}

module.exports = { createClaudeActivity, IDLE_TIMEOUT, SHORT_TURN };
