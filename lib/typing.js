// 猜「是不是在打字」，不读取任何按键，只看两件事：
//   1. 系统说「不到 1 秒前有过输入」（键盘或鼠标都算）
//   2. 鼠标没有动
// 点一下鼠标也满足这两条，但只会持续不到 1 秒；打字是一直有输入。
// 所以要这样连续保持 HOLD 毫秒以上才算打字，单独点鼠标就不会被当成打字。
const HOLD = 1500;

function createTypingDetector(hold = HOLD) {
  let since = null;
  return function update({ now, idleSeconds, mouseMoved }) {
    const busyKeys = idleSeconds < 1 && !mouseMoved;
    if (!busyKeys) { since = null; return false; }
    if (since === null) since = now;
    return now - since >= hold;
  };
}

module.exports = { createTypingDetector, HOLD };
