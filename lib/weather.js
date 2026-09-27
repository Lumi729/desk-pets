// 天气：用 Open-Meteo（免费、不用密钥）。
// 地点的经纬度只存在本机设置里，只发给 Open-Meteo 查天气，不发给联网服务器、也不发给朋友。
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

// WMO 天气代码 → 中文
const DESCRIPTIONS = {
  0: '晴', 1: '基本晴朗', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇',
  51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨', 56: '冻毛毛雨', 57: '冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '大冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '米雪', 80: '阵雨', 81: '中阵雨', 82: '强阵雨',
  85: '阵雪', 86: '大阵雪', 95: '雷雨', 96: '雷雨带冰雹', 99: '雷雨带大冰雹',
};

// 天气代码 → 待机动画（晴天要看白天晚上，另外算）
const IDLE_BY_CODE = {};
const put = (codes, name) => { for (const code of codes) IDLE_BY_CODE[code] = name; };
put([2], '待机_多云');
put([3], '待机_阴天');
put([45, 48], '待机_雾');
put([51, 53, 55, 56, 57], '待机_毛毛雨');
put([61, 80], '待机_雨天');
put([63, 65, 66, 67, 81, 82], '待机_大雨');
put([71, 73, 75, 77, 85, 86], '待机_下雪');
put([95, 96, 99], '待机_雷雨');

const WEATHER_IDLES = ['待机_晴天', '待机_晴夜', '待机_多云', '待机_阴天', '待机_雾', '待机_毛毛雨',
  '待机_雨天', '待机_大雨', '待机_雷雨', '待机_下雪', '待机_降温', '待机_炎热'];

// 只有毛毛雨、雨、阵雨、雷雨算下雨（多云、阴天不撑伞）
const isRain = code => ['待机_毛毛雨', '待机_雨天', '待机_大雨', '待机_雷雨'].includes(IDLE_BY_CODE[code]);
const isSnow = code => IDLE_BY_CODE[code] === '待机_下雪';
const describe = code => DESCRIPTIONS[code] || '未知天气';

// 选待机动画：weather = { code, temperature }，hour = 现在几点（0–23）。查不到 → null（普通待机）
function weatherIdle(weather, hour) {
  if (!weather || weather.code == null) return null;
  const code = Number(weather.code);
  if (!Number.isFinite(code)) return null;
  const temperature = weather.temperature == null ? NaN : Number(weather.temperature);
  if (!isRain(code) && !isSnow(code) && Number.isFinite(temperature)) {
    if (temperature < 10) return '待机_降温';
    if (temperature > 32) return '待机_炎热';
  }
  if (code === 0 || code === 1) return hour >= 6 && hour < 19 ? '待机_晴天' : '待机_晴夜';
  return IDLE_BY_CODE[code] || null;
}

// 「长沙市岳麓区」这种整段地址，地名库常常搜不到，所以再拆开搜「岳麓区」「岳麓」「长沙」
const SPLIT = /(?<=省|自治区|特别行政区|市|自治州|盟|地区|区|县|旗)/;
const strip = text => (text.length > 2 ? text.replace(/(省|市|区|县|旗|镇|乡|街道)$/, '') : text);
function queriesFor(text) {
  const full = String(text || '').trim();
  const parts = full.split(SPLIT).map(s => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || full;
  const list = [full, last, strip(last), ...parts.slice(0, -1).reverse().map(strip)];
  return [...new Set(list.filter(Boolean))];
}

function placeLabel(place) {
  const names = [place.name, place.admin3, place.admin2, place.admin1, place.country].filter(Boolean);
  return [...new Set(names)].join(' · ');
}

// 按地址搜候选地点，最多 limit 个；和输入里其它部分（比如「长沙」）对得上的排前面
async function searchPlaces(text, fetchImpl = fetch, limit = 8) {
  const queries = queriesFor(text);
  const pieces = [...new Set(queries.slice(1).map(strip))].filter(p => p.length >= 2);
  const found = new Map();
  for (const query of queries) {
    const geo = await (await fetchImpl(`${GEO}?name=${encodeURIComponent(query)}&count=10&language=zh&format=json`)).json();
    for (const place of geo?.results || []) {
      const key = place.id ?? `${place.latitude},${place.longitude}`;
      if (found.has(key) || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) continue;
      const label = placeLabel(place);
      const score = pieces.filter(p => label.includes(p)).length;
      found.set(key, { name: place.name, label, latitude: place.latitude, longitude: place.longitude, score, order: found.size });
    }
    if (found.size >= limit) break;
  }
  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ name, label, latitude, longitude }) => ({ name, label, latitude, longitude }));
}

// 查这个经纬度现在的天气
async function fetchWeather(place, fetchImpl = fetch) {
  const url = `${FORECAST}?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&timezone=auto`;
  const data = await (await fetchImpl(url)).json();
  const code = data?.current?.weather_code;
  if (code == null) throw new Error('查不到天气');
  return { code: Number(code), temperature: data.current.temperature_2m ?? null, description: describe(Number(code)) };
}

module.exports = { weatherIdle, isRain, isSnow, describe, queriesFor, searchPlaces, fetchWeather, WEATHER_IDLES };
