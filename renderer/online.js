const field = id => document.getElementById(id);
let defaultServer = '';

window.onlineApi.get().then(settings => {
  defaultServer = settings.defaultServer || '';
  field('name').textContent = settings.name || '千千';
  field('code').value = settings.code || '';
  field('server').value = settings.server || '';
  if (defaultServer) {
    field('server').placeholder = defaultServer;
    field('server-hint').textContent = '不填就用默认服务器，一般不用改。';
  } else {
    field('advanced').open = true;
    field('server').required = true;
    field('server-hint').textContent = '填你部署好的中转服务地址。';
  }
});

field('random').addEventListener('click', async () => {
  field('code').value = await window.onlineApi.randomCode();
  field('copied').textContent = '';
});

field('copy').addEventListener('click', () => {
  const code = field('code').value.trim();
  if (!code) return;
  window.onlineApi.copy(code);
  field('copied').textContent = '复制好啦，发给对方吧 ♡';
});

field('cancel').addEventListener('click', () => window.onlineApi.cancel());

field('form').addEventListener('submit', event => {
  event.preventDefault();
  const settings = { code: field('code').value.trim(), server: field('server').value.trim() };
  if (settings.code.length < 4) { field('error').textContent = '配对码至少要 4 个字哦'; return; }
  if (!settings.server && !defaultServer) { field('error').textContent = '还没填服务器地址哦'; return; }
  window.onlineApi.save(settings);
});
