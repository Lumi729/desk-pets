const field = id => document.getElementById(id);
let regions = [];

function fill(select, names, chosen) {
  select.replaceChildren(...names.map(name => new Option(name, name)));
  select.value = names.includes(chosen) ? chosen : names[0];
}
const citiesOf = () => regions.find(([name]) => name === field('province').value)?.[1] || [];
const countiesOf = () => citiesOf().find(([name]) => name === field('city').value)?.[1] || [];
function showCities(chosen) { fill(field('city'), citiesOf().map(([name]) => name), chosen); }
function showCounties(chosen) { fill(field('county'), countiesOf().map(([name]) => name), chosen); }

window.placeApi.get().then(({ regions: list, current, label }) => {
  regions = list;
  field('current').textContent = label;
  const region = current.kind === 'manual' ? {} : current;
  fill(field('province'), regions.map(([name]) => name), region.province || '湖南省');
  showCities(region.city || '长沙市');
  showCounties(region.county);
  if (current.kind === 'manual') {
    field('manual').open = true;
    field('lat').value = current.latitude;
    field('lon').value = current.longitude;
  }
});

field('province').addEventListener('change', () => { showCities(); showCounties(); });
field('city').addEventListener('change', () => showCounties());
field('cancel').addEventListener('click', () => window.placeApi.cancel());

field('form').addEventListener('submit', async event => {
  event.preventDefault();
  const place = field('manual').open
    ? { kind: 'manual', latitude: field('lat').value.trim(), longitude: field('lon').value.trim() }
    : { kind: 'region', province: field('province').value, city: field('city').value, county: field('county').value };
  if (!await window.placeApi.choose(place)) {
    field('error').textContent = place.kind === 'manual' ? '经纬度不太对：纬度在 -90 到 90，经度在 -180 到 180' : '这个地点不太对，再选一次试试';
  }
});
