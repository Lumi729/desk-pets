const http = require('node:http');
const { PORT, MARK, EVENTS } = require('./codex-hooks');
const { createCodexActivity } = require('./codex-activity');

function createCodexLink({ onChange, onEvent = () => {} }) {
  const activity = createCodexActivity(onChange);
  let server = null;
  let sweep = null;
  return {
    activity,
    async start(port = PORT) {
      if (server) return;
      const candidate = http.createServer((req, res) => {
        const event = (req.url || '').startsWith(MARK) ? req.url.slice(MARK.length) : '';
        if (req.method !== 'POST' || req.headers.origin || !EVENTS.includes(event)) { res.writeHead(404); res.end(); return; }
        let body = '';
        req.setEncoding('utf8');
        req.on('error', () => {});
        req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
        req.on('end', () => {
          res.writeHead(204); res.end();
          try {
            const data = JSON.parse(body);
            if (data && activity.event(event, data)) onEvent({ event, at: new Date() });
          } catch {} // 桌宠不向 hook 返回任何内容，也不记录原始消息
        });
      });
      candidate.requestTimeout = 3000;
      candidate.headersTimeout = 3000;
      await new Promise((resolve, reject) => {
        candidate.once('error', reject);
        candidate.listen(port, '127.0.0.1', () => { candidate.removeListener('error', reject); resolve(); });
      });
      server = candidate;
      sweep = setInterval(() => activity.sweep(), 30_000);
      return server.address().port;
    },
    async stop() {
      clearInterval(sweep);
      sweep = null;
      const closing = server;
      server = null;
      activity.clear();
      if (closing) await new Promise(resolve => { closing.close(resolve); closing.closeAllConnections(); });
    },
  };
}
module.exports = { createCodexLink };
