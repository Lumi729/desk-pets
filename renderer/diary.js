const $ = id => document.getElementById(id);
let entries = [];
let current = null;
const WEEK = '日一二三四五六';
function label(key, today) {
  const d = new Date(`${key}T00:00:00`);
  const text = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${WEEK[d.getDay()]}`;
  return key === today ? `${text}（今天）` : text;
}
function show(key) {
  const entry = entries.find(e => e.key === key) || entries[0];
  current = entry || null;
  $('card').hidden = !entry;
  $('empty').hidden = !!entry;
  $('save').disabled = !entry;
  $('status').textContent = '';
  if (!entry) return;
  $('days').value = entry.key;
  $('date').textContent = label(entry.key, window.today);
  $('text').textContent = entry.text;
  $('writer-gif').src = `../桌宠素材/${entry.writer}/互动_写日记.gif`;
  $('sign').textContent = `—— ${entry.writer} 记 ✎`;
  $('fav').classList.toggle('on', entry.fav);
  $('fav').title = entry.fav ? '已收藏（再点一下取消）' : '收藏这一天';
}
async function load(key) {
  const data = await window.diaryApi.get();
  entries = data.entries;
  window.today = data.today;
  document.title = data.favOnly ? '收藏的日记' : '今天的日记';
  $('past-title').textContent = data.favOnly ? '收藏的日记' : '翻翻以前的日记';
  $('days').replaceChildren(...entries.map(e => new Option(`${e.fav ? '🔖 ' : ''}${label(e.key, data.today)}`, e.key)));
  show(key || data.show);
}
$('days').addEventListener('change', () => show($('days').value));
$('fav').addEventListener('click', async () => {
  if (!current) return;
  current.fav = await window.diaryApi.fav(current.key, !current.fav);
  const option = [...$('days').options].find(o => o.value === current.key);
  if (option) option.textContent = `${current.fav ? '🔖 ' : ''}${label(current.key, window.today)}`;
  show(current.key);
  $('status').textContent = current.fav ? '收藏好啦，这一天会一直留着 ♡' : '取消收藏了';
});
$('save').addEventListener('click', async () => {
  if (!current) return;
  $('fav').style.visibility = 'hidden'; // 图片里不要书签按钮
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); // 等画好再截
  const r = $('card').getBoundingClientRect();
  const ok = await window.diaryApi.image(current.key, { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 12 });
  $('fav').style.visibility = '';
  $('status').textContent = ok ? '存好啦，在「图片/桌宠照片」里 📷' : '没存成功…';
});
window.diaryApi.onShow(key => load(key));
load();
