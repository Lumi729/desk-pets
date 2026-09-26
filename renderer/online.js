const field = id => document.getElementById(id);

window.onlineApi.get().then(settings => {
  field('name').value = settings.name || '千千';
  field('code').value = settings.code || '';
  field('server').value = settings.server || '';
});

field('cancel').addEventListener('click', () => window.onlineApi.cancel());

field('form').addEventListener('submit', event => {
  event.preventDefault();
  const settings = { name: field('name').value.trim(), code: field('code').value.trim(), server: field('server').value.trim() };
  if (settings.code.length < 4) { field('error').textContent = '配对码至少要 4 个字哦'; return; }
  window.onlineApi.save(settings);
});
