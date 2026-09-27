const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };
const icon = name => el('img', { src: `../桌宠素材/托盘图标/${name}-256.png`, alt: '' });

const INTROS = {
  千千猫猫: '爱捣蛋，最喜欢挑衅哥哥狗狗',
  梨梨兔兔: '软软的小兔子，会给千千猫猫送小鱼',
  哥哥狗狗: '靠谱的哥哥，谁摔倒了都会去扶',
  梨梨哥哥: '和哥哥狗狗见面先贴贴……然后打一架',
  煤球猫猫: '黑乎乎一团，突然就冲过去追着玩',
  灰鸮g老师: '戴眼镜的猫头鹰老师，最爱看书',
};

let data;
let step = 0;

function region(select, names, chosen) {
  select.replaceChildren(...names.map(name => new Option(name, name)));
  select.value = names.includes(chosen) ? chosen : names[0];
}

const STEPS = [
  () => [
    el('div', { className: 'big', textContent: '👋' }),
    el('h1', { textContent: '欢迎来到千千梨梨桌宠！' }),
    el('p', { textContent: '这些小家伙以后就住在你的桌面上啦，先认识一下吧～' }),
    el('div', { className: 'pets' }, ...data.pets.map(name => el('div', { className: 'pet-card' }, icon(name), el('b', { textContent: name }), el('span', { textContent: INTROS[name] || '' })))),
  ],
  () => {
    const cards = data.pets.map(name => {
      const card = el('div', { className: `pet-card pick ${data.shown[name] ? 'on' : 'off'}`, title: '点一下显示 / 藏起来' }, icon(name), el('b', { textContent: name }));
      card.addEventListener('click', () => {
        data.shown[name] = !data.shown[name];
        card.className = `pet-card pick ${data.shown[name] ? 'on' : 'off'}`;
        window.guideApi.showPet(name, data.shown[name]);
      });
      return card;
    });
    const sizes = el('div', { className: 'sizes' }, ...data.sizes.map(size => {
      const button = el('button', { type: 'button', textContent: `${Math.round(size * 100)}%`, className: size === data.size ? 'on' : '' });
      button.addEventListener('click', () => {
        data.size = size;
        for (const b of sizes.children) b.classList.toggle('on', b === button);
        window.guideApi.size(size);
      });
      return button;
    }));
    return [
      el('h1', { textContent: '想让谁出来玩？' }),
      el('p', { textContent: '点一下卡片就能让它出来 / 回去休息，马上就能在桌面上看到哦。' }),
      el('div', { className: 'pets' }, ...cards),
      el('h2', { textContent: '大小' }),
      sizes,
      el('div', { className: 'tip', textContent: '以后想改，右键宠物 →「选择宠物」「大小」就行～' }),
    ];
  },
  () => [
    el('div', { className: 'big', textContent: '🔍' }),
    el('h1', { textContent: '找不到宠物的时候' }),
    el('p', {}, '屏幕右下角的托盘里有一个小图标 ', icon('千千猫猫'), ' 就是我们家！'),
    el('ol', {},
      el('li', { textContent: '左键点一下：把宠物们藏起来 / 叫出来' }),
      el('li', { textContent: '右键点一下：打开设置菜单（和右键宠物的菜单一样）' })),
    el('div', { className: 'tip', textContent: '小图标可能躲在「^」小箭头里面，点开就能看到啦。' }),
  ],
  () => [
    el('div', { className: 'big', textContent: '🫳' }),
    el('h1', { textContent: '可以拖着宠物玩哦' }),
    el('ol', {},
      el('li', { textContent: '按住宠物就能拖着走～' }),
      el('li', { textContent: '拖到另一只头上松手，就是「叠叠乐」！' }),
      el('li', { textContent: '在半空中松手会掉下来，摔个趴趴（哥哥狗狗会来扶）' }),
      el('li', { textContent: '拖到窗口顶上，它还会站在上面' })),
    el('div', { className: 'tip', textContent: '点一下宠物会随机做个动作，鼠标在它身上快速左右晃，它会害羞哦～' }),
  ],
  () => {
    const province = el('select'), city = el('select'), county = el('select');
    const citiesOf = () => data.regions.find(([name]) => name === province.value)?.[1] || [];
    const countiesOf = () => citiesOf().find(([name]) => name === city.value)?.[1] || [];
    const loc = data.location.kind === 'manual' ? {} : data.location;
    region(province, data.regions.map(([name]) => name), loc.province || '湖南省');
    region(city, citiesOf().map(([name]) => name), loc.city || '长沙市');
    region(county, countiesOf().map(([name]) => name), loc.county);
    province.addEventListener('change', () => { region(city, citiesOf().map(([name]) => name)); region(county, countiesOf().map(([name]) => name)); });
    city.addEventListener('change', () => region(county, countiesOf().map(([name]) => name)));
    const now = el('span', { className: 'saved', textContent: data.place });
    const save = el('button', { type: 'button', className: 'main', textContent: '就用这里' });
    save.addEventListener('click', async () => {
      const label = await window.guideApi.place({ kind: 'region', province: province.value, city: city.value, county: county.value });
      if (label) { data.place = label; now.textContent = `${label} ✓`; }
    });
    return [
      el('div', { className: 'big', textContent: '🌦️' }),
      el('h1', { textContent: '你住在哪里呀？' }),
      el('p', { textContent: '宠物们会看你那里的天气换装扮：下雨撑伞、下雪、好热、好冷……' }),
      el('label', {}, '省', province), el('label', {}, '市', city), el('label', {}, '区县', county),
      el('div', { className: 'row left' }, save),
      el('p', {}, '现在用的：', now),
      el('div', { className: 'tip', textContent: '地点只存在这台电脑上，只用来查天气。以后可以在右键菜单「天气地点」里改，也能手动填经纬度。' }),
    ];
  },
  () => {
    const inputs = data.pets.map(name => el('input', { placeholder: '比如 3-14', value: data.birthdays[name] || '' }));
    const save = el('button', { type: 'button', className: 'main', textContent: '记住生日' });
    const saved = el('span', { className: 'saved' });
    save.addEventListener('click', async () => {
      const map = Object.fromEntries(data.pets.map((name, i) => [name, inputs[i].value]));
      const wrong = await window.guideApi.birthdays(map);
      $('error').textContent = wrong ? `${wrong}的生日写得不太对，写成「3-14」这样就行` : '';
      saved.textContent = wrong ? '' : '记住啦 ✓';
      if (!wrong) data.pets.forEach((name, i) => { data.birthdays[name] = inputs[i].value.trim(); });
    });
    return [
      el('h1', { textContent: '🎂 宠物们的生日' }),
      el('p', { textContent: '写上生日，那天它们会一起过生日！不写也没关系～' }),
      ...data.pets.map((name, i) => el('label', { className: 'birthday' }, el('span', { textContent: name }), inputs[i])),
      el('div', { className: 'row left' }, save, saved),
    ];
  },
  () => {
    const more = el('button', { type: 'button', textContent: '改专注 / 休息时间' });
    more.addEventListener('click', () => window.guideApi.open('more'));
    return [
      el('div', { className: 'big', textContent: '🍅' }),
      el('h1', { textContent: '番茄钟专注模式' }),
      el('p', { textContent: `右键 →「开始专注」，宠物们会安安静静陪你专注 ${data.pomodoro.focus} 分钟，g老师还会在旁边看书。` }),
      el('p', { textContent: `时间到了大家会叫你休息 ${data.pomodoro.rest} 分钟，休息好了点一下就能接着专注～` }),
      el('div', { className: 'row left' }, more),
    ];
  },
  () => {
    const open = el('button', { type: 'button', className: 'main', textContent: '打开联网设置' });
    open.addEventListener('click', () => window.guideApi.open('online'));
    return [
      el('div', { className: 'big', textContent: '💌' }),
      el('h1', { textContent: '和朋友连在一起' }),
      el('ol', {},
        el('li', { textContent: '右键 →「联网」→「联网设置」，写上你的名字' }),
        el('li', { textContent: '点「随机生成配对码」，再点「复制」发给朋友' }),
        el('li', { textContent: '朋友填上同一个配对码，两边都点「保存并连接」就好啦' })),
      el('p', { textContent: '连上以后，摸摸自己的宠物朋友那边会收到，还能戳一戳对方，宠物偶尔会跑去对方家串门哦～' }),
      el('div', { className: 'row left' }, open),
      el('div', { className: 'tip', textContent: data.online.enabled ? '你已经连上啦 ♡' : '不想联网也完全没问题，所有东西都只在你电脑上。' }),
    ];
  },
  () => [
    el('div', { className: 'big', textContent: '🎁' }),
    el('h1', { textContent: '会自己长大哦' }),
    el('p', { textContent: '有新版本时会自己在后台下载好，宠物头上会冒出「点我重启 ♡」，点一下就更新完啦。' }),
    el('p', { textContent: '不用自己去下载安装包～' }),
  ],
  () => {
    const show = el('button', { type: 'button', textContent: '✨ 马上看功能展示' });
    show.addEventListener('click', () => window.guideApi.open('showcase'));
    return [
      el('div', { className: 'big', textContent: '🎉' }),
      el('h1', { textContent: '准备好啦！' }),
      el('p', { textContent: '想再看一遍，可以点托盘里的「新手引导」；' }),
      el('p', { textContent: '想看所有效果，可以点「功能展示」，宠物们会挨个表演给你看～' }),
      el('div', { className: 'row left' }, show),
    ];
  },
];

function render() {
  $('error').textContent = '';
  $('dots').replaceChildren(...STEPS.map((_, i) => el('span', { className: i === step ? 'on' : '' })));
  const page = $('page');
  page.replaceChildren(...STEPS[step]());
  page.style.animation = 'none';
  void page.offsetWidth;
  page.style.animation = '';
  $('prev').disabled = step === 0;
  $('next').textContent = step === STEPS.length - 1 ? '完成 ♡' : '下一步';
  $('skip').hidden = step === STEPS.length - 1;
}

$('prev').addEventListener('click', () => { if (step > 0) { step--; render(); } });
$('next').addEventListener('click', () => { if (step < STEPS.length - 1) { step++; render(); } else window.guideApi.done(); });
$('skip').addEventListener('click', () => window.guideApi.done());

window.guideApi.get().then(result => { data = result; render(); });
