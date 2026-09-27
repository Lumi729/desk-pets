// 检查中转服务能不能串门：用一个随机配对码连两次，一边发「串门开始」，看另一边收不收得到。
// 旧版服务器只转发摸摸 / 戳一下，收不到就是还没重新部署。
const { randomPairCode } = require('./online');

function checkRelay(server, makeLink, timeout = 8000) {
  return new Promise(resolve => {
    const code = `check-${randomPairCode()}`;
    const a = makeLink(), b = makeLink();
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      a.stop();
      b.stop();
      resolve(result);
    };
    const timer = setTimeout(() => finish(a.peerOnline ? 'old' : 'offline'), timeout);
    b.on('remote', message => { if (message.type === 'visit-start') finish('ok'); });
    // 两边都连上以后，一边发一条「串门开始」
    a.on('change', () => { if (a.peerOnline) a.send('visit-start', '检查', '煤球猫猫'); });
    try {
      a.start(server, code);
      b.start(server, code);
    } catch {
      finish('offline');
    }
  });
}

module.exports = { checkRelay };
