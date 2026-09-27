const field = id => document.getElementById(id);

window.placeApi.get().then(info => { field('current').textContent = info.current; });

field('cancel').addEventListener('click', () => window.placeApi.cancel());

field('form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = field('query').value.trim();
  if (!text) return;
  field('error').textContent = '正在搜索…';
  field('results').replaceChildren();
  field('search').disabled = true;
  try {
    const places = await window.placeApi.search(text);
    field('error').textContent = places.length ? '选一个吧：' : '没找到这个地方，换个写法试试，比如只写「岳麓区」';
    for (const place of places) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'place';
      button.textContent = place.label;
      button.addEventListener('click', async () => {
        if (!await window.placeApi.choose(place)) field('error').textContent = '这个地点不太对，换一个试试';
      });
      field('results').append(button);
    }
  } catch {
    field('error').textContent = '搜索失败了，看看网络再试试';
  } finally {
    field('search').disabled = false;
  }
});
