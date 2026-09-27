// 今日小日记 / 在一起多少天：只在本机数次数，不记具体内容
const pad = n => String(n).padStart(2, '0');
const dayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const KEEP_DAYS = 30;

const emptyDay = () => ({ pets: 0, clicks: 0, pomodoros: 0, hugs: 0, stacks: 0, weathers: [], festivals: [], episodes: {}, text: '' });
// 当天的小插曲（只记发生过几次）
// ghelp：被扶起来的是g老师自己（g老师写日记时口吻不一样）
const EPISODES = ['catch', 'blanket', 'visit', 'swap', 'helpup', 'ghelp', 'stack', 'fight', 'tease'];

// 记一笔：count（pets / clicks / pomodoros / hugs / stacks）加一，或者 weather / festival 记一个名字
function record(days, key, event, value) {
  const day = days[key] || (days[key] = emptyDay());
  if (['pets', 'clicks', 'pomodoros', 'hugs', 'stacks'].includes(event)) day[event] = (day[event] || 0) + 1;
  else if (event === 'episode') {
    if (!EPISODES.includes(value)) return day;
    day.episodes = day.episodes || {};
    day.episodes[value] = (day.episodes[value] || 0) + 1;
  } else if (event === 'weather' || event === 'festival') {
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
  for (const k of keys) if ((k >= min && k <= todayKey) || days[k]?.fav) out[k] = days[k]; // 收藏的一直留着
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
function facts(d, name, withEpisodes = false) {
  const list = [];
  if (d.pets) list.push(`${name}摸了我们 ${d.pets} 次`);
  if (d.clicks) list.push(`${d.pets ? '还' : name}戳了我们 ${d.clicks} 下`);
  if (d.pomodoros) list.push(`陪${name}专注了 ${d.pomodoros} 个番茄钟`);
  if (d.hugs) list.push(`大家贴贴了 ${d.hugs} 次`);
  if (d.stacks && !withEpisodes) list.push(`叠叠乐 ${d.stacks} 次`); // 开着小插曲时，叠叠乐写进小插曲里
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
  '99狐狐': { // 温柔又有点小得意
    write: (f, name, d) => `嘻嘻，今天${f.join('，')}～${d.pomodoros >= 3 ? `${name}好认真，不过也是因为有狐狐陪着嘛，` : '都是托狐狐的福哦，'}晚安，要梦到狐狐 ♡`,
    quiet: name => `今天安安静静的～狐狐一直乖乖陪着${name}哦，是不是很懂事？晚安 ♡`,
  },
  灰鸮g老师: { // 像认真做笔记
    write: (f, name, d) => `【今日观察记录】\n${f.map((x, i) => `${i + 1}. ${x.replace(/^还/, name)}`).join('\n')}\n结论：${d.pomodoros >= 3 ? `${name}今日学习状态良好，值得表扬。` : '充实的一天。'}请按时休息。`,
    quiet: name => `【今日观察记录】\n无特别事项。${name}状态平稳。\n结论：安静的一天也很好，请按时休息。`,
  },
};

// 小插曲：每只宠物用自己的口吻提一句（n 是发生了几次）
const times = n => (n > 1 ? ` ${n} 次` : '');
const EPISODE_LINES = {
  千千猫猫: {
    catch: n => `g老师摔倒了${times(n)}，有人帮它接住了眼镜，嘿嘿，本喵看见啦`,
    blanket: () => '哥哥狗狗半夜给本喵盖了被子，哼，算他有良心',
    visit: () => '家里来串门的客人啦，本喵表现超好的',
    swap: () => '哥哥狗狗和g老师又把眼镜戴反了，笑死本喵了',
    helpup: n => `有人摔趴趴了${times(n)}，哥哥狗狗跑去扶，跑得好快`,
    stack: n => `玩了${n > 1 ? ` ${n} 次` : ''}叠叠乐，本喵要站最上面！`,
    fight: () => '两个哥哥又打起来了，本喵在旁边嗑瓜子',
    tease: n => `本喵今天挑衅了${n > 1 ? ` ${n} 次` : '一次'}哥哥，赢麻了`,
  },
  梨梨兔兔: {
    catch: () => 'g老师摔倒的时候，眼镜被接住了，好险呀～',
    blanket: () => '哥哥狗狗给千千猫猫盖了被子，暖暖的～',
    visit: () => '有小伙伴来串门了，好开心呀～',
    swap: () => '哥哥狗狗和g老师换了眼镜戴，看起来好好笑呢',
    helpup: () => '有人摔倒了，哥哥狗狗把他扶起来，还摸摸头～',
    stack: () => '大家叠叠乐叠得高高的，兔兔有点怕怕',
    fight: () => '两个哥哥吵架了……兔兔希望他们快点和好',
    tease: () => '兔兔今天鼓起勇气挑衅了哥哥，嘿嘿',
  },
  哥哥狗狗: {
    catch: () => 'g老师摔了一跤，好在眼镜被接住了',
    blanket: () => '晚上给千千猫猫盖好了被子，别着凉',
    visit: () => '今天有朋友家的宝贝来串门，招待得还不错',
    swap: () => '又和g老师把眼镜戴反了，下次要看清楚',
    helpup: n => `扶了摔倒的小家伙${n > 1 ? ` ${n} 次` : ''}，拍拍灰就好啦`,
    stack: () => '大家玩叠叠乐，我在最下面撑着',
    fight: () => '和梨梨哥哥又闹了一下，过一阵就会和好的',
    tease: () => '被千千猫猫挑衅了，没关系，我让着她',
  },
  梨梨哥哥: {
    catch: () => 'g老师摔了，眼镜倒是有人接住了。走路看路。',
    blanket: () => '哥哥狗狗半夜还给人盖被子，挺细心的。',
    visit: () => '家里来了客人。还行，挺乖的。',
    swap: () => '那俩又戴错眼镜了。无语。',
    helpup: () => '有人摔了，哥哥狗狗去扶的。下次小心点。',
    stack: () => '他们非要叠叠乐，我就勉强陪着玩了。',
    fight: () => '和哥哥狗狗打了一架。他先动的手。',
    tease: () => '梨梨兔兔又来挑衅我。算了，不跟她计较。',
  },
  煤球猫猫: {
    catch: () => '接住g老师的眼镜啦！！超帅的！！',
    blanket: () => '哥哥狗狗给千千猫猫盖被子！！好温柔！！',
    visit: () => '有客人来串门！！一起玩了超久！！',
    swap: () => '哥哥狗狗和g老师眼镜戴反了！！哈哈哈哈！！',
    helpup: () => '有人摔倒了！！哥哥狗狗冲过去扶！！好快！！',
    stack: () => '叠叠乐！！叠得超高！！',
    fight: () => '两个哥哥打架了！！打得好激烈！！',
    tease: () => '有人挑衅哥哥！！现场好热闹！！',
  },
  '99狐狐': {
    catch: () => 'g老师摔倒时眼镜被接住啦，狐狐也有帮忙看着哦',
    blanket: () => '哥哥狗狗给千千猫猫盖了被子，狐狐看到了，好温柔～',
    visit: () => '有客人来串门，狐狐招待得超周到的，嘻嘻',
    swap: () => '哥哥狗狗和g老师眼镜戴反了，只有狐狐一眼就看出来了',
    helpup: () => '有人摔倒了，哥哥狗狗扶起来的，狐狐在旁边加油',
    stack: () => '玩了叠叠乐，狐狐站得稳稳的，厉害吧',
    fight: () => '两个哥哥又打架了，狐狐在旁边劝了好久呢',
    tease: () => '有人挑衅哥哥狗狗和梨梨哥哥，狐狐才不参与这种幼稚的事～',
  },
  灰鸮g老师: {
    catch: n => `今日摔倒${n > 1 ? ` ${n} 次` : '一次'}。眼镜被及时接住。此条请勿外传。`,
    blanket: () => '夜间观察：哥哥狗狗为千千猫猫盖被。温度适宜。',
    visit: () => '有访客来访。礼仪良好。',
    swap: () => '与哥哥狗狗误换眼镜一次。已更正。此条请勿外传。',
    helpup: () => '观察到同伴摔倒。哥哥及时赶到，处理得当。',
    ghelp: n => `今日摔倒${n > 1 ? ` ${n} 次` : '一次'}。哥哥及时赶到。此条请勿外传。`,
    stack: n => `叠叠乐${n > 1 ? ` ${n} 次` : '一次'}，结构稳定性有待提高。`,
    fight: () => '两位哥哥发生冲突一次。建议加强沟通。',
    tease: () => '观察到挑衅行为。已记录在案。',
  },
};
function episodeLines(d, writer) {
  const lines = EPISODE_LINES[writer] || EPISODE_LINES['哥哥狗狗'];
  const eps = { ...(d.episodes || {}) };
  if (d.stacks && !eps.stack) eps.stack = d.stacks; // 叠叠乐也算小插曲
  if (eps.ghelp && !lines.ghelp) { eps.helpup = (eps.helpup || 0) + eps.ghelp; delete eps.ghelp; } // 别的宠物写：都算「有人被扶起来」
  return EPISODES.filter(type => eps[type] && lines[type]).map(type => lines[type](eps[type]));
}

// 写一段日记：writer 是写日记的宠物；absent 是本来该写、但今天不在的那只
function composeDiary(day, name = '千千', writer = '哥哥狗狗', absent = '', withEpisodes = true) {
  const d = day || emptyDay();
  const voice = VOICES[writer] || VOICES['哥哥狗狗'];
  const f = facts(d, name, withEpisodes);
  let body = f.length ? voice.write(f, name, d) : voice.quiet(name);
  const eps = withEpisodes ? episodeLines(d, VOICES[writer] ? writer : '哥哥狗狗') : [];
  const end = line => (/[。！!～？?♡]$/.test(line) ? line : `${line}。`);
  if (eps.length) body += writer === '灰鸮g老师' ? `\n【附记】\n${eps.join('\n')}` : `\n对了，${eps.map(end).join('')}`;
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

module.exports = { VOICES, EPISODES, EPISODE_LINES, dayKey, emptyDay, record, prune, composeDiary, daysTogether, isAnniversary, KEEP_DAYS };
