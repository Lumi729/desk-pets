const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { checkRelay } = require('../lib/relay-check');

// 假的连接：两条连到同一个「服务器」，能决定服务器转不转发串门消息
function fakeServer({ online = true, forwardsVisits = true } = {}) {
  const links = [];
  return () => {
    const link = new EventEmitter();
    link.peerOnline = false;
    link.start = () => {
      links.push(link);
      if (online && links.length === 2) setTimeout(() => { for (const l of links) { l.peerOnline = true; l.emit('change'); } }, 5);
    };
    link.stop = () => {};
    link.send = (type, name, pet) => {
      if (type.startsWith('visit') && !forwardsVisits) return true;
      for (const other of links) if (other !== link) setTimeout(() => other.emit('remote', { type, name, pet }), 5);
      return true;
    };
    return link;
  };
}

test('new server forwards visits', async () => {
  assert.strictEqual(await checkRelay('x', fakeServer(), 500), 'ok');
});

test('old server connects but drops visits', async () => {
  assert.strictEqual(await checkRelay('x', fakeServer({ forwardsVisits: false }), 200), 'old');
});

test('cannot reach the server', async () => {
  assert.strictEqual(await checkRelay('x', fakeServer({ online: false }), 200), 'offline');
});
