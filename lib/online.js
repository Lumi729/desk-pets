// 联网：连到自己部署的 Cloudflare 中转服务，两个人用同一个配对码连在一起。
// 只收发互动事件（摸摸 / 戳一下）和对方是否在线，不传任何屏幕、窗口或键盘信息。
const { EventEmitter } = require('node:events');

const EVENT_TYPES = ['pet', 'poke'];
const NAME_MAX = 20;

// 「desk-pets-relay.xxx.workers.dev」「https://...」「wss://...」都行，统一变成 wss://.../ws?code=...
function relayUrl(server, code) {
  let text = String(server || '').trim();
  if (!text) throw new Error('还没填服务器地址');
  if (!/^[a-z]+:\/\//i.test(text)) text = `wss://${text}`;
  const url = new URL(text);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol === 'http:') url.protocol = 'ws:';
  else if (url.protocol !== 'wss:' && url.protocol !== 'ws:') throw new Error('服务器地址不对');
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  url.searchParams.set('code', String(code).trim());
  return url.toString();
}

const cleanName = name => String(name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, NAME_MAX);

function parseMessage(text) {
  let data;
  try { data = JSON.parse(String(text)); } catch { return null; }
  if (data?.type === 'presence') return { type: 'presence', online: Number(data.online) || 0 };
  if (EVENT_TYPES.includes(data?.type)) return { type: data.type, name: cleanName(data.name) };
  return null;
}

class OnlineLink extends EventEmitter {
  constructor() {
    super();
    this.status = 'off';       // off / connecting / connected
    this.peerOnline = false;
    this.ws = null;
    this.retry = 0;
    this.timers = [];
  }

  start(server, code) {
    this.stop();
    this.url = relayUrl(server, code);
    this.stopped = false;
    this.connect();
  }

  connect() {
    this.setStatus('connecting');
    let ws;
    try { ws = new WebSocket(this.url); } catch { return this.reconnect(); }
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.retry = 0;
      this.setStatus('connected');
      this.ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 30_000);
    });
    ws.addEventListener('message', event => {
      const message = parseMessage(event.data);
      if (!message) return;
      if (message.type === 'presence') this.setPeer(message.online >= 2);
      else this.emit('remote', message);
    });
    ws.addEventListener('close', () => {
      clearInterval(this.ping);
      if (this.ws !== ws) return;
      this.ws = null;
      this.setPeer(false);
      this.reconnect();
    });
    ws.addEventListener('error', () => {});
  }

  reconnect() {
    if (this.stopped) return;
    this.setStatus('connecting');
    const delay = Math.min(60_000, 2000 * 2 ** this.retry++);
    this.timers.push(setTimeout(() => { if (!this.stopped) this.connect(); }, delay));
  }

  send(type, name) {
    if (!EVENT_TYPES.includes(type) || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type, name: cleanName(name) }));
    return true;
  }

  stop() {
    this.stopped = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    clearInterval(this.ping);
    const ws = this.ws;
    this.ws = null;
    if (ws) try { ws.close(); } catch {}
    this.setPeer(false);
    this.setStatus('off');
  }

  setStatus(status) {
    if (status === this.status) return;
    this.status = status;
    this.emit('change');
  }

  setPeer(online) {
    if (online === this.peerOnline) return;
    this.peerOnline = online;
    this.emit('change');
  }
}

module.exports = { OnlineLink, relayUrl, parseMessage, cleanName };
