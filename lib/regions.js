// 天气地点：内置的全国 省 → 市 → 区县（带中心点经纬度），不用联网查。
// 数据来源见 scripts/build-regions.js 和 lib/regions-LICENSES.txt
const REGIONS = require('./regions.json'); // [[省, [[市, [[区县, 纬度, 经度], ...]], ...]], ...]

// 还没选区县时：湖南省长沙市（市中心）
const DEFAULT_LOCATION = { kind: 'default', province: '湖南省', city: '长沙市', county: '', latitude: 28.2281, longitude: 112.9389 };

function findCounty(province, city, county) {
  const cities = REGIONS.find(([name]) => name === province)?.[1];
  const counties = cities?.find(([name]) => name === city)?.[1];
  const hit = counties?.find(([name]) => name === county);
  if (!hit) return null;
  return { kind: 'region', province, city, county, latitude: hit[1], longitude: hit[2] };
}

function manualLocation(latitude, longitude) {
  const lat = Number(latitude), lon = Number(longitude);
  if (latitude === '' || longitude === '' || latitude == null || longitude == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { kind: 'manual', latitude: Math.round(lat * 10000) / 10000, longitude: Math.round(lon * 10000) / 10000 };
}

// 设置文件里读出来的 / 窗口里选的 → 检查过的地点；不对就是 null（用默认）
function normalizeLocation(place) {
  if (!place || typeof place !== 'object') return null;
  if (place.kind === 'region') return findCounty(place.province, place.city, place.county); // 经纬度以内置数据为准
  if (place.kind === 'manual') return manualLocation(place.latitude, place.longitude);
  return null;
}

// 「湖南省 · 长沙市 · 岳麓区」；北京这种省和市同名的只写一次
function locationLabel(place) {
  const loc = place || DEFAULT_LOCATION;
  if (loc.kind === 'manual') return `手动 ${loc.latitude}, ${loc.longitude}`;
  return [loc.province, loc.city, loc.county].filter((name, i, all) => name && name !== all[i - 1]).join(' · ');
}

module.exports = { REGIONS, DEFAULT_LOCATION, findCounty, manualLocation, normalizeLocation, locationLabel };
