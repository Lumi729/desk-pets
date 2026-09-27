const $ = id => document.getElementById(id);
let entries = [];
let current = null;
let savingFavorite = false;
let loadRequest = 0;
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
async function load(key, fallbackKey) {
  const request = ++loadRequest;
  const data = await window.diaryApi.get();
  if (request !== loadRequest) return; // 后打开的日记优先，旧请求不能把页面换回去
  entries = data.entries;
  window.today = data.today;
  document.title = data.favOnly ? '收藏的日记' : '今天的日记';
  $('past-title').textContent = data.favOnly ? '收藏的日记' : '翻翻以前的日记';
  $('days').replaceChildren(...entries.map(e => new Option(`${e.fav ? '🔖 ' : ''}${label(e.key, data.today)}`, e.key)));
  show(entries.some(e => e.key === key) ? key : (fallbackKey || data.show));
}
$('days').addEventListener('change', () => show($('days').value));
$('fav').addEventListener('click', async () => {
  if (!current || savingFavorite) return;
  const entry = current;
  const index = entries.findIndex(e => e.key === entry.key);
  const neighbor = entries[index + 1]?.key || entries[index - 1]?.key;
  const request = loadRequest;
  savingFavorite = true;
  $('fav').disabled = true;
  $('days').disabled = true;
  try {
    const on = await window.diaryApi.fav(entry.key, !entry.fav);
    // 重新取列表，让收藏页立刻去掉取消的那篇；普通日记页仍留在原来的日期。
    if (request === loadRequest) {
      await load(entry.key, neighbor);
      $('status').textContent = on ? '收藏好啦，这一天会一直留着 ♡' : '取消收藏了';
    }
  } catch {
    $('status').textContent = '没保存成功，再试一次吧';
  } finally {
    savingFavorite = false;
    $('fav').disabled = false;
    $('days').disabled = false;
  }
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
