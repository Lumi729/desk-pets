const test = require('node:test');
const assert = require('node:assert');
const { weatherIdle, isRain, queriesFor, searchPlaces, fetchWeather } = require('../lib/weather');

const idle = (code, temperature = 20, hour = 12) => weatherIdle({ code, temperature }, hour);

test('picks the idle animation from the weather code', () => {
  assert.strictEqual(idle(0), '待机_晴天');
  assert.strictEqual(idle(1, 20, 6), '待机_晴天');
  assert.strictEqual(idle(1, 20, 19), '待机_晴夜');
  assert.strictEqual(idle(0, 20, 3), '待机_晴夜');
  assert.strictEqual(idle(2), '待机_多云');
  assert.strictEqual(idle(3), '待机_阴天');
  for (const code of [45, 48]) assert.strictEqual(idle(code), '待机_雾');
  for (const code of [51, 53, 55, 56, 57]) assert.strictEqual(idle(code), '待机_毛毛雨');
  for (const code of [61, 80]) assert.strictEqual(idle(code), '待机_雨天');
  for (const code of [63, 65, 66, 67, 81, 82]) assert.strictEqual(idle(code), '待机_大雨');
  for (const code of [71, 73, 75, 77, 85, 86]) assert.strictEqual(idle(code), '待机_下雪');
  for (const code of [95, 96, 99]) assert.strictEqual(idle(code), '待机_雷雨');
});

test('cloudy and overcast are not rain', () => {
  for (const code of [0, 1, 2, 3, 45, 48, 71]) assert.strictEqual(isRain(code), false);
  for (const code of [51, 57, 61, 67, 80, 82, 95, 99]) assert.strictEqual(isRain(code), true);
});

test('cold / hot only when it is not raining or snowing', () => {
  assert.strictEqual(idle(0, 5), '待机_降温');
  assert.strictEqual(idle(3, 9.9), '待机_降温');
  assert.strictEqual(idle(2, 33), '待机_炎热');
  assert.strictEqual(idle(0, 32), '待机_晴天');
  assert.strictEqual(idle(61, 5), '待机_雨天');
  assert.strictEqual(idle(71, -3), '待机_下雪');
  assert.strictEqual(idle(95, 35), '待机_雷雨');
});

test('unknown weather uses the normal idle', () => {
  assert.strictEqual(weatherIdle(null, 12), null);
  assert.strictEqual(weatherIdle({ code: null, temperature: 5 }, 12), null);
  assert.strictEqual(idle(42), null);
});

test('splits a full address into shorter searches', () => {
  assert.deepStrictEqual(queriesFor('长沙市岳麓区'), ['长沙市岳麓区', '岳麓区', '岳麓', '长沙']);
  assert.deepStrictEqual(queriesFor('湖南省长沙市'), ['湖南省长沙市', '长沙市', '长沙', '湖南']);
  assert.deepStrictEqual(queriesFor('广州市天河区'), ['广州市天河区', '天河区', '天河', '广州']);
  assert.deepStrictEqual(queriesFor('长沙'), ['长沙']);
});

test('lists candidate places, the ones matching the rest of the address first', async () => {
  const urls = [];
  const fake = async url => {
    urls.push(decodeURIComponent(url));
    const name = decodeURIComponent(url.match(/name=([^&]*)/)[1]);
    const results = {
      岳麓区: [{ id: 1, name: '岳麓区', admin2: '长沙市', admin1: '湖南省', country: '中国', latitude: 28.23, longitude: 112.93 }],
      岳麓: [
        { id: 2, name: '岳麓', admin1: '某省', country: '中国', latitude: 30, longitude: 110 },
        { id: 1, name: '岳麓区', admin2: '长沙市', admin1: '湖南省', country: '中国', latitude: 28.23, longitude: 112.93 },
      ],
    }[name];
    return { json: async () => (results ? { results } : {}) };
  };
  const places = await searchPlaces('长沙市岳麓区', fake);
  assert.deepStrictEqual(places.map(p => p.name), ['岳麓区', '岳麓']);
  assert.deepStrictEqual(places[0], { name: '岳麓区', label: '岳麓区 · 长沙市 · 湖南省 · 中国', latitude: 28.23, longitude: 112.93 });
  assert.match(urls[0], /name=长沙市岳麓区/);
});

test('asks for the weather at the saved coordinates', async () => {
  const urls = [];
  const fake = async url => { urls.push(url); return { json: async () => ({ current: { weather_code: 3, temperature_2m: 18.4 } }) }; };
  assert.deepStrictEqual(await fetchWeather({ latitude: 28.23, longitude: 112.93 }, fake), { code: 3, temperature: 18.4, description: '阴' });
  assert.strictEqual(urls.length, 1);
  assert.match(urls[0], /latitude=28.23&longitude=112.93/);
});

test('no weather is an error', async () => {
  await assert.rejects(fetchWeather({ latitude: 1, longitude: 2 }, async () => ({ json: async () => ({}) })));
});
