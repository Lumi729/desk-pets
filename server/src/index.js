// 千千梨梨桌宠的联网中转：同一个配对码的两个人进同一个「房间」（一个 Durable Object），
// 房间只转发「摸摸 / 戳一下」这两种互动和在线人数，别的什么都不转、也不保存。
import { DurableObject } from 'cloudflare:workers';

const EVENT_TYPES = ['pet', 'poke'];
const MAX_PEOPLE = 2;

export class PairRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // 心跳：客户端发 ping，自动回 pong，不会把房间叫醒
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('需要 WebSocket', { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_PEOPLE) return new Response('这个配对码已经有两个人了', { status: 409 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 500) return;
    let data;
    try { data = JSON.parse(message); } catch { return; }
    if (!EVENT_TYPES.includes(data?.type)) return;
    const name = String(data.name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20);
    const out = JSON.stringify({ type: data.type, name });
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) try { other.send(out); } catch {}
    }
  }

  webSocketClose(ws, code, reason) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch {}
    this.broadcastPresence(ws);
  }

  webSocketError(ws) {
    this.broadcastPresence(ws);
  }

  broadcastPresence(leaving) {
    const sockets = this.ctx.getWebSockets().filter(s => s !== leaving);
    const message = JSON.stringify({ type: 'presence', online: sockets.length });
    for (const s of sockets) try { s.send(message); } catch {}
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/ws') {
      return new Response('千千梨梨桌宠的中转服务正在运行 ♡', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    const code = (url.searchParams.get('code') || '').trim();
    if (code.length < 4 || code.length > 64) return new Response('配对码要 4 到 64 个字', { status: 400 });
    const room = env.PAIR_ROOM.get(env.PAIR_ROOM.idFromName(code));
    return room.fetch(request);
  },
};
