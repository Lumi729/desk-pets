const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 直接运行日记页面的脚本，检查用户点击后的列表和卡片，不依赖 Electron 窗口。
function page(initialEntries, favOnly = true, save = null) {
  const entries = initialEntries.map(e => ({ text: e.key, writer: '灰鸮g老师', fav: true, ...e }));
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', hidden: false, disabled: false, options: [], style: {}, listeners: {},
      classList: { toggle() {} },
      replaceChildren(...options) { this.options = options; this.value = options[0]?.value || ''; },
      addEventListener(event, fn) { this.listeners[event] = fn; },
    });
    return elements.get(id);
  }
  const api = {
    get: async () => ({ today: '2026-09-27', show: entries[0]?.key, favOnly,
      entries: entries.filter(e => !favOnly || e.fav).map(e => ({ ...e })) }),
    fav: async (key, on) => {
      if (save) await save();
      entries.find(e => e.key === key).fav = on;
      return on;
    },
    onShow(fn) { this.show = fn; },
  };
  const context = vm.createContext({ document: { getElementById: element }, window: { diaryApi: api },
    Option: function(text, value) { return { textContent: text, value }; } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../renderer/diary.js'), 'utf8'), context);
  return { element, api, select(key) { element('days').value = key; element('days').listeners.change(); },
    click: () => element('fav').listeners.click() };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const days = ['2026-09-27', '2026-09-26', '2026-09-25'].map(key => ({ key }));

test('取消中间一篇收藏后立刻翻到下一篇，再取消末篇回到前一篇', async () => {
  const p = page(days);
  await settle();
  p.select(days[1].key);
  await p.click();
  assert.equal(p.element('days').value, days[2].key);
  assert.equal(p.element('text').textContent, days[2].key);
  assert.deepEqual(Array.from(p.element('days').options, e => e.value), [days[0].key, days[2].key]);
  await p.click();
  assert.equal(p.element('days').value, days[0].key);
});

test('最后一篇取消后显示空收藏夹，不能再保存图片', async () => {
  const p = page(days.slice(0, 1));
  await settle();
  await p.click();
  assert.equal(p.element('card').hidden, true);
  assert.equal(p.element('empty').hidden, false);
  assert.equal(p.element('save').disabled, true);
  assert.equal(p.element('days').options.length, 0);
});

test('在普通日记页取消收藏后保留原来的日期', async () => {
  const p = page(days, false);
  await settle();
  p.select(days[1].key);
  await p.click();
  assert.equal(p.element('days').value, days[1].key);
  assert.equal(p.element('days').options.length, 3);
  assert.ok(!p.element('days').options[1].textContent.includes('🔖'));
});

test('保存失败可重试，保存中连点不会重复提交', async () => {
  let rejectSave;
  let calls = 0;
  const p = page(days, true, () => { calls++; return new Promise((_, reject) => { rejectSave = reject; }); });
  await settle();
  const pending = p.click();
  assert.equal(p.element('fav').disabled, true);
  await p.click();
  assert.equal(calls, 1);
  rejectSave(new Error('disk unavailable'));
  await pending;
  assert.equal(p.element('fav').disabled, false);
  assert.equal(p.element('days').disabled, false);
  assert.equal(p.element('days').options.length, 3);
  assert.match(p.element('status').textContent, /没保存成功/);
});
