const test = require('node:test');
const assert = require('node:assert');
const { classifyWeather, fetchWeather } = require('../lib/weather');

test('picks the idle animation from the weather', () => {
  assert.strictEqual(classifyWeather({ weather_code: 61, temperature_2m: 20, is_day: 1, precipitation: 1 }), 'rain');
  assert.strictEqual(classifyWeather({ weather_code: 3, temperature_2m: 20, is_day: 1, precipitation: 0.5 }), 'rain');
  assert.strictEqual(classifyWeather({ weather_code: 0, temperature_2m: 5, is_day: 1, precipitation: 0 }), 'cold');
  assert.strictEqual(classifyWeather({ weather_code: 0, temperature_2m: 25, is_day: 1, precipitation: 0 }), 'sunny');
  assert.strictEqual(classifyWeather({ weather_code: 0, temperature_2m: 25, is_day: 0, precipitation: 0 }), null);
  assert.strictEqual(classifyWeather({ weather_code: 3, temperature_2m: 18, is_day: 1, precipitation: 0 }), null);
  assert.strictEqual(classifyWeather(null), null);
});

test('looks up the city first, then the weather there', async () => {
  const urls = [];
  const fake = async url => {
    urls.push(url);
    return { json: async () => url.includes('geocoding')
      ? { results: [{ name: '长沙', latitude: 28.2, longitude: 112.9 }] }
      : { current: { weather_code: 63, temperature_2m: 15, is_day: 1, precipitation: 2 } } };
  };
  assert.deepStrictEqual(await fetchWeather('长沙', fake), { kind: 'rain', place: '长沙', temperature: 15 });
  assert.match(urls[0], /name=%E9%95%BF%E6%B2%99/);
  assert.match(urls[1], /latitude=28.2&longitude=112.9/);
});

test('unknown city is an error', async () => {
  await assert.rejects(fetchWeather('不存在的地方', async () => ({ json: async () => ({}) })));
});
