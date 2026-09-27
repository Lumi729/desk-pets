const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };

// 哪些分组是打开的（记在这台电脑上，刷新也不会收起来）
let open = {};
try { open = JSON.parse(localStorage.getItem('panel-open') || '{}'); } catch {}
const DEFAULT_OPEN = ['选择宠物', '大小'];
const isOpen = key => (key in open ? open[key] : DEFAULT_OPEN.includes(key));

function leaf(node) {
  if (node.type === 'checkbox') {
    const row = el('label', { className: `toggle ${node.checked ? 'on' : ''} ${node.enabled ? '' : 'disabled'}` }, el('span', { textContent: node.label }), el('span', { className: 'switch' }));
    if (node.enabled && node.id) row.addEventListener('click', event => { event.preventDefault(); row.classList.toggle('on'); window.panelApi.click(node.id); });
    return row;
  }
  if (!node.id) return el('div', { className: 'note', textContent: node.label }); // 只是说明文字
  const button = el('button', { type: 'button', textContent: node.label, disabled: !node.enabled });
  button.addEventListener('click', () => window.panelApi.click(node.id));
  return button;
}

function group(node, path) {
  const key = path.concat(node.label).join(' / ');
  const card = el('details', { className: 'card', open: isOpen(key) }, el('summary', { textContent: node.label }));
  card.addEventListener('toggle', () => { open[key] = card.open; try { localStorage.setItem('panel-open', JSON.stringify(open)); } catch {} });
  const inner = el('div', { className: 'inner' });
  // 一整组都是单选（比如大小、托盘图标）：排成一排小按钮
  const items = node.submenu;
  if (items.length && items.every(i => i.type === 'radio')) {
    inner.append(el('div', { className: 'pills' }, ...items.map(i => {
      const b = el('button', { type: 'button', textContent: i.label, className: i.checked ? 'on' : '' });
      b.addEventListener('click', () => window.panelApi.click(i.id));
      return b;
    })));
  } else {
    for (const item of items) inner.append(render(item, path.concat(node.label)));
  }
  card.append(inner);
  return card;
}

function render(node, path = []) {
  if (node.type === 'separator') return el('hr');
  if (node.submenu) return group(node, path);
  return leaf(node);
}

function show(tree) {
  const y = window.scrollY;
  const sections = [[]];
  for (const node of tree) {
    if (node.type === 'separator') sections.push([]);
    else sections.at(-1).push(node);
  }
  $('panel').replaceChildren(...sections.filter(s => s.length).map(items => {
    const section = el('div', { className: 'section' });
    let buttons = null;
    for (const node of items) {
      if (!node.submenu && node.type === 'normal' && node.id) { // 连着的普通按钮放一排
        if (!buttons) { buttons = el('div', { className: 'buttons' }); section.append(buttons); }
        buttons.append(leaf(node));
      } else { buttons = null; section.append(render(node)); }
    }
    return section;
  }));
  window.scrollTo(0, y);
}

window.panelApi.onTree(show);
window.panelApi.get().then(show);
