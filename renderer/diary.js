const $ = id => document.getElementById(id);
let entries = [];
const WEEK = '日一二三四五六';
function label(key, today) {
  const d = new Date(`${key}T00:00:00`);
  const text = `${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${WEEK[d.getDay()]}`;
  return key === today ? `${text}（今天）` : text;
}
function show(key) {
  const entry = entries.find(e => e.key === key) || entries[0];
  if (!entry) return;
  $('days').value = entry.key;
  $('date').textContent = label(entry.key, window.today);
  $('text').textContent = entry.text;
}
async function load(key) {
  const data = await window.diaryApi.get();
  entries = data.entries;
  window.today = data.today;
  $('days').replaceChildren(...entries.map(e => new Option(label(e.key, data.today), e.key)));
  show(key || data.show);
}
$('days').addEventListener('change', () => show($('days').value));
window.diaryApi.onShow(key => load(key));
load();
