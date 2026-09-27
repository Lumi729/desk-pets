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

// 今天发生了什么（一句一句）
function facts(d, name) {
  const list = [];
  if (d.pets) list.push(`${name}摸了我们 ${d.pets} 次`);
  if (d.clicks) list.push(`${d.pets ? '还' : name}戳了我们 ${d.clicks} 下`);
  if (d.pomodoros) list.push(`陪${name}专注了 ${d.pomodoros} 个番茄钟`);
  if (d.hugs) list.push(`大家贴贴了 ${d.hugs} 次`);
  if (d.stacks) list.push(`叠叠乐 ${d.stacks} 次`);
  const weather = weatherLine(d.weathers || []);
  if (weather) list.push(weather);
  if ((d.festivals || []).length) list.push(`一起过了${d.festivals.join('和')}`);
  return list;
}

// 每只宠物写日记的口吻
const VOICES = {
  千千猫猫: { // 俏皮
    write: (f, name, d) => `嘿嘿～今天${f.join('，')}！${d.pomodoros >= 3 ? `${name}今天超认真的嘛～` : ''}本喵超开心的，明天也要来找我玩哦 😼`,
    quiet: name => `今天好安静喔……${name}都没怎么理本喵，哼！明天要多摸摸我才行 😼`,
  },
  梨梨兔兔: { // 软萌
    write: (f, name, d) => `今天呀，${f.join('，')}呢～${d.pomodoros >= 3 ? `${name}好努力，要多喝水水哦，` : ''}软乎乎的一天，好开心～晚安安 ♡`,
    quiet: name => `今天安安静静的呢～兔兔乖乖陪着${name}，明天也要一起玩呀，晚安安 ♡`,
  },
  哥哥狗狗: { // 温柔
    write: (f, name, d) => `今天${f.join('，')}～${d.pomodoros >= 3 ? `${name}辛苦啦，` : ''}早点休息，晚安，明天见 ♡`,
    quiet: name => `今天比较安静，大家乖乖陪着${name}～累了就早点睡吧，明天见 ♡`,
  },
  梨梨哥哥: { // 酷一点但关心人
    write: (f, name, d) => `哼，今天${f.join('，')}。还行吧。${d.pomodoros >= 3 ? '学这么久，眼睛歇一歇。' : ''}别熬夜，早点睡。`,
    quiet: name => `今天没什么事。${name}也别总盯着屏幕，早点睡，听到没。`,
  },
  煤球猫猫: { // 热情
    write: (f, name, d) => `哇！！今天${f.join('！')}！！${d.pomodoros >= 3 ? `${name}也太厉害了吧！！` : ''}超级开心！！明天也冲鸭！！`,
    quiet: name => `今天好安静！！但是煤球一直在陪${name}哦！！明天一起玩吧！！`,
  },
  灰鸮g老师: { // 像认真做笔记
    write: (f, name, d) => `【今日观察记录】\n${f.map((x, i) => `${i + 1}. ${x.replace(/^还/, name)}`).join('\n')}\n结论：${d.pomodoros >= 3 ? `${name}今日学习状态良好，值得表扬。` : '充实的一天。'}请按时休息。`,
    quiet: name => `【今日观察记录】\n无特别事项。${name}状态平稳。\n结论：安静的一天也很好，请按时休息。`,
  },
};

// 写一段日记：writer 是写日记的宠物；absent 是本来该写、但今天不在的那只
function composeDiary(day, name = '千千', writer = '哥哥狗狗', absent = '') {
  const d = day || emptyDay();
  const voice = VOICES[writer] || VOICES['哥哥狗狗'];
  const f = facts(d, name);
  const body = f.length ? voice.write(f, name, d) : voice.quiet(name);
  return absent && absent !== writer ? `今天${absent}不在，由我代写～\n${body}` : body;
}

// 在一起第几天（第一次打开那天是第 1 天）
function daysTogether(firstKey, date = new Date()) {
  const first = new Date(`${firstKey}T00:00:00`);
  const today = new Date(`${dayKey(date)}T00:00:00`);
  return Math.round((today - first) / 86_400_000) + 1;
}

// 纪念日：第 7、30、100、200 天，之后每满 365 天
const isAnniversary = n => [7, 30, 100, 200].includes(n) || (n >= 365 && n % 365 === 0);

module.exports = { VOICES, dayKey, emptyDay, record, prune, composeDiary, daysTogether, isAnniversary, KEEP_DAYS };
