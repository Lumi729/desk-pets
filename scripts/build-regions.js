// 生成 lib/regions.json：全国 省 → 市 → 区县，每个区县带中心点经纬度（只在更新数据时跑一次，程序运行时不用）
//
// 数据来源（都是 MIT 许可证，许可证原文见 lib/regions-LICENSES.txt）：
// - 省市区县名单：npm 包 cn-division（https://github.com/kk-418/cn-division），民政部地名服务 2026 年数据
// - 中心点经纬度：PyPI 包 cpca（https://github.com/DQinYuan/chinese_province_city_area_mapper）里的 resources/adcodes.csv
//
// 用法：
//   npm pack cn-division && tar xzf cn-division-*.tgz -C /tmp/cn-division
//   下载 cpca 的 wheel 解压到 /tmp/cpca
//   node scripts/build-regions.js /tmp/cn-division/package/dist/code/pca.json /tmp/cpca/cpca/resources/adcodes.csv
const fs = require('fs');
const path = require('path');

const [pcaFile, csvFile] = process.argv.slice(2);
const pca = JSON.parse(fs.readFileSync(pcaFile, 'utf8'));

// 区划代码（6 位）→ [经度, 纬度]
const coords = new Map();
const names = new Map();
for (const line of fs.readFileSync(csvFile, 'utf8').split(/\r?\n/).slice(1)) {
  const [adcode, name, lon, lat] = line.split(',');
  if (!adcode || !lon || !lat) continue;
  coords.set(adcode.slice(0, 6), [Number(lon), Number(lat)]);
  names.set(adcode.slice(0, 6), name);
}

// 同一个省里，名字去掉「县 / 区 / 市」后一样的（县改区、县改市）
const stem = name => name.replace(/(自治县|自治旗|县|区|市|旗)$/, '');
const byStem = new Map();
for (const [code, name] of names) {
  if (code.endsWith('00')) continue;
  const key = `${code.slice(0, 2)}:${stem(name)}`;
  byStem.set(key, byStem.has(key) ? null : code); // 有重名就不用
}

// cpca 之后才改名 / 改代码的区县：用改名前的那个区县的位置
const RENAMED = {
  130181: '139002', 130682: '139001', 130284: '130223', 130505: '130526',
  140213: '140202', 140214: '140211', 140215: '140227', 140403: '140402', 140404: '140421',
  340210: '340221', 350405: '350427', 360404: '360421', 360704: '360721', 361104: '361121',
  370116: '371202', 411003: '411023', 430212: '430221', 450181: '450127', 510117: '510124',
  511504: '511521', 520281: '520222', 540602: '542421', 610118: '610125', 610482: '610427',
};

const round = n => Math.round(n * 10000) / 10000;
let exact = 0, renamed = 0, approx = 0;
function locate(code, name, fallback) {
  if (coords.has(code)) { exact++; return coords.get(code); }
  const old = RENAMED[code] || byStem.get(`${code.slice(0, 2)}:${stem(name)}`);
  if (old && coords.has(old)) { renamed++; return coords.get(old); }
  approx++;
  return fallback; // 新设的区县：用所在城市的中心点
}

const out = [];
for (const province of pca) {
  const pCode = `${province.c}0000`;
  const pPos = coords.get(pCode);
  const cities = [];
  for (const city of province.ch || []) {
    const cCode = String(city.c).padEnd(6, '0');
    const cPos = coords.get(cCode) || locate(cCode, city.n, pPos);
    // 下面是街道 / 乡镇（东莞、中山这类不设区的市）或者没有下一级：市本身就是一个选项
    const counties = (city.ch || []).filter(c => String(c.c).length === 6);
    const list = counties.length
      ? counties.map(c => { const [lon, lat] = locate(String(c.c), c.n, cPos); return [c.n, round(lat), round(lon)]; })
      : [[city.n, round(cPos[1]), round(cPos[0])]];
    cities.push([city.n, list]);
  }
  out.push([province.n, cities]);
}

fs.writeFileSync(path.join(__dirname, '..', 'lib', 'regions.json'), JSON.stringify(out));
console.log(`区县：${exact} 个用自己的位置，${renamed} 个用改名前的位置，${approx} 个用所在城市的中心点`);
