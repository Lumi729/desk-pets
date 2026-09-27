// 今日小日记 / 在一起多少天：只在本机数次数，不记具体内容
const pad = n => String(n).padStart(2, '0');
const dayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const KEEP_DAYS = 30;

const emptyDay = () => ({ pets: 0, clicks: 0, pomodoros: 0, hugs: 0, stacks: 0, weathers: [], festivals: [], text: '' });

// 记一笔：count（pets / clicks / pomodoros / hugs / stacks）加一，或者 weather / festival 记一个名字
function record(days, key, event, value) {
  const day = days[key] || (days[key] = emptyDay());
  if (['pets', 'clicks', 'pomodoros', 'hugs', 'stacks'].includes(event)) day[event] = (day[event] || 0) + 1;
  else if (event === 'weather' || event === 'festival') {
    const list = event === 'weather' ? day.weathers : day.festivals;
    if (value && !list.includes(value)) list.push(value);
  }
  return day;
}

// 只留最近 30 天
function prune(days, todayKey) {
  const keys = Object.keys(days).filter(k => /^\d{4}-\d\d-\d\d$/.test(k)).sort();
  const cutoff = new Date(`${todayKey}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - (KEEP_DAYS - 1));
  const min = dayKey(cutoff);
  const out = {};
  for (const k of keys) if (k >= min && k <= todayKey) out[k] = days[k];
  return out;
}

// 天气说明 → 日记里的一句话
function weatherLine(weathers) {
  const has = words => weathers.some(w => words.some(x => w.includes(x)));
  if (has(['雷'])) return '打雷下雨了，大家挤在一起撑着伞';
  if (has(['雨'])) return '下雨了还给大家撑了伞';
  if (has(['雪'])) return '下雪啦，大家一起看了雪';
  if (has(['雾'])) return '外面起雾了，朦朦胧胧的';
  if (has(['晴'])) return '天气很好，大家晒了晒太阳';
  if (has(['阴', '多云'])) return '天上云多多的';
  return '';
}

// 写一段轻松的日记
function composeDiary(day, name = '千千') {
  const d = day || emptyDay();
  const parts = [];
  if (d.pets) parts.push(`${name}摸了我们 ${d.pets} 次`);
  if (d.clicks) parts.push(`${d.pets ? '还' : `${name}`}戳了我们 ${d.clicks} 下`);
  if (d.pomodoros) parts.push(`陪你专注了 ${d.pomodoros} 个番茄钟`);
  if (d.hugs) parts.push(`大家贴贴了 ${d.hugs} 次`);
  if (d.stacks) parts.push(`叠叠乐 ${d.stacks} 次`);
  const weather = weatherLine(d.weathers || []);
  if (weather) parts.push(weather);
  if ((d.festivals || []).length) parts.push(`一起过了${d.festivals.join('和')}`);
  if (!parts.length) return `今天比较安静，大家乖乖陪着${name}～明天也要一起玩呀`;
  return `今天${parts.join('，')}～${d.pomodoros >= 3 ? `${name}好厉害！` : ''}晚安，明天见 ♡`;
}

// 在一起第几天（第一次打开那天是第 1 天）
function daysTogether(firstKey, date = new Date()) {
  const first = new Date(`${firstKey}T00:00:00`);
  const today = new Date(`${dayKey(date)}T00:00:00`);
  return Math.round((today - first) / 86_400_000) + 1;
}

// 纪念日：第 7、30、100、200 天，之后每满 365 天
const isAnniversary = n => [7, 30, 100, 200].includes(n) || (n >= 365 && n % 365 === 0);

module.exports = { dayKey, emptyDay, record, prune, composeDiary, daysTogether, isAnniversary, KEEP_DAYS };
