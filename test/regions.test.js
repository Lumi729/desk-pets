const test = require('node:test');
const assert = require('node:assert');
const { REGIONS, DEFAULT_LOCATION, findCounty, manualLocation, normalizeLocation, locationLabel } = require('../lib/regions');

test('built-in regions cover every province with coordinates inside China', () => {
  assert.strictEqual(REGIONS.length, 31);
  let counties = 0;
  for (const [province, cities] of REGIONS) {
    assert.ok(cities.length, province);
    for (const [city, list] of cities) {
      assert.ok(list.length, city);
      for (const [name, lat, lon] of list) {
        counties++;
        assert.ok(name && lat > 15 && lat < 55 && lon > 72 && lon < 136, `${province}${city}${name}`);
      }
    }
  }
  assert.ok(counties > 2800);
});

test('picks a county and keeps its name and coordinates', () => {
  const loc = findCounty('湖南省', '长沙市', '岳麓区');
  assert.strictEqual(loc.kind, 'region');
  assert.ok(Math.abs(loc.latitude - 28.23) < 0.05 && Math.abs(loc.longitude - 112.93) < 0.05);
  assert.strictEqual(locationLabel(loc), '湖南省 · 长沙市 · 岳麓区');
  assert.strictEqual(locationLabel(findCounty('北京市', '北京市', '海淀区')), '北京市 · 海淀区');
  assert.strictEqual(findCounty('湖南省', '长沙市', '海淀区'), null);
});

test('saved coordinates come from the built-in data, not the settings file', () => {
  const loc = normalizeLocation({ kind: 'region', province: '湖南省', city: '长沙市', county: '岳麓区', latitude: 1, longitude: 2 });
  assert.notStrictEqual(loc.latitude, 1);
  assert.strictEqual(normalizeLocation({ name: '长沙', latitude: 28, longitude: 112 }), null); // 以前搜出来的地点：回到默认
  assert.strictEqual(normalizeLocation(null), null);
});

test('manual coordinates', () => {
  assert.deepStrictEqual(manualLocation('28.23456', '112.9'), { kind: 'manual', latitude: 28.2346, longitude: 112.9 });
  assert.strictEqual(locationLabel(manualLocation(28.2, 112.9)), '手动 28.2, 112.9');
  assert.strictEqual(manualLocation('', '112'), null);
  assert.strictEqual(manualLocation('91', '112'), null);
  assert.strictEqual(manualLocation('abc', '112'), null);
});

test('default is Changsha city center', () => {
  assert.strictEqual(locationLabel(null), '湖南省 · 长沙市');
  assert.strictEqual(DEFAULT_LOCATION.city, '长沙市');
});
