// 今天是什么节日、谁过生日（都按电脑的本地日期算）
const lunar = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'numeric', day: 'numeric' });

function lunarDate(date) {
  const parts = Object.fromEntries(lunar.formatToParts(date).map(p => [p.type, p.value]));
  // 不同环境里正月可能写成「1」或「正月」，闰月不算
  const first = parts.month === '1' || parts.month === '正月';
  return { first, day: Number(parts.day) };
}

const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, 12);

// 国庆 10/1–10/7，万圣节 10/31，圣诞 12/24–12/25，春节 除夕到正月初七
function festivalOn(date) {
  const m = date.getMonth() + 1, d = date.getDate();
  if (m === 10 && d >= 1 && d <= 7) return '国庆';
  if (m === 10 && d === 31) return '万圣节';
  if (m === 12 && (d === 24 || d === 25)) return '圣诞';
  const today = lunarDate(addDays(date, 0));
  if (today.first && today.day <= 7) return '春节';
  const tomorrow = lunarDate(addDays(date, 1));
  if (tomorrow.first && tomorrow.day === 1) return '春节'; // 除夕
  return null;
}

// 生日写成「MM-DD」，比如 03-14
const pad = n => String(n).padStart(2, '0');
const monthDay = date => `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function normalizeBirthday(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/);
  if (!m) return '';
  const month = Number(m[1]), day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${pad(month)}-${pad(day)}`;
}

function birthdaysOn(date, birthdays) {
  const today = monthDay(date);
  return Object.entries(birthdays || {}).filter(([, md]) => md === today).map(([name]) => name);
}

module.exports = { festivalOn, birthdaysOn, normalizeBirthday, monthDay };
