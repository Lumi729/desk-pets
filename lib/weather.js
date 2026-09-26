// 天气：用 Open-Meteo（免费、不用密钥）。只发城市名去查，查到的天气只用来换待机动画。
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

// WMO 天气代码：51–67 毛毛雨/雨/冻雨，80–82 阵雨，95–99 雷雨
const RAIN_CODES = code => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;

// 下雨 → rain；冷（低于 10 度）→ cold；白天晴（代码 0/1）→ sunny；其它 → null（普通待机）
function classifyWeather(current) {
  if (!current) return null;
  const code = Number(current.weather_code);
  if (RAIN_CODES(code) || Number(current.precipitation) > 0.2) return 'rain';
  if (Number(current.temperature_2m) < 10) return 'cold';
  if ((code === 0 || code === 1) && Number(current.is_day) === 1) return 'sunny';
  return null;
}

async function fetchWeather(city, fetchImpl = fetch) {
  const geo = await (await fetchImpl(`${GEO}?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`)).json();
  const place = geo?.results?.[0];
  if (!place) throw new Error(`找不到城市：${city}`);
  const url = `${FORECAST}?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,precipitation,is_day&timezone=auto`;
  const data = await (await fetchImpl(url)).json();
  return { kind: classifyWeather(data?.current), place: place.name, temperature: data?.current?.temperature_2m };
}

module.exports = { classifyWeather, fetchWeather };
