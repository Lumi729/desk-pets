// 桌宠的动作逻辑：待机、走路、拖动、点击动作、睡觉、贴贴、叠叠乐、提醒气泡、鼠标互动、看你在做什么。
(() => {
  // 出错了告诉主程序记进错误日志（只有错误信息，没有别的）
  const reportError = (message, stack) => { try { window.petApi.reportError({ message: String(message || '').slice(0, 500), stack: String(stack || '').slice(0, 1500) }); } catch {} };
  window.addEventListener('error', event => reportError(event.message, event.error?.stack));
  window.addEventListener('unhandledrejection', event => reportError(event.reason?.message || event.reason, event.reason?.stack));
  const logError = console.error.bind(console);
  console.error = (...args) => { logError(...args); const err = args.find(a => a instanceof Error); reportError(args.map(a => (a instanceof Error ? a.message : String(a))).join(' '), err?.stack); };

  const SCALE = 0.7;               // 「100%」时宠物的大小（GIF 原图 × 这个倍数）
  const WALK_SPEED = 70;           // 走路速度（像素/秒）
  const SLEEP_AFTER = 60_000;      // 多久没人理就睡觉（毫秒）
  const WAKE_DISTANCE = 160;       // 鼠标离多近会醒（像素）
  const LOOK_DISTANCE = 220;       // 鼠标离多近会转头看（像素）
  const HUG_DISTANCE = 120;        // 相邻两只靠多近算挨在一起（像素，跟着「大小」一起变）
  const COMBO_COOLDOWN = 30_000;   // 同一组贴贴 / 叠叠乐完多久内不再来（毫秒）
  const HUG_TIME = 3_000;          // 贴贴至少播多久
  const STACK_TIME = 4_000;        // 叠叠乐播多久后散开
  const COMBO_REST = 10_000;       // 刚散开的宠物多久内不参加别的贴贴
  const FIGHT_COOLDOWN = 120_000;  // 打完架以后这两只多久内不再贴贴
  const MIN_PLAY = 2_000;          // 很短的动作至少播这么久（会重复几遍）
  const GRAVITY = 2_600;           // 重力：拖得越高，落地时越快
  const FOOT = () => 10 * SCALE * size; // GIF 底下透明的那一点，站窗口顶时让脚踩在边上
  const JUMP_REACH = 350;          // 离窗口多远以内可以直接跳上去（像素）
  const SPLAT_HEIGHT = 40;         // 从多高掉下来才会摔趴趴（像素）
  const TYPING_AFTER = 0;          // 打字多久开始陪你敲代码（毫秒），0 = 一打字就换
  const SWEAT_EVERY = 30_000;      // CPU 一直很忙时多久冒一次冷汗
  const LOW_BATTERY_EVERY = 10 * 60_000; // 电量低时多久提醒一次
  const NIGHT_EVERY = 20 * 60_000; // 半夜多久催一次睡觉
  const MEALS = [[11 * 60 + 50, 12 * 60 + 30], [17 * 60 + 50, 18 * 60 + 30]]; // 12 点、18 点左右
  const SHAKE_STEP = 12;           // 鼠标来回晃：每次至少移动这么多像素
  const SHAKE_TURNS = 4;           // 1 秒内来回这么多次算「晃」
  // 这些是特定时候才播的，点宠物时不会随机抽到
  const CORE = ['纪念日', '待机', '向左走', '向右走', '睡觉', '向左看', '向右看', '掉落', '摔趴趴', '冒冷汗',
    '专注', '叼胡萝卜向左走', '叼胡萝卜向右走', '叼小鱼向左走', '叼小鱼向右走',
    '国庆', '万圣节', '圣诞', '春节', '生日'];
  const CHASE_SPEED = 3;           // 煤球猫猫冲过去的速度（平时的几倍）
  const FLEE_SPEED = 2.2;          // 被追的跑开的速度
  const SNACK_SPEED = 1.2;         // 叼着零食走的速度
  const MAKEUP_AFTER = 180_000;    // 打完架过多久才会和好
  const CELEBRATE_EVERY = [180_000, 360_000]; // 过节 / 生日时隔多久播一次
  // 送零食：谁叼什么给谁，对方吃什么
  const SNACKS = [
    { giver: '千千猫猫', receiver: '梨梨兔兔', carry: '叼胡萝卜', eat: '吃胡萝卜' },
    { giver: '梨梨兔兔', receiver: '千千猫猫', carry: '叼小鱼', eat: '吃小鱼' },
  ];
  const ACTIVITY_ANIM = { code: '敲代码', video: '看视频', music: '跳舞' };

  const api = window.petApi;
  const stage = document.getElementById('stage');
  const hitCanvas = document.createElement('canvas');
  hitCanvas.width = hitCanvas.height = 5;
  const hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true });

  let pets = [];
  const Combos = window.PetCombos;
  const Teases = window.PetTeases;
  let combos = [];                 // 正在播的贴贴 / 叠叠乐
  let comboClips = {};             // 组合名 → { row: 贴贴, stack: 叠叠乐 }
  const comboCooldown = new Map(); // 「row/stack:组合名」→ 冷却到什么时候
  let shown = {};                  // 每只宠物显示不显示
  let weatherKind = null;          // 主程序按天气选好的待机动画名（比如「待机_阴天」），null = 普通待机
  let today = { festival: null, birthdays: [] };
  let focusing = false;            // 番茄钟专注中
  let nextChase = performance.now() + 100_000;
  let nextSnack = performance.now() + 140_000;
  const needsMakeup = new Set();   // 打完架还没和好的组合
  let lastBirthdayBubble = -Infinity;
  let photoBusy = false;
  let scenes = [];                 // 正在演的小剧情（挑衅）
  let petData = {};                // 每只宠物的动画（来串门的客人也用这个）
  let visitPets = {};              // 哪几只允许去串门
  let nextVisit = performance.now() + 15 * 60_000;
  const VISIT_EVERY = [10 * 60_000, 25 * 60_000]; // 多久派一只去对方家串门
  const VISIT_STAY = [3 * 60_000, 5 * 60_000];    // 客人在这里玩多久
  const AWAY_MAX = 10 * 60_000;                    // 自己的宠物最多在外面待多久（万一对方那边出了问题也会回家）
  let nextTease = performance.now() + 120_000;
  const TEASE_NEAR = 600;          // 离得多近才会挑衅（像素）
  const G = '灰鸮g老师';
  const DOG = '哥哥狗狗';
  const LONG_TYPING = 5 * 60_000;  // 连续打字多久算「写了好久」
  const TYPING_GAP = 10_000;       // 停下来多久算写完了（中间停不到 10 秒还算连续）
  let typingRun = null;            // { start, lastEnd } 这一段连续打字
  let blanketNight = '';           // 今晚盖过被子了没有
  // g老师的书里夹没夹书签（批改作业结束后夹上，下次批改作业时用掉）；关了再开也记得
  let hasBookmark = false;
  try { hasBookmark = localStorage.getItem('g-bookmark') === '1'; } catch {}
  const setBookmark = on => { hasBookmark = on; try { localStorage.setItem('g-bookmark', on ? '1' : '0'); } catch {} };
  const GLASSES = ['互动_扶眼镜1', '互动_扶眼镜2', '互动_扶眼镜3', '互动_擦眼镜']; // 5 秒内连续点，一下比一下多
  const CURIOUS_AFTER = 3000;      // 鼠标在g老师旁边停多久，它会歪头看
  const READ_TIME = [20_000, 40_000]; // g老师平时偶尔看书看多久
  const READ_HUG_TIME = 6000;      // 别的宠物挤进来一起看书看多久
  const SWAP_EVERY = 2 * 3600_000; // 两个眼镜交换：最多多久一次
  const SWAP_NEAR = 400;           // 离多近才会交换眼镜（像素，按大小缩放）
  const CATCH_NEAR = 300;          // g老师摔倒时，离多近的宠物能接住眼镜（像素，按大小缩放）
  const CATCH_CHANCE = 0.6;        // 接住眼镜的概率
  const WATCH_NEAR = 300;          // g老师看书睡着时，离多近的宠物会来围观
  let focusHalfAt = Infinity;      // 专注到一半的时候（g老师打个瞌睡）
  let cursorStill = { x: -1, y: -1, since: 0 };
  let features = { time: true, sit: true, mouse: true, activity: true, typing: true, system: true, perch: true };
  let size = 1;                   // 右键菜单里的「大小」
  let peerOnline = false;          // 联网的对方在不在线（在线就头顶冒小爱心）
  let screens = [{ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight, primary: true }]; // 每块屏幕（页面坐标）
  let ledge = null;                // 当前窗口顶边 { id, x, y, w }（页面坐标），没有就是 null
  let activity = { kind: null, typing: false };
  let typingSince = 0;
  let cpuHot = false;
  let lastBatteryNag = -Infinity;
  let cursor = null;
  let ignoringMouse = true;
  let lastTime = performance.now();
  let lastMouseMove = 0;
  let nextClockCheck = 0;
  let lastNightNag = -Infinity;
  const mealsDone = new Set();

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  function makeClip(gif) {
    return { blob: new Blob([gif.bytes], { type: 'image/gif' }), gw: gif.width, gh: gif.height, duration: gif.duration };
  }

  // 每次换动画都用新的地址，这样 GIF 一定从第一帧开始播。
  function playClip(sprite, clip) {
    if (sprite.url) URL.revokeObjectURL(sprite.url);
    sprite.url = URL.createObjectURL(clip.blob);
    sprite.img.src = sprite.url;
    sprite.clip = clip;
    fitSize(sprite);
  }

  function fitSize(sprite) {
    sprite.w = sprite.clip.gw * SCALE * size;
    sprite.h = sprite.clip.gh * SCALE * size;
    sprite.el.style.width = `${sprite.w}px`;
    sprite.el.style.height = `${sprite.h}px`;
  }

  function makeSprite(className) {
    const el = document.createElement('div');
    el.className = className;
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    el.append(img);
    stage.append(el);
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    stage.append(bubble);
    const heart = document.createElement('div');
    heart.className = 'heart';
    heart.textContent = '♥';
    heart.hidden = true;
    stage.append(heart);
    return { el, img, url: '', w: 0, h: 0, clip: null, bubble, bubbleUntil: 0, heart };
  }

  function createPet(id, data, startX) {
    const clips = {};
    for (const [name, gif] of Object.entries(data.anims)) clips[name] = makeClip(gif);
    const now = performance.now();
    const pet = {
      id, name: data.name, clips,
      actions: Object.keys(clips).filter(name => !CORE.includes(name) && !name.startsWith('待机_') && !Teases.isTeaseAnim(name)), // 天气待机、挑衅_ / 回应_ 只在特定时候用
      ...makeSprite('pet'),
      x: startX, y: 0, vy: 0,
      state: 'idle', anim: '', until: 0, nextThink: now + rand(1500, 4000), nextActivity: now + rand(3000, 8000), nextSweat: 0,
      target: startX, lastAttention: now, visible: false, drag: null, shake: null, shyUntil: 0,
    };
    pet.el.title = data.name;
    pet.el.addEventListener('pointerdown', event => onPointerDown(pet, event));
    pet.el.addEventListener('pointermove', event => onPointerMove(pet, event));
    pet.el.addEventListener('pointerup', event => onPointerUp(pet, event));
    pet.el.addEventListener('pointercancel', event => onPointerUp(pet, event));
    return pet;
  }

  function resolveAnim(pet, name) {
    return pet.clips[name] ? name : '待机';
  }

  function setAnim(pet, name, restart = false) {
    const key = resolveAnim(pet, name);
    const clip = pet.clips[key];
    if (pet.anim === key && !restart) return clip;
    pet.anim = key;
    pet.el.dataset.anim = key;
    playClip(pet, clip);
    return clip;
  }

  // 待机动画：打开天气时按天气换
  function idleAnim(pet) {
    const name = weatherKind;
    return features.weather && name && pet.clips[name] ? name : '待机'; // 这只没有这个天气的动画 → 普通待机
  }

  function goIdle(pet, now) {
    pet.looking = false;
    // 正在演剧情（挑衅、扶起来……）的中间：一步做完马上接下一步，这时不换回待机动画，
    // 免得每一步中间闪一下待机。只有走路停下来时才换成待机
    if (pet.inScene) {
      pet.state = 'idle';
      if (!pet.anim || pet.anim.startsWith('向') || pet.anim.startsWith('叼')) setAnim(pet, idleAnim(pet));
      return;
    }
    // 专注的时候，做完别的事就回到专注，不乱跑
    if (focusing && pet.visible) { pet.state = 'focus'; setAnim(pet, pet.name === G && pet.clips['互动_看书'] ? '互动_看书' : '专注'); return; } // g老师专注时看书
    pet.state = 'idle';
    // 地上有能站的窗口时想得快一点，马上过去
    pet.nextThink = now + (wantsLedge(pet) ? rand(300, 900) : rand(2000, 6000));
    setAnim(pet, idleAnim(pet));
  }

  function walkTo(pet, x, hurry = false) {
    pet.hurry = hurry;
    const [min, max] = walkRange(pet);
    pet.target = Math.min(Math.max(x, min), max);
    pet.state = 'walk';
    setAnim(pet, pet.target < pet.x ? '向左走' : '向右走');
  }

  // then：这个动作播完以后接着做什么（不写就回待机）
  function playNamed(pet, name, now, minPlay = MIN_PLAY, then = null) {
    const clip = setAnim(pet, name, true);
    pet.then = then;
    pet.state = 'action';
    pet.until = now + clip.duration * Math.max(1, Math.ceil(minPlay / clip.duration));
  }

  function playRandomAction(pet, now) {
    if (!pet.actions.length) return goIdle(pet, now);
    const choices = pet.actions.length > 1 ? pet.actions.filter(a => a !== pet.anim) : pet.actions;
    playNamed(pet, pick(choices), now);
  }

  function wake(pet, now) {
    pet.lastAttention = now;
    pet.tucked = false;
    if (pet.state === 'sleep') goIdle(pet, now);
  }

  // ---- 气泡 ----
  function say(sprite, text, ms = 6000) {
    sprite.bubble.textContent = text;
    sprite.bubble.classList.add('show');
    sprite.bubbleUntil = performance.now() + ms;
  }

  function placeBubble(sprite, now, visible) {
    if (!sprite.bubble.classList.contains('show')) return;
    if (!visible || now >= sprite.bubbleUntil) { sprite.bubble.classList.remove('show'); return; }
    const bw = sprite.bubble.offsetWidth, bh = sprite.bubble.offsetHeight;
    const x = Math.min(Math.max(sprite.x - bw / 2, 4), W() - bw - 4);
    const y = Math.max(H() - (sprite.y || 0) - sprite.h * 0.8 - bh - 8, 4);
    sprite.bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  // 提醒：能动的宠物都做一个动作并冒气泡；正在贴贴就让贴贴冒气泡。
  function remind(animName, text, minPlay) {
    const now = performance.now();
    const told = new Set();
    for (const pet of pets) {
      if (!pet.visible) continue;
      if (pet.state === 'hug') { if (pet.combo && !told.has(pet.combo)) say(pet.combo, text, 8000); told.add(pet.combo); continue; }
      if (pet.state === 'drag' || pet.state === 'fall') { say(pet, text, 8000); continue; }
      pet.lastAttention = now;
      playNamed(pet, animName, now, minPlay);
      say(pet, text, 8000);
    }
  }

  function checkClock(now) {
    if (!features.time) return;
    const date = new Date();
    const hour = date.getHours();
    const minutes = hour * 60 + date.getMinutes();
    if (hour < 5) {
      if (now - lastNightNag >= NIGHT_EVERY) { lastNightNag = now; if (!focusing) remind('睡觉', '该睡觉啦', 6000); }
    } else {
      lastNightNag = -Infinity;
    }
    MEALS.forEach(([from, to], i) => {
      const key = `${date.toDateString()}-${i}`;
      if (minutes >= from && minutes <= to && !mealsDone.has(key)) { mealsDone.add(key); if (!focusing) remind('吃饭', '该吃饭啦', 4000); }
    });
  }

  // ---- 鼠标：拖动 / 点击 / 右键 ----
  function onPointerDown(pet, event) {
    if (event.button !== 0) return;
    if (pet.state === 'hug' && !pet.combo) { pet.el.hidden = !pet.visible; goIdle(pet, performance.now()); } // 万一卡在贴贴里，点一下就恢复
    event.preventDefault();
    pet.el.setPointerCapture(event.pointerId);
    const rect = pet.el.getBoundingClientRect();
    pet.drag = { startX: event.clientX, startY: event.clientY, dx: event.clientX - (rect.left + rect.width / 2), dy: rect.bottom - event.clientY, moved: false };
    wake(pet, performance.now());
  }

  function onPointerMove(pet, event) {
    const drag = pet.drag;
    if (!drag) return;
    if (!(event.buttons & 1)) return releaseStuckDrag(event);
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      pet.state = 'drag';
      pet.then = null;
      pet.onLedge = false;
      pet.shake = null;
      pet.el.classList.add('dragging');
      setAnim(pet, pet.clips['吓一跳'] ? '吓一跳' : '待机');
    }
    pet.x = Math.min(Math.max(event.clientX - drag.dx, pet.w / 2), W() - pet.w / 2);
    pet.y = Math.min(Math.max(H() - (event.clientY + drag.dy), 0), H() - pet.h);
  }

  function onPointerUp(pet, event) {
    const drag = pet.drag;
    if (!drag) return;
    pet.drag = null;
    pet.el.classList.remove('dragging');
    if (pet.el.hasPointerCapture(event.pointerId)) pet.el.releasePointerCapture(event.pointerId);
    const now = performance.now();
    pet.lastAttention = now;
    if (drag.moved) {
      pet.vy = 0;
      if (tryStack(pet, now)) { api.diary('stacks'); return; } // 落在别的宠物头上 → 叠叠乐
      pet.si = screenAt(pet.x, H() - pet.y - pet.h / 2); // 松手时在哪块屏幕上，就落到那块屏幕的底部
      if (pet.y < floorOf(pet)) pet.y = floorOf(pet);
      if (pet.y > floorOf(pet)) dropFrom(pet); else goIdle(pet, now);
    } else if (event.type === 'pointerup') {
      if (pet.name === G && !pet.visitor && pet.clips[GLASSES[0]]) clickGlasses(pet, now); else playRandomAction(pet, now);
      if (!pet.visitor) api.diary('clicks');
      api.touched();
    }
  }

  // 右键哪只宠物，菜单里就可能多出这只的专属选项（比如「挑衅哥哥」）
  window.addEventListener('contextmenu', event => { event.preventDefault(); const pet = petUnder(event.clientX, event.clientY) || petBoxUnder(event.clientX, event.clientY); api.showMenu(pet ? (pet.visitor ? `visitor:${pet.name}` : pet.name) : null); });

  // 鼠标在宠物身上（不透明的地方）时才接住点击，其他地方点击会穿透到桌面。
  function petBoxUnder(x, y) {
    return pets.find(pet => {
      if (!pet.visible || pet.state === 'hug') return false;
      const r = pet.el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }

  function petUnder(x, y) {
    for (const pet of pets) {
      if (!pet.visible || pet.state === 'hug') continue;
      const rect = pet.el.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
      if (!pet.img.complete || !pet.img.naturalWidth) return pet;
      const sx = (x - rect.left) / rect.width * pet.img.naturalWidth;
      const sy = (y - rect.top) / rect.height * pet.img.naturalHeight;
      hitCtx.clearRect(0, 0, 5, 5);
      hitCtx.drawImage(pet.img, sx - 2, sy - 2, 5, 5, 0, 0, 5, 5);
      const alpha = hitCtx.getImageData(0, 0, 5, 5).data;
      for (let i = 3; i < alpha.length; i += 4) if (alpha[i] > 20) return pet;
    }
    return null;
  }

  function updateMouseCatch(force = false) {
    const dragging = pets.some(pet => pet.drag);
    // 已经接住鼠标时，只要还在宠物的方框里就一直接着，不会因为动画换帧、透明的缝一下子漏掉点击
    const over = cursor && (petUnder(cursor.x, cursor.y) || (!ignoringMouse && petBoxUnder(cursor.x, cursor.y)) || overUpdateButton(cursor.x, cursor.y));
    const ignore = !dragging && !over;
    // 只在状态真的变了（或者主程序要求对一下）时才告诉主程序，不反复去动窗口
    if (force || ignore !== ignoringMouse) {
      ignoringMouse = ignore;
      api.setIgnoreMouse(ignore);
    }
  }

  // 松开了鼠标却没收到「松开」（比如鼠标在别的地方松开）→ 当作已经松手，不会卡住
  function releaseStuckDrag(event) {
    if (event.buttons & 1) return;
    for (const pet of pets) if (pet.drag) onPointerUp(pet, { type: 'pointercancel', pointerId: event.pointerId ?? 1 });
  }

  // 鼠标在宠物身上快速左右来回晃 → 害羞
  function trackShake(pet, point, now) {
    const rect = pet.el.getBoundingClientRect();
    const inside = point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    if (!inside || pet.drag || pet.state === 'hug') { pet.shake = null; return; }
    const shake = pet.shake || (pet.shake = { anchor: point.x, dir: 0, turns: [] });
    const dx = point.x - shake.anchor;
    if (Math.abs(dx) < SHAKE_STEP) return;
    const dir = Math.sign(dx);
    if (shake.dir && dir !== shake.dir) shake.turns.push(now);
    shake.dir = dir;
    shake.anchor = point.x;
    shake.turns = shake.turns.filter(t => now - t < 1000);
    if (shake.turns.length >= SHAKE_TURNS && now >= pet.shyUntil) {
      shake.turns = [];
      pet.shyUntil = now + 4000;
      pet.lastAttention = now;
      playNamed(pet, '害羞', now);
      if (!pet.visitor) api.diary('pets'); // 鼠标在身上晃晃 = 摸摸
    }
  }

  // 鼠标靠近 → 转头看鼠标
  // 鼠标靠近 → 发呆的宠物转头看鼠标。只是换个眼神，不打断任何事：
  // 它照样会去走路、睡觉、做动作、敲代码、跳上窗口，走路时也不会停下来看
  function lookAtMouse(pet, point, distance) {
    const near = features.mouse && pet.state === 'idle' && !pet.inScene && distance < LOOK_DISTANCE;
    if (near) {
      const dx = point.x - pet.x;
      if (!pet.looking || Math.abs(dx) > 15) {
        const side = Math.abs(dx) <= 15 ? (pet.lookSide || 'right') : (dx < 0 ? 'left' : 'right');
        pet.looking = true;
        pet.lookSide = side;
        setAnim(pet, side === 'left' ? '向左看' : '向右看');
      }
    } else if (pet.looking && (pet.state !== 'idle' || !features.mouse || distance >= LOOK_DISTANCE + 30)) {
      pet.looking = false;
      if (pet.state === 'idle') setAnim(pet, idleAnim(pet));
    }
  }


  function onCursor(point) {
    cursor = point;
    if (showcase) { updateMouseCatch(); return; } // 功能展示时不看鼠标、不害羞，免得打断演示
    const now = performance.now();
    const movedFar = Math.hypot(point.x - cursorStill.x, point.y - cursorStill.y) > 6;
    for (const pet of pets) {
      if (!pet.visible) continue;
      const distance = Math.hypot(point.x - pet.x, point.y - (H() - pet.y - pet.h / 2));
      if (distance < WAKE_DISTANCE) wake(pet, now);
      watchCursor(pet, point, distance, now);
      lookAtMouse(pet, point, distance);
      if (features.mouse) trackShake(pet, point, now);
    }
    if (movedFar) cursorStill = { x: point.x, y: point.y, since: now };
    updateMouseCatch();
  }

  // ---- 看你在做什么（只收到「写代码 / 看视频 / 听歌」这种类别） ----
  function onActivity(next) {
    if (next.typing && !activity.typing) typingSince = performance.now();
    const changed = next.kind !== activity.kind || (next.typing && !activity.typing);
    activity = next;
    if (!changed || !next.kind) return;
    const now = performance.now();
    for (const pet of pets) pet.nextActivity = Math.min(pet.nextActivity, now + rand(1000, 4000));
  }

  function maybeDoActivity(pet, now) {
    if (!features.activity || !activity.kind || now < pet.nextActivity) return false;
    if (activity.kind === 'code' && !activity.typing) return false;
    pet.nextActivity = now + rand(20_000, 45_000);
    pet.lastAttention = now;
    playNamed(pet, ACTIVITY_ANIM[activity.kind], now, 4000);
    return true;
  }

  // ---- 掉落：从半空或窗口顶上掉到屏幕底部 ----
  function dropFrom(pet, landAnim = '摔趴趴') {
    pet.state = 'fall';
    pet.onLedge = false;
    pet.vy = 0;
    pet.fallFrom = pet.y - floorOf(pet);
    pet.landAnim = landAnim;
    setAnim(pet, '掉落');
  }

  function land(pet, now) {
    pet.y = floorOf(pet);
    pet.vy = 0;
    pet.lastAttention = now;
    if (pet.fallFrom >= SPLAT_HEIGHT) {
      const force = pet.forceCatch; pet.forceCatch = false;
      if (pet.landAnim === '摔趴趴' && catchGlasses(pet, now, force)) return;
      playNamed(pet, pet.landAnim, now, 0, afterSplat(pet)); // 播一遍，播完回待机
      if (pet.landAnim === '摔趴趴') helpUp(pet, now);
    }
    else goIdle(pet, now);
  }

  // g老师摔倒：哥哥狗狗能来扶就等它扶；不然旁边的宠物有一定概率接住眼镜
  function catchGlasses(g, now, force = false) {
    if (g.name !== G || g.visitor || canHelpUp(g)) return false;
    if (!force && Math.random() >= CATCH_CHANCE) return false;
    const friend = nearestFriend(g, CATCH_NEAR, p => ['idle', 'walk', 'action'].includes(p.state), 'catch');
    if (!friend) return false;
    const pair = [friend, g].sort((a, b) => a.x - b.x);
    const combo = makeCombo('catch', pair, Combos.comboKey(pair.map(p => p.name)), (friend.x + g.x) / 2, g.y, now, 0);
    clampToScreen(combo, g);
    place(combo);
    return true;
  }

  // g老师摔趴趴以后：假装没摔过，然后朝随便哪边走开
  function afterSplat(pet) {
    if (pet.name !== G || !pet.clips['互动_假装没摔过']) return null;
    return t => playNamed(pet, '互动_假装没摔过', t, 0, t2 => {
      goIdle(pet, t2);
      if (!focusing) walkTo(pet, pet.x + (Math.random() < 0.5 ? -1 : 1) * rand(200, 350));
    });
  }

  // ---- 站在窗口顶上 ----
  const ledgeHeight = () => H() - ledge.y - FOOT();

  function ledgeRange(pet) {
    const min = ledge.x + pet.w * 0.3, max = ledge.x + ledge.w - pet.w * 0.3;
    return min <= max ? [min, max] : [ledge.x + ledge.w / 2, ledge.x + ledge.w / 2];
  }

  function walkRange(pet) {
    const screen = xRange(pet);
    if (!pet.onLedge || !ledge) return screen;
    const [min, max] = ledgeRange(pet);
    return [Math.max(min, screen[0]), Math.min(max, screen[1])];
  }

  const wantsLedge = pet => !pet.onLedge && onFloor(pet) && ledge && ledgeUsable(pet);

  // 窗口顶边要在屏幕里、上面放得下宠物、离地面也够高
  function ledgeUsable(pet) {
    if (!features.perch || !ledge) return false;
    const s = screenOf(pet);
    const centre = ledge.x + ledge.w / 2;
    return centre > s.x && centre < s.x + s.w && ledge.y - pet.h >= s.y && ledgeHeight() - floorOf(pet) >= 80;
  }

  function jumpUp(pet) {
    const [min, max] = walkRange({ ...pet, onLedge: true });
    const tx = Math.min(Math.max(pet.x, min), max) + rand(-40, 40);
    const rise = ledgeHeight() - pet.y;
    const vy = Math.sqrt(2 * GRAVITY * (rise + 40));
    const time = vy / GRAVITY + Math.sqrt(2 * 40 / GRAVITY);
    pet.state = 'jump';
    pet.vy = vy;
    pet.vx = (Math.min(Math.max(tx, min), max) - pet.x) / time;
    setAnim(pet, '开心蹦蹦');
  }

  function onPerch(next) {
    const old = ledge;
    ledge = next;
    const moved = !next || !old || next.id !== old.id || Math.abs(next.x - old.x) > 2 || Math.abs(next.y - old.y) > 2 || Math.abs(next.w - old.w) > 2;
    if (!moved) return;
    const now = performance.now();
    for (const combo of [...combos]) if (combo.onLedge) endCombo(combo, now, true);
    for (const pet of pets) {
      if (pet.onLedge) dropFrom(pet);
      else if (next && pet.state === 'walk' && !pet.onLedge) goIdle(pet, now); // 有新窗口了，别乱走了，快点过去
      else if (next && pet.state === 'idle') pet.nextThink = Math.min(pet.nextThink, now + rand(300, 900));
    }
  }

  // ---- 打字反应：只知道「在不在打字」，不知道按了什么 ----
  const isTypingLong = now => features.typing && activity.typing && now - typingSince >= TYPING_AFTER;

  // ---- 电脑状态：CPU 很忙冒冷汗；电量低提醒 ----
  function onCpuHot(hot) {
    if (hot && !cpuHot) for (const pet of pets) pet.nextSweat = performance.now() + rand(500, 2000);
    cpuHot = hot;
  }

  function maybeSweat(pet, now) {
    if (!features.system || !cpuHot || now < pet.nextSweat) return false;
    pet.nextSweat = now + SWEAT_EVERY;
    pet.lastAttention = now;
    playNamed(pet, '冒冷汗', now, 3000);
    return true;
  }

  async function checkBattery(now) {
    if (!features.system || !navigator.getBattery) return;
    try {
      const battery = await navigator.getBattery();
      const low = !battery.charging && battery.level < 0.2;
      if (!low) { lastBatteryNag = -Infinity; return; }
      if (now - lastBatteryNag >= LOW_BATTERY_EVERY) { lastBatteryNag = now; if (!focusing) remind('睡觉', '我也没电了……', 6000); }
    } catch {}
  }

  // ---- 多个显示器 ----
  const primaryIndex = () => Math.max(0, screens.findIndex(s => s.primary));
  const screenOf = pet => screens[pet.si] || screens[primaryIndex()];
  const floorOf = pet => { const s = screenOf(pet); return H() - (s.y + s.h); }; // 这块屏幕的地面离窗口底部多高
  const onFloor = pet => Math.abs(pet.y - floorOf(pet)) < 0.5;
  const xRange = pet => { const s = screenOf(pet); return [s.x + pet.w / 2, s.x + s.w - pet.w / 2]; };

  function screenAt(x, y) {
    const inside = screens.findIndex(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
    if (inside >= 0) return inside;
    let best = 0, bestDistance = Infinity;
    screens.forEach((s, i) => {
      const dx = Math.max(s.x - x, 0, x - (s.x + s.w)), dy = Math.max(s.y - y, 0, y - (s.y + s.h));
      if (dx * dx + dy * dy < bestDistance) { bestDistance = dx * dx + dy * dy; best = i; }
    });
    return best;
  }

  function onScreens(next) {
    if (!next?.length) return;
    screens = next;
    const now = performance.now();
    for (const pet of pets) {
      if (pet.state === 'drag') continue;
      pet.si = screenAt(pet.x, H() - pet.y - pet.h / 2);
      if (!pet.onLedge && pet.state !== 'fall' && pet.state !== 'jump') { pet.y = floorOf(pet); if (pet.state === 'hug') continue; goIdle(pet, now); }
    }
  }

  // ---- 挂在宠物头上的按钮：新版本「点我重启」、番茄钟「继续专注吗」 ----
  const actionButtons = new Map();
  function showActionButton(id, text, onClick) {
    let button = actionButtons.get(id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'bubble show update-button';
      stage.append(button);
      actionButtons.set(id, button);
    }
    // 按下去就算点到（不等松手），这样鼠标稍微一动、或者窗口刚切到「接住点击」时也不会漏掉
    button.onpointerdown = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      onClick();
    };
    button.textContent = text;
  }
  function hideActionButton(id) {
    actionButtons.get(id)?.remove();
    actionButtons.delete(id);
  }
  function showUpdateButton(version) {
    showActionButton('update', `有新版本 ${version} 啦，点我重启 ♡`, () => {
      actionButtons.get('update').textContent = '正在重启…';
      api.restartUpdate();
    });
  }

  function overUpdateButton(x, y) {
    for (const button of actionButtons.values()) {
      if (button.hidden) continue;
      const r = button.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }

  // 挂在第一只看得见的宠物（或贴贴）头上，几个按钮往上叠；那只宠物正冒别的气泡时就挂得更高一点
  function placeUpdateButton() {
    if (!actionButtons.size) return;
    const host = combos[0] || pets.find(pet => pet.visible && pet.state !== 'hug');
    let lift = host && host.bubble.classList.contains('show') ? host.bubble.offsetHeight + 8 : 0;
    for (const button of actionButtons.values()) {
      button.hidden = !host;
      if (!host) continue;
      const bw = button.offsetWidth, bh = button.offsetHeight;
      const x = Math.min(Math.max(host.x - bw / 2, 4), W() - bw - 4);
      const y = Math.max(H() - (host.y || 0) - host.h * 0.8 - bh - 8 - lift, 4);
      button.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      lift += bh + 6;
    }
  }

  // ---- 大小 ----
  function applySize(next) {
    size = next;
    for (const sprite of [...pets, ...combos]) {
      if (!sprite.clip) continue;
      fitSize(sprite);
      if (sprite.onLedge && ledge) sprite.y = ledgeHeight();
    }
  }

  // ---- 联网：对方摸了 / 戳了 ----
  function onRemote(message) {
    const name = message.name || '对方';
    if (message.type === 'pet') remind('开心蹦蹦', `${name}在摸你`, 3000);
    if (message.type === 'poke') remind('打招呼', `${name}戳了戳你`, 2000);
    if (message.type === 'visit-start') welcomeVisitor(message.pet, name);
    if (message.type === 'visit-end') {
      const mine = byName(message.pet);
      if (mine?.away || mine?.state === 'exit') comeHome(mine, performance.now()); // 对方送它回来了
      else { const guest = pets.find(p => p.visitor && p.name === message.pet); if (guest) visitorLeave(guest, performance.now(), false); } // 对方把它叫回家了
    }
  }

  // ---- 串门 ----
  // 从屏幕边缘走出去 / 走进来
  function walkOut(pet, now, done) {
    const s = screenOf(pet);
    pet.exitDir = pet.x < s.x + s.w / 2 ? -1 : 1;
    pet.state = 'exit';
    pet.onExit = done;
    pet.onLedge = false;
    pet.looking = false;
  }

  function walkIn(pet, now, done) {
    const s = screenOf(pet);
    const fromLeft = Math.random() < 0.5;
    pet.y = floorOf(pet);
    pet.x = fromLeft ? s.x - pet.w / 2 : s.x + s.w + pet.w / 2;
    pet.enterTo = s.x + s.w * (fromLeft ? rand(0.12, 0.3) : rand(0.7, 0.88));
    pet.state = 'enter';
    pet.onEnter = done;
    pet.el.hidden = false;
  }

  function reportVisits() {
    api.reportVisits({ away: pets.filter(p => p.away).map(p => p.name), visitors: pets.filter(p => p.visitor).map(p => p.name) });
  }

  // 自己的宠物出门去对方家
  function sendVisiting(pet, now) {
    walkOut(pet, now, () => {
      pet.away = true;
      pet.awaySince = performance.now();
      pet.visible = false;
      pet.el.hidden = true;
      pet.state = 'idle';
      api.sendVisit('visit-start', pet.name);
      reportVisits();
    });
  }

  function tryVisit(now) {
    if (!peerOnline || pets.some(p => p.away || p.state === 'exit')) return false;
    const candidates = pets.filter(p => visitPets[p.name] !== false && isFree(p));
    if (!candidates.length) return false;
    sendVisiting(pick(candidates), now);
    return true;
  }

  // 自己的宠物回家（对方送回来、自己叫回来、对方下线、在外面太久）
  function comeHome(pet, now) {
    if (pet.state === 'exit' && !pet.away) { pet.onExit = null; goIdle(pet, now); return; } // 还没走出去就回来了
    if (!pet.away) return;
    pet.away = false;
    pet.visible = !!shown[pet.id];
    reportVisits();
    if (!pet.visible) return;
    pet.si = primaryIndex();
    walkIn(pet, now, t => { goIdle(pet, t); say(pet, '我回来啦', 4000); });
  }

  function callHome(name) {
    const pet = byName(name);
    if (!pet) return;
    api.sendVisit('visit-end', name);
    comeHome(pet, performance.now());
  }

  // 对方的宠物来串门：从边缘走进来，打招呼，玩几分钟再走（不会留下来）
  function welcomeVisitor(name, owner, demo = false) {
    if (!petData[name] || pets.some(p => p.visitor && p.name === name) || (!demo && !features.visit)) {
      if (!demo) api.sendVisit('visit-end', name); // 现在不方便接待，请它回去
      return;
    }
    const now = performance.now();
    const guest = createPet(`visitor:${name}`, petData[name], 0);
    guest.visitor = true;
    guest.owner = owner;
    guest.visible = true;
    guest.si = primaryIndex();
    guest.el.title = `${owner}的${name}（来串门）`;
    guest.demo = demo; // 测试用的假客人：不用联网，玩 30 秒就走
    guest.leaveAt = now + (demo ? 30_000 : rand(...VISIT_STAY));
    pets.push(guest);
    setAnim(guest, '待机');
    walkIn(guest, now, t => { playNamed(guest, '打招呼', t, 2000); say(guest, `${owner}来串门啦`, 6000); });
    reportVisits();
  }

  // 客人回家：走出屏幕后告诉对方（notify=false 时是对方已经下线 / 叫它回去了）
  function visitorLeave(guest, now, notify = true) {
    if (guest.state === 'exit') return;
    guest.inScene = false;
    walkOut(guest, now, () => { removeVisitor(guest); if (notify) api.sendVisit('visit-end', guest.name); });
  }

  function removeVisitor(guest) {
    pets = pets.filter(p => p !== guest);
    if (guest.url) URL.revokeObjectURL(guest.url);
    guest.el.remove();
    guest.bubble.remove();
    guest.heart.remove();
    reportVisits();
  }

  function checkVisits(now) {
    for (const guest of pets.filter(p => p.visitor)) {
      if (!peerOnline && !guest.demo) visitorLeave(guest, now, false);
      else if (now >= guest.leaveAt && ['idle', 'walk'].includes(guest.state)) visitorLeave(guest, now, !guest.demo);
    }
    for (const pet of pets.filter(p => p.away)) {
      if (!peerOnline || now - pet.awaySince > AWAY_MAX) { if (peerOnline) api.sendVisit('visit-end', pet.name); comeHome(pet, now); }
    }
    if (now >= nextVisit) { nextVisit = now + rand(...VISIT_EVERY); if (features.visit && !focusing) tryVisit(now); }
  }

  // 两个人都在线时，头顶飘一个小爱心（冒气泡时先让开）
  function placeHeart(sprite, visible) {
    const show = peerOnline && visible && !sprite.bubble.classList.contains('show');
    sprite.heart.hidden = !show;
    if (!show) return;
    const x = sprite.x - sprite.heart.offsetWidth / 2;
    const y = H() - (sprite.y || 0) - sprite.h * 0.85 - sprite.heart.offsetHeight;
    sprite.heart.style.left = `${Math.round(x)}px`;
    sprite.heart.style.top = `${Math.round(Math.max(y, 0))}px`;
  }

  // ---- 贴贴（左右挨在一起）和叠叠乐（拖到别人头上） ----
  const comboReady = (key, kind) => !!comboClips[key]?.[kind] && (comboCooldown.get(`${kind}:${key}`) || 0) <= performance.now();

  function canHug(pet) {
    return pet.visible && !pet.visitor && !pet.combo && !pet.inScene && !Combos.SOLO.includes(pet.name) && (pet.restUntil || 0) <= performance.now() && (pet.state === 'idle' || pet.state === 'walk') && (onFloor(pet) || pet.onLedge);
  }

  function makeCombo(kind, members, key, x, y, now, playFor) {
    const clip = comboClips[key][kind];
    const combo = { ...makeSprite(`pet hug ${kind}`), kind, members, key, x, y, si: members[0].si, onLedge: !!members[0].onLedge, visible: true };
    playClip(combo, clip);
    combo.until = now + clip.duration * Math.max(1, Math.ceil(playFor / clip.duration));
    for (const pet of members) {
      pet.state = 'hug';
      pet.combo = combo;
      pet.drag = null;
      pet.looking = false;
      pet.el.hidden = true;
    }
    combos.push(combo);
    return combo;
  }

  function removeCombo(combo, cooldown = true) {
    combos = combos.filter(c => c !== combo);
    if (combo.url) URL.revokeObjectURL(combo.url);
    combo.el.remove();
    combo.bubble.remove();
    combo.heart.remove();
    if (cooldown) comboCooldown.set(`${combo.kind}:${combo.key}`, performance.now() + COMBO_COOLDOWN);
    // 刚贴贴 / 叠叠乐完的宠物歇一会儿，不会一散开就马上又和旁边的贴在一起
    for (const pet of combo.members) { pet.combo = null; pet.anim = ''; pet.el.hidden = !pet.visible; pet.restUntil = performance.now() + COMBO_REST; }
  }

  // 几只宠物（从左到右）挨在一起 → 在它们中间播贴贴
  function startHug(group, now, kind = 'row') {
    const key = Combos.comboKey(group.map(p => p.name));
    // 打完架还没和好：先播「和好」，播完再贴贴
    if (kind === 'row' && needsMakeup.has(key)) {
      if (features.makeup && comboClips[key]?.makeup) kind = 'makeup';
      else needsMakeup.delete(key);
    }
    const mid = group.reduce((sum, p) => sum + p.x, 0) / group.length;
    const combo = makeCombo(kind, group, key, mid, group[0].y, now, kind === 'row' ? HUG_TIME : 0);
    if (!showcase) api.diary('hugs');
    const s = screenOf(group[0]);
    combo.x = Math.min(Math.max(mid, s.x + combo.w / 2), s.x + s.w - combo.w / 2);
    place(combo);
  }

  function endHug(combo, now, allowFight = true) {
    removeCombo(combo);
    // 有「_打架」剧情的组合：贴贴完紧接着打一架
    if (allowFight && comboClips[combo.key]?.fight && combo.members.every(pet => pet.visible)) return startFight(combo, now);
    const n = combo.members.length;
    combo.members.forEach((pet, i) => {
      pet.x = combo.x + (i - (n - 1) / 2) * pet.w * 0.55;
      pet.lastAttention = now;
      goIdle(pet, now);
    });
    const [left, right] = [combo.members[0], combo.members[n - 1]];
    if (left.visible) walkTo(left, left.x - rand(150, 300));
    if (right.visible) walkTo(right, right.x + rand(150, 300));
  }

  function startFight(hug, now) {
    const fight = makeCombo('fight', hug.members, hug.key, hug.x, hug.y, now, 0); // 播一遍
    fight.si = hug.si;
    fight.onLedge = hug.onLedge;
    const s = screenOf(hug.members[0]);
    fight.x = Math.min(Math.max(hug.x, s.x + fight.w / 2), s.x + s.w - fight.w / 2);
    place(fight);
  }

  // 打完了：两只重新出现，朝相反方向各走开一段，走到了就待机；这一对要过很久才会再贴贴
  function endFight(fight, now) {
    removeCombo(fight);
    // 冷静一会儿：有「和好」动画时，过一阵再见面先和好；没有就只是很久不贴贴
    if (features.makeup && comboClips[fight.key]?.makeup) {
      needsMakeup.add(fight.key);
      comboCooldown.set(`row:${fight.key}`, now + MAKEUP_AFTER);
    } else comboCooldown.set(`row:${fight.key}`, now + FIGHT_COOLDOWN);
    const n = fight.members.length;
    fight.members.forEach((pet, i) => {
      pet.x = fight.x + (i - (n - 1) / 2) * pet.w * 0.55;
      pet.lastAttention = now;
      goIdle(pet, now);
      if (pet.visible) walkTo(pet, pet.x + (i < n / 2 ? -1 : 1) * rand(250, 400));
    });
  }

  // 松手时脚落在谁的头上（一摞叠叠乐，或者一只站着的宠物）
  function stackTarget(pet) {
    const feet = H() - pet.y;
    const onHead = t => Math.abs(pet.x - t.x) < t.w * 0.4 && feet > H() - t.y - t.h - 40 && feet < H() - t.y - t.h * 0.45;
    const stack = combos.find(c => c.kind === 'stack' && onHead(c));
    if (stack) return { base: stack, below: stack.members };
    const under = pets.find(q => q !== pet && q.visible && !q.visitor && !q.combo && ['idle', 'walk', 'action', 'sleep', 'typing'].includes(q.state) && onHead(q));
    return under ? { base: under, below: [under] } : null;
  }

  function tryStack(pet, now) {
    if (pet.visitor) return false;
    const target = stackTarget(pet);
    if (!target) return false;
    const key = Combos.canStack(target.below.map(p => p.name), pet.name, k => comboReady(k, 'stack'));
    if (!key) return false;
    const { base } = target;
    // 叠叠乐从最下面那只站的位置往上长，超出屏幕顶部就不叠
    const s = screenOf(base);
    if (H() - base.y - comboClips[key].stack.gh * SCALE * size < s.y) return false;
    const members = [...target.below, pet];
    const { x, y, si, onLedge } = base;
    if (base.kind === 'stack') removeCombo(base, false); // 已经叠着的一摞继续往上叠
    for (const p of members) p.si = si;
    members[0].onLedge = !!onLedge;
    const combo = makeCombo('stack', members, key, x, y, now, STACK_TIME);
    combo.onLedge = !!onLedge;
    place(combo);
    return true;
  }

  // 叠叠乐播完 → 散开，每只从自己的高度掉下来摔趴趴
  function scatter(combo, now, fallAll = false) {
    removeCombo(combo);
    const n = combo.members.length;
    const step = n > 1 ? (combo.clip.gh - 250) / (n - 1) * SCALE * size : 0;
    combo.members.forEach((pet, i) => {
      pet.si = combo.si;
      pet.x = combo.x + (i ? rand(-40, 40) : 0);
      pet.y = combo.y + i * step;
      pet.lastAttention = now;
      if (i === 0 && !fallAll) {
        pet.onLedge = combo.onLedge;
        playNamed(pet, '摔趴趴', now, 0);
        helpUp(pet, now);
      } else {
        dropFrom(pet);
        pet.fallFrom = Math.max(pet.fallFrom, SPLAT_HEIGHT); // 叠叠乐散开时每只都摔趴趴
      }
    });
  }

  // 和好了 → 接着贴贴（贴完又会打架，一直这样循环）
  function endMakeup(combo, now) {
    removeCombo(combo, false);
    needsMakeup.delete(combo.key);
    const hug = makeCombo('row', combo.members, combo.key, combo.x, combo.y, now, HUG_TIME);
    hug.si = combo.si;
    hug.onLedge = combo.onLedge;
    place(hug);
  }

  // quiet：宠物被隐藏、窗口挪走这些时候提前结束，不接打架剧情
  function endCombo(combo, now, fallAll = false, quiet = false) {
    if (combo.kind === 'stack') scatter(combo, now, fallAll);
    else {
      if (combo.kind === 'fight') endFight(combo, now);
      else if (combo.kind === 'makeup' && !fallAll && !quiet) endMakeup(combo, now);
      else if (combo.kind === 'blanket' && !fallAll && !quiet) endBlanket(combo, now);
      else if (combo.kind === 'helpup') endHelpUp(combo, now, !fallAll && !quiet);
      else if (combo.kind === 'watch' && !fallAll && !quiet) endWatch(combo, now);
      else if ((combo.kind === 'grading' || combo.kind === 'bookmark') && !fallAll && !quiet) endGrading(combo, now);
      else if (combo.kind === 'swap') endHug(combo, now, false);
      else if (combo.kind === 'catch') { removeCombo(combo, false); combo.members.forEach((pet, i) => { pet.x = combo.x + (i - (combo.members.length - 1) / 2) * pet.w * 0.55; goIdle(pet, now); }); }
      else endHug(combo, now, combo.kind === 'row' && !fallAll && !quiet);
      if (fallAll) for (const pet of combo.members) if (pet.onLedge) dropFrom(pet);
    }
  }

  // ---- 追着玩：煤球猫猫突然冲向另一只，那只加速跑开，追一会儿一起开心蹦蹦 ----
  const byName = name => pets.find(pet => pet.name === name && !pet.visitor); // 不算来串门的客人
  const isFree = pet => pet.visible && !pet.visitor && !pet.combo && !pet.drag && !pet.inScene && onFloor(pet) && ['idle', 'walk'].includes(pet.state);

  function moveToward(pet, x, step, leftAnim, rightAnim) {
    const dx = x - pet.x;
    pet.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
    setAnim(pet, dx < 0 ? leftAnim : rightAnim);
  }

  function tryChase(now) {
    const cat = byName('煤球猫猫');
    if (!cat || !isFree(cat)) return false;
    const others = pets.filter(p => p !== cat && isFree(p) && p.si === cat.si);
    if (!others.length) return false;
    startChase(cat, pick(others), now, true);
    return true;
  }

  // happy：追完两只一起开心蹦蹦；不然就是追一小会儿停下
  function startChase(chaser, target, now, happy) {
    chaser.state = 'chase';
    chaser.chase = { target, until: now + rand(3500, 5500), happy };
    target.state = 'flee';
    target.chaser = chaser;
    target.fleeDir = Math.sign(target.x - chaser.x) || 1;
    chaser.lastAttention = target.lastAttention = now;
  }

  function endChase(chaser, now) {
    const { target, happy } = chaser.chase || {};
    chaser.chase = null;
    if (target && target.state === 'flee') {
      target.chaser = null;
      target.fleeDir = 0;
      if (happy) playNamed(target, '开心蹦蹦', now, 2000); else goIdle(target, now);
    }
    if (happy) playNamed(chaser, '开心蹦蹦', now, 2000); else goIdle(chaser, now);
  }

  // ---- 灰鸮g老师 ----
  // 点一下扶眼镜；5 秒内接着点，第 2、3 下扶得更用力，第 4 下擦眼镜，然后重新数
  function clickGlasses(pet, now) {
    pet.glasses = now - (pet.glassesAt || -Infinity) < 5000 ? (pet.glasses || 0) + 1 : 1;
    pet.glassesAt = now;
    playNamed(pet, GLASSES[pet.glasses - 1], now, 0);
    if (pet.glasses >= GLASSES.length) pet.glasses = 0;
  }

  // 鼠标在g老师旁边停 3 秒 → 歪头看鼠标；鼠标一动 → 往后蹦（朝远离鼠标的方向）
  function watchCursor(pet, point, distance, now) {
    if (pet.name !== G || pet.visitor || !features.mouse) return;
    const moved = Math.hypot(point.x - cursorStill.x, point.y - cursorStill.y) > 6;
    if (pet.state === 'curious') {
      if (moved || distance > LOOK_DISTANCE + 30) {
        const away = point.x < pet.x ? '向右' : '向左';
        playNamed(pet, `互动_往后蹦_${away}`, now, 0);
      }
      return;
    }
    if (pet.state === 'idle' && !pet.inScene && distance < LOOK_DISTANCE && !moved && now - cursorStill.since >= CURIOUS_AFTER) {
      pet.state = 'curious';
      pet.looking = false;
      setAnim(pet, `互动_歪头看_${point.x < pet.x ? '向左' : '向右'}`);
    }
  }

  // g老师平时偶尔看书；专注时也看书
  const isReading = pet => pet.name === G && (pet.state === 'reading' || (pet.state === 'focus' && pet.anim === '互动_看书'));

  function startReading(pet, now) {
    if (!pet.clips['互动_看书']) return false;
    pet.state = 'reading';
    pet.until = now + rand(...READ_TIME);
    setAnim(pet, '互动_看书');
    return true;
  }

  // 看书时别的宠物走过来 → g老师抬起翅膀，让它挤进来一起看书（只一只）
  function checkReadingHug(now) {
    const g = byName(G);
    if (!g || !g.visible || g.combo || !isReading(g) || (g.restUntil || 0) > now) return;
    const friend = pets.find(p => p !== g && !p.visitor && p.visible && !p.combo && !p.inScene && ['idle', 'walk', 'focus'].includes(p.state)
      && onFloor(p) && onFloor(g) && p.si === g.si && Math.abs(p.x - g.x) < HUG_DISTANCE * size);
    if (!friend) return;
    const pair = [friend, g].sort((a, b) => a.x - b.x);
    const key = Combos.comboKey(pair.map(p => p.name));
    // 哥哥狗狗凑过来就是「批改作业」，别的宠物是一起看书
    // 有书签就播夹着书签的那段
    const kind = friend.name !== DOG ? 'row'
      : hasBookmark && comboClips[key]?.bookmark ? 'bookmark'
        : comboClips[key]?.grading ? 'grading' : 'row';
    if (!comboReady(key, kind)) return;
    const mid = (friend.x + g.x) / 2;
    const combo = makeCombo(kind, pair, key, mid, g.y, now, READ_HUG_TIME);
    const s = screenOf(g);
    combo.x = Math.min(Math.max(mid, s.x + combo.w / 2), s.x + s.w - combo.w / 2);
    place(combo);
  }

  // 专注到一半：g老师打个瞌睡，醒了接着看书
  function checkFocusDoze(now) {
    if (!focusing || now < focusHalfAt) return;
    focusHalfAt = Infinity;
    const g = byName(G);
    if (g && g.visible && g.state === 'focus' && g.clips['互动_看书打瞌睡']) doze(g, now);
  }

  // g老师看书打瞌睡：旁边有别的宠物，就变成「围观睡着」，播完两只都睡着，等鼠标来叫醒
  function doze(g, now) {
    const friend = nearestFriend(g, WATCH_NEAR, p => ['idle', 'walk', 'focus'].includes(p.state), 'watch');
    if (!friend) return playNamed(g, '互动_看书打瞌睡', now, 3000);
    const pair = [friend, g].sort((a, b) => a.x - b.x);
    const combo = makeCombo('watch', pair, Combos.comboKey(pair.map(p => p.name)), (friend.x + g.x) / 2, g.y, now, 0);
    clampToScreen(combo, g);
    place(combo);
  }

  // 离g老师最近、在同一个地面上、有这段贴贴动画的宠物
  function nearestFriend(g, near, stateOk, kind) {
    let best = null;
    for (const p of pets) {
      if (p === g || p.visitor || !p.visible || p.combo || p.inScene || p.drag || !stateOk(p)) continue;
      if (p.si !== g.si || !onFloor(p) || !onFloor(g) || Math.abs(p.x - g.x) > near * size) continue;
      if (!comboClips[Combos.comboKey([p.name, g.name])]?.[kind]) continue;
      if (!best || Math.abs(p.x - g.x) < Math.abs(best.x - g.x)) best = p;
    }
    return best;
  }

  function clampToScreen(combo, pet) {
    const s = screenOf(pet);
    combo.x = Math.min(Math.max(combo.x, s.x + combo.w / 2), s.x + s.w - combo.w / 2);
  }

  // 围观完：两只都睡着（像盖被子一样，打字吵不醒，只有鼠标能叫醒）
  function endWatch(combo, now) {
    endBlanket(combo, now);
  }

  // 批改作业结束：哥哥狗狗走开以后，g老师夹上书签；夹着书签的那次批改完，书签就用掉了
  function endGrading(combo, now) {
    const g = combo.members.find(p => p.name === G);
    const dog = combo.members.find(p => p.name === DOG);
    endHug(combo, now, false);
    if (combo.kind === 'bookmark') { setBookmark(false); return; }
    if (!g || !g.clips['互动_夹书签']) return;
    g.inScene = true;
    g.state = 'idle';
    setAnim(g, idleAnim(g));
    scenes.push({
      cast: [g], i: -1, done: () => true,
      steps: [
        t => { const until = t + 4000; return t2 => !dog || dog.state !== 'walk' || t2 >= until; }, // 等哥哥狗狗走开
        t => { setBookmark(true); return play(g, '互动_夹书签', t, 0); },
      ],
    });
  }

  // ---- 哥哥狗狗 ----
  const SPLAT_SEEN = 1000; // 摔趴趴至少先趴这么久，哥哥狗狗才扶
  // 有宠物摔趴趴了 → 哥哥狗狗走过去，两只一起播「贴贴/XX-哥哥狗狗_扶起来.gif」
  // （里面已经有扶起来、抖灰、道谢、摸摸头），播完两只各自慢慢走开
  function canHelpUp(fallen) {
    const dog = byName(DOG);
    if (!dog || dog === fallen || fallen.visitor || dog.si !== fallen.si || !onFloor(fallen)) return false;
    if (!dog.visible || dog.combo || dog.drag || dog.inScene || !onFloor(dog) || !['idle', 'walk', 'action'].includes(dog.state)) return false;
    return !!comboClips[Combos.comboKey([fallen.name, DOG])]?.helpup;
  }

  function helpUp(fallen, now) {
    if (!canHelpUp(fallen)) return;
    const dog = byName(DOG);
    const key = Combos.comboKey([fallen.name, DOG]);
    // 有人来扶：摔完先趴着别起来（一直播摔趴趴），等哥哥狗狗过来
    fallen.then = () => { fallen.state = 'idle'; setAnim(fallen, '摔趴趴'); };
    const cast = [dog, fallen];
    for (const pet of cast) pet.inScene = true;
    scenes.push({
      cast, i: -1, done: () => true,
      giveUpAt: now + 10_000, // 哥哥狗狗 10 秒还没走到，就不等了，自己起来（g老师这时才假装没摔过）
      onGiveUp: () => afterSplat(fallen)?.(performance.now()),
      steps: [
        t => approach(dog, fallen),
        // 走到了就马上扶，不用等摔趴趴整段播完（只是摔得很近时让它先趴一小会儿，看得出摔了）
        t => { const ready = now + SPLAT_SEEN; return t2 => t2 >= ready; },
        t => {
          const pair = [fallen, dog].sort((a, b) => a.x - b.x);
          const combo = makeCombo('helpup', pair, key, (fallen.x + dog.x) / 2, fallen.y, t, 0); // 播一遍
          const s = screenOf(fallen);
          combo.x = Math.min(Math.max(combo.x, s.x + combo.w / 2), s.x + s.w - combo.w / 2);
          place(combo);
          return () => !dog.combo;
        },
      ],
    });
  }

  // 扶起来播完：两只重新出现，各自朝两边慢慢走开，走到了再待机
  function endHelpUp(combo, now, walkAway = true) {
    removeCombo(combo, false);
    for (const scene of scenes.filter(sc => sc.cast.some(pet => combo.members.includes(pet)))) {
      scenes = scenes.filter(sc => sc !== scene);
      for (const pet of scene.cast) pet.inScene = false;
    }
    const n = combo.members.length;
    combo.members.forEach((pet, i) => {
      pet.x = combo.x + (i - (n - 1) / 2) * pet.w * 0.55;
      pet.si = combo.si;
      pet.lastAttention = now;
      pet.then = null;
      const dir = i === 0 ? -1 : 1;
      if (walkAway && pet.visible && !focusing) walkTo(pet, pet.x + dir * rand(150, 300));
      else goIdle(pet, now);
    });
  }

  // 连续打字超过 5 分钟、停下来 10 秒 → 哥哥狗狗举牌「测试通过」
  function trackLongTyping(now) {
    if (activity.typing) {
      if (!typingRun || now - typingRun.lastEnd > TYPING_GAP) typingRun = { start: now, lastEnd: Infinity };
      typingRun.lastEnd = Infinity;
      return;
    }
    if (!typingRun) return;
    if (typingRun.lastEnd === Infinity) typingRun.lastEnd = now;
    if (now - typingRun.lastEnd < TYPING_GAP) return;
    const long = typingRun.lastEnd - typingRun.start >= LONG_TYPING;
    typingRun = null;
    if (long && features.typing) holdUpSign(now);
  }

  function holdUpSign(now) {
    const dog = byName(DOG);
    if (!dog || !dog.visible || dog.combo || dog.inScene || BUSY.includes(dog.state) || !dog.clips['互动_举牌测试通过']) return false;
    dog.lastAttention = now;
    playNamed(dog, '互动_举牌测试通过', now, 3000);
    return true;
  }

  // 晚上 11 点到早上 6 点，千千猫猫睡着了 → 哥哥狗狗走过去给它盖被子（一晚一次）
  function checkBlanket(now, force = false) {
    const date = new Date();
    const hour = date.getHours();
    if (!force && hour >= 6 && hour < 23) return false;
    const night = new Date(date.getTime() - 6 * 3600_000).toDateString(); // 过了半夜还算前一晚
    if (!force && blanketNight === night) return false;
    const dog = byName(DOG), cat = byName('千千猫猫');
    const key = Combos.comboKey(['千千猫猫', DOG]);
    if (!dog || !cat || !cat.visible || cat.state !== 'sleep' || cat.combo || cat.inScene || !onFloor(cat) || !comboClips[key]?.blanket) return false;
    if (!(isFree(dog) || (dog.visible && dog.state === 'sleep' && !dog.combo && !dog.inScene)) || dog.si !== cat.si) return false;
    blanketNight = night;
    const cast = [dog, cat];
    for (const pet of cast) pet.inScene = true;
    scenes.push({
      cast, i: -1, done: () => true,
      steps: [
        t => approach(dog, cat),
        t => {
          if (cat.state !== 'sleep') return () => true; // 走过去的时候它醒了
          const pair = [cat, dog].sort((a, b) => a.x - b.x);
          const combo = makeCombo('blanket', pair, key, (cat.x + dog.x) / 2, cat.y, t, 3000);
          const s = screenOf(cat);
          combo.x = Math.min(Math.max(combo.x, s.x + combo.w / 2), s.x + s.w - combo.w / 2);
          place(combo);
          return () => !dog.combo;
        },
      ],
    });
    return true;
  }

  // 盖好被子：两只都接着睡，等鼠标来叫醒
  function endBlanket(combo, now) {
    removeCombo(combo, false);
    const n = combo.members.length;
    combo.members.forEach((pet, i) => {
      pet.x = combo.x + (i - (n - 1) / 2) * pet.w * 0.55;
      pet.state = 'sleep';
      pet.tucked = true; // 盖着被子睡，打字也不会吵醒，只有鼠标能叫醒
      pet.looking = false;
      setAnim(pet, '睡觉');
    });
  }

  // ---- 挑衅：千千猫猫挑衅哥哥狗狗，梨梨兔兔挑衅梨梨哥哥 ----
  // 剧情一步一步演：每一步开始时做点什么，返回「这一步演完了没有」的判断
  function play(pet, anim, now, minPlay = 1500) {
    if (!pet.clips[anim]) return () => true;
    playNamed(pet, anim, now, minPlay);
    return t => pet.state !== 'action' || t >= pet.until;
  }

  function face(pet, other) {
    if (!pet.clips['向左看']) return () => true;
    setAnim(pet, other.x < pet.x ? '向左看' : '向右看', true);
    const end = performance.now() + 700;
    return t => t >= end;
  }

  function approach(pet, other) {
    pet.state = 'approach';
    pet.approach = other;
    return () => pet.state !== 'approach';
  }

  function startTease(teaser, now, forced = null) {
    const pair = Teases.PAIRS[teaser.name];
    const target = pair && byName(pair.target);
    if (!target) return false;
    const teases = Object.keys(pair.replies).filter(name => teaser.clips[`挑衅_${name}`]);
    if (!teases.length) return false;
    const tease = teases.includes(forced) ? forced : pick(teases);
    target.teasedAt = (target.teasedAt || []).filter(t => now - t < Teases.WINDOW);
    const reply = Teases.replyFor(teaser.name, tease, target.teasedAt, now);
    target.teasedAt.push(now);
    const cast = [teaser, target];
    for (const pet of cast) { pet.inScene = true; pet.state = 'idle'; pet.looking = false; pet.lastAttention = now; }
    const steps = [
      t => face(teaser, target),
      t => play(teaser, `挑衅_${tease}`, t, 2000),
      t => face(target, teaser),
    ];
    for (const step of reply) {
      if (typeof step === 'string') steps.push(t => play(target, `回应_${step}`, t, 2000));
      else if (step.chase) steps.push(t => { startChase(target, teaser, t, false); return () => target.state !== 'chase'; });
      else if (step.hug) steps.push(t => approach(target, teaser), t => {
        const pairUp = [teaser, target].sort((a, b) => a.x - b.x);
        const key = Combos.comboKey(pairUp.map(p => p.name));
        if (!comboClips[key]?.row) return () => true;
        for (const pet of cast) pet.inScene = false;
        startHug(pairUp, t);
        return () => !teaser.combo;
      });
      else if (step.comfort) steps.push(
        t => approach(target, teaser),
        t => play(target, '回应_摸摸头', t, 2000),
        t => play(teaser, '开心蹦蹦', t, 2000), // 露馅了
        t => play(target, '回应_无语', t, 2000),
      );
    }
    scenes.push({ cast, steps, i: -1, done: () => true });
    return true;
  }

  function endScene(scene, now) {
    scenes = scenes.filter(s => s !== scene);
    for (const pet of scene.cast) {
      pet.inScene = false;
      if (['idle', 'action', 'approach'].includes(pet.state) && !pet.combo) goIdle(pet, now);
    }
  }

  function runScenes(now) {
    for (const scene of [...scenes]) {
      // 被拖走、藏起来、掉下去了……剧情就不演了
      if (focusing || scene.cast.some(pet => !pet.visible || ['drag', 'fall', 'jump'].includes(pet.state))) { endScene(scene, now); continue; }
      if (scene.giveUpAt && now > scene.giveUpAt && scene.i <= 1) { endScene(scene, now); scene.onGiveUp?.(); continue; } // 等太久了
      if (!scene.done(now)) continue;
      scene.i++;
      if (scene.i >= scene.steps.length) { endScene(scene, now); continue; }
      scene.done = scene.steps[scene.i](now) || (() => true);
    }
  }

  function tryTease(now, teaserName, manual = false, forced = null) {
    const names = teaserName ? [teaserName] : Object.keys(Teases.PAIRS).sort(() => Math.random() - 0.5);
    for (const name of names) {
      const teaser = byName(name), target = byName(Teases.PAIRS[name].target);
      if (!teaser || !target) continue;
      if (manual) {
        if (!teaser.visible || !target.visible) continue;
        if (teaser.inScene || target.inScene) continue;
        if (!freeForTest(teaser, now) || !freeForTest(target, now)) continue;
      } else if (!isFree(teaser) || !isFree(target) || teaser.si !== target.si || Math.abs(teaser.x - target.x) > TEASE_NEAR) continue;
      if (startTease(teaser, now, forced)) return true;
    }
    return false;
  }

  // name 是挑衅的那只；也可以是 { name, tease } 指定挑衅哪一个（测试用）
  function onTeaseRequest(request) {
    const { name, tease = null } = typeof request === 'string' ? { name: request } : request;
    const now = performance.now();
    const target = Teases.PAIRS[name]?.target;
    if (showcase) return;
    if (focusing) return say(byName(name), '现在在专注，先不闹啦', 4000);
    if (!tryTease(now, name, true, tease)) {
      const pet = byName(name);
      if (pet?.visible) say(pet.combo || pet, `要先显示${target}哦`, 4000);
    }
  }

  // ---- 送零食：千千猫猫叼胡萝卜给梨梨兔兔，梨梨兔兔叼小鱼给千千猫猫 ----
  function trySnack(now) {
    for (const snack of [...SNACKS].sort(() => Math.random() - 0.5)) {
      const giver = byName(snack.giver), receiver = byName(snack.receiver);
      if (!giver || !receiver || !isFree(giver) || !isFree(receiver) || giver.si !== receiver.si) continue;
      if (!giver.clips[`${snack.carry}向左走`] || !receiver.clips[snack.eat]) continue;
      giver.state = 'deliver';
      giver.snack = { to: receiver, carry: snack.carry, eat: snack.eat, until: now + 30_000 };
      receiver.state = 'wait'; // 站着等零食，不走开
      setAnim(receiver, idleAnim(receiver));
      giver.lastAttention = receiver.lastAttention = now;
      return true;
    }
    return false;
  }

  // ---- 过节 / 生日：时不时播一下 ----
  function maybeCelebrate(pet, now) {
    if (now < (pet.nextCelebrate || 0)) return false;
    const birthday = features.birthday && today.birthdays.includes(pet.name) && pet.clips['生日'];
    const festival = features.festival && today.festival && pet.clips[today.festival] ? today.festival : null;
    if (!birthday && !festival) return false;
    pet.nextCelebrate = now + rand(...CELEBRATE_EVERY);
    celebrate(pet, birthday && (!festival || Math.random() < 0.6) ? '生日' : festival, now);
    return true;
  }

  function celebrate(pet, anim, now) {
    pet.lastAttention = now;
    playNamed(pet, anim, now, 4000);
    if (anim === '生日' && now - lastBirthdayBubble > 60_000) {
      lastBirthdayBubble = now;
      for (const p of pets) if (p.visible) say(p.combo || p, '生日快乐 🎂', 6000);
    }
  }

  function onToday(next) {
    today = { festival: next?.festival || null, birthdays: next?.birthdays || [] };
    const together = next?.together;
    if (together?.anniversary && celebratedDays !== together.days) {
      celebratedDays = together.days;
      setTimeout(() => { if (!showcase && !leaving) celebrateTogether(together.days); }, 3000);
    }
    const now = performance.now();
    if (today.festival || today.birthdays.length) for (const pet of pets) pet.nextCelebrate = Math.min(pet.nextCelebrate || Infinity, now + rand(2000, 8000));
  }

  // ---- 天气 ----
  function applyWeather(kind) {
    if (showcase) { showcase.saved.weather = kind || null; return; } // 展示完再换
    weatherKind = kind || null;
    // 正在演剧情的（比如趴着等哥哥狗狗来扶）不换，免得被天气待机顶掉
    for (const pet of pets) if (pet.state === 'idle' && !pet.looking && !pet.inScene) setAnim(pet, idleAnim(pet));
  }

  // ---- 番茄钟 ----
  const BUSY = ['drag', 'fall', 'jump', 'hug'];
  function onFocus(info) {
    if (showcase) { showcase.saved.focus = info; return; } // 展示完再换
    applyFocus(info);
  }

  function applyFocus(info) {
    const on = typeof info === 'object' ? !!info?.on : !!info;
    focusing = on;
    const now = performance.now();
    // 专注到一半的时候（主程序给的是电脑时间，换成页面里的时间）
    focusHalfAt = on && info?.endsAt ? now + ((info.startedAt + info.endsAt) / 2 - Date.now()) : Infinity;
    if (on) hideActionButton('continue');
    for (const pet of pets) {
      if (!pet.visible || BUSY.includes(pet.state)) continue;
      if (on || pet.state === 'focus') { pet.chase = null; pet.chaser = null; pet.snack = null; goIdle(pet, now); }
    }
  }

  function onFocusDone() {
    if (showcase) return;
    const now = performance.now();
    for (const pet of pets) {
      if (!pet.visible) continue;
      if (!BUSY.includes(pet.state)) playNamed(pet, '开心蹦蹦', now, 3000);
      say(pet.combo || pet, '休息一下吧', 8000);
    }
  }

  function onAskContinue() {
    if (showcase) return;
    for (const pet of pets) if (pet.visible) say(pet.combo || pet, '休息好啦～', 6000);
    showActionButton('continue', '休息好啦，继续专注吗？点我 🍅', () => { hideActionButton('continue'); api.startFocus(); });
  }

  // ---- 拍照：把桌面上的宠物录 3 秒（10 帧/秒），存成背景透明的 GIF ----
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function takePhoto() {
    if (photoBusy) return;
    photoBusy = true;
    try {
      for (const pet of pets) if (pet.visible) say(pet.combo || pet, '咔嚓～拍 3 秒哦', 3200);
      await sleep(400); // 让气泡先出来，拍照时不拍气泡
      const shots = [];
      for (let i = 0; i < 30; i++) {
        const items = [];
        for (const sprite of [...pets.filter(p => p.visible && !p.el.hidden), ...combos]) {
          if (!sprite.img.complete || !sprite.img.naturalWidth) continue;
          const r = sprite.el.getBoundingClientRect();
          const snap = document.createElement('canvas'); // 这一刻 GIF 正在播的那一帧
          snap.width = Math.max(1, Math.round(r.width));
          snap.height = Math.max(1, Math.round(r.height));
          const ctx = snap.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sprite.img, 0, 0, snap.width, snap.height);
          items.push({ snap, x: Math.round(r.left), y: Math.round(r.top) });
        }
        shots.push(items);
        await sleep(100);
      }
      const all = shots.flat();
      if (!all.length) return api.savePhoto(null);
      const pad = 6;
      const left = Math.max(0, Math.min(...all.map(i => i.x)) - pad), top = Math.max(0, Math.min(...all.map(i => i.y)) - pad);
      const right = Math.min(W(), Math.max(...all.map(i => i.x + i.snap.width)) + pad), bottom = Math.min(H(), Math.max(...all.map(i => i.y + i.snap.height)) + pad);
      const canvas = document.createElement('canvas');
      canvas.width = right - left;
      canvas.height = bottom - top;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const frames = shots.map(items => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const { snap, x, y } of items) ctx.drawImage(snap, x - left, y - top);
        return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, delay: 10 };
      });
      api.savePhoto(window.GifEncoder.encodeGif(frames, canvas.width, canvas.height));
    } catch (error) {
      console.error('拍照失败', error);
      api.savePhoto(null);
    } finally {
      photoBusy = false;
    }
  }

  // ---- 「测试一下」 ----
  function freeForTest(pet, now) {
    if (!pet.visible) return false;
    if (pet.combo) endCombo(pet.combo, now, false, true);
    if (BUSY.includes(pet.state)) return false;
    pet.chase = null; pet.chaser = null; pet.snack = null;
    pet.y = floorOf(pet);
    pet.onLedge = false;
    pet.state = 'idle';
    return true;
  }

  function onTest({ type, value }) {
    if (showcase) return;
    const now = performance.now();
    const hint = text => { const pet = pets.find(p => p.visible); if (pet) say(pet.combo || pet, text, 5000); };
    if (type === 'festival') {
      let any = false;
      for (const pet of pets) if (pet.clips[value] && freeForTest(pet, now)) { playNamed(pet, value, now, 4000); any = true; }
      if (!any) hint('要先让宠物显示出来哦');
    } else if (type === 'birthday') {
      const pet = byName(value);
      if (pet && freeForTest(pet, now)) { lastBirthdayBubble = -Infinity; celebrate(pet, '生日', now); }
      else hint(`要先在「选择宠物」里勾上${value}哦`);
    } else if (type === 'chase') {
      for (const pet of pets) freeForTest(pet, now);
      if (!tryChase(now)) hint('要显示煤球猫猫和另一只宠物，而且在同一块屏幕的地上哦');
    } else if (type === 'snack') {
      for (const pet of pets) freeForTest(pet, now);
      if (!trySnack(now)) hint('要同时显示千千猫猫和梨梨兔兔，而且在同一块屏幕的地上哦');
    } else if (type === 'dog-help') {
      const dog = byName(DOG);
      const others = pets.filter(p => p !== dog && !p.visitor && p.visible);
      if (!dog || !freeForTest(dog, now) || !others.length) return hint('要显示哥哥狗狗和另一只宠物哦');
      const fallen = pick(others);
      if (!freeForTest(fallen, now)) return;
      fallen.si = dog.si;
      fallen.y = floorOf(fallen) + 300;
      dropFrom(fallen);
    } else if (type === 'dog-sign') {
      const dog = byName(DOG);
      if (!dog || !freeForTest(dog, now) || !holdUpSign(now)) hint('要先显示哥哥狗狗哦');
    } else if (type === 'dog-blanket') {
      const dog = byName(DOG), cat = byName('千千猫猫');
      if (!dog || !cat || !freeForTest(dog, now) || !freeForTest(cat, now)) return hint('要同时显示哥哥狗狗和千千猫猫哦');
      cat.si = dog.si;
      cat.state = 'sleep';
      setAnim(cat, '睡觉');
      if (!checkBlanket(now, true)) hint('盖被子没成功，再试一次吧');
    } else if (type === 'g-read' || type === 'g-doze' || type === 'g-fall') {
      const g = byName(G);
      if (!g || !freeForTest(g, now)) return hint(`要先在「选择宠物」里勾上${G}哦`);
      if (type === 'g-read') { startReading(g, now); g.until = now + 60_000; say(g, '拖一只宠物到我旁边，一起看书吧', 5000); }
      if (type === 'g-doze') doze(g, now);
      if (type === 'g-fall') { g.y = floorOf(g) + 300; dropFrom(g); }
    } else if (type === 'bugfix') {
      if (!dogDoes('互动_修bug', '出了点小问题，我记下来了（这是测试）')) hint('要先显示哥哥狗狗哦');
    } else if (type === 'anniversary') {
      celebrateTogether(value || 1);
    } else if (type === 'swap') {
      const dog = byName(DOG), g = byName(G);
      if (!dog || !g || !freeForTest(dog, now) || !freeForTest(g, now)) return hint('要同时显示哥哥狗狗和g老师哦');
      dog.si = g.si;
      dog.x = Math.min(g.x + 120 * size, xRange(dog)[1]);
      if (!trySwapGlasses(now, true)) hint('换眼镜没成功，再试一次吧');
    } else if (type === 'g-catch' || type === 'g-watch' || type === 'g-grading') {
      const g = byName(G);
      if (!g || !freeForTest(g, now)) return hint(`要先在「选择宠物」里勾上${G}哦`);
      const kind = { 'g-catch': 'catch', 'g-watch': 'watch', 'g-grading': 'grading' }[type];
      const friends = pets.filter(p => p !== g && !p.visitor && p.visible && (type === 'g-grading' ? p.name === DOG : p.name !== DOG)
        && comboClips[Combos.comboKey([p.name, G])]?.[kind]);
      const friend = pick(friends);
      if (!friend || !freeForTest(friend, now)) return hint(type === 'g-grading' ? '要同时显示哥哥狗狗和g老师哦' : '要再显示一只哥哥狗狗以外的宠物哦');
      friend.si = g.si;
      friend.y = g.y;
      const [min, max] = xRange(g);
      friend.x = g.x + 120 * size <= max ? g.x + 120 * size : Math.max(g.x - 120 * size, min);
      if (type === 'g-catch') { g.forceCatch = true; g.y = floorOf(g) + 300; dropFrom(g); }
      if (type === 'g-watch') doze(g, now);
      if (type === 'g-grading') {
        for (const k of ['grading', 'bookmark']) comboCooldown.delete(`${k}:${Combos.comboKey([DOG, G])}`);
        g.restUntil = 0;
        startReading(g, now);
        checkReadingHug(now);
        if (!g.combo) hint('批改作业没成功，再试一次吧');
      }
    } else if (type === 'fake-guest') {
      // 假装对方的宠物来串门（不用联网），看看客人进门、打招呼、玩一会儿再走的样子
      const name = pick(Object.keys(petData));
      welcomeVisitor(name, '测试的朋友', true);
    } else if (type === 'visit') {
      if (!peerOnline) return hint('要先联网配对，而且对方也在线，才能去串门哦');
      if (pets.some(p => p.away)) return hint('已经有一只在对方家串门啦');
      for (const pet of pets) if (!pet.visitor) freeForTest(pet, now);
      if (!tryVisit(now)) hint('没有能出门的宠物，看看「允许去串门的宠物」里有没有勾上');
    } else if (type === 'brothers' || type === 'makeup') {
      const dog = byName('哥哥狗狗'), gege = byName('梨梨哥哥');
      if (!dog || !gege || !freeForTest(dog, now) || !freeForTest(gege, now)) return hint('要同时显示哥哥狗狗和梨梨哥哥哦');
      gege.si = dog.si;
      gege.y = dog.y;
      gege.x = Math.min(dog.x + dog.w * 0.5, xRange(gege)[1]);
      const pair = [dog, gege].sort((a, b) => a.x - b.x);
      const key = Combos.comboKey(pair.map(p => p.name));
      if (type === 'makeup') needsMakeup.add(key); else needsMakeup.delete(key);
      startHug(pair, now);
    }
  }

  // ---- 功能展示：按顺序把所有功能演示一遍 ----
  // 只在页面里演：不改设置、不联网、不查天气、不弹真正的提醒（主程序那边也会挡住）。
  // 演示时临时把要用的宠物显示出来，结束后恢复原来显示的宠物和位置。
  let showcase = null;             // { stopped, saved, step }
  const SHOWCASE_STOP = { stopped: true };
  const WEATHER_DEMO = [
    ['待机_晴天', '☀️ 晴天的白天是这样的'], ['待机_晴夜', '🌙 晴天的晚上是这样的'], ['待机_多云', '⛅ 多云'], ['待机_阴天', '☁️ 阴天'],
    ['待机_雾', '🌫️ 起雾啦'], ['待机_毛毛雨', '🌦️ 毛毛雨'], ['待机_雨天', '☔ 下雨天会撑伞哦'], ['待机_大雨', '🌧️ 大雨'],
    ['待机_雷雨', '⛈️ 打雷下雨'], ['待机_下雪', '❄️ 下雪啦'], ['待机_降温', '🥶 低于 10 度会冷冷的'], ['待机_炎热', '🥵 高于 32 度好热'],
  ];

  async function scWait(ms) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (!showcase || showcase.stopped) throw SHOWCASE_STOP;
      await sleep(Math.min(100, end - performance.now()));
    }
    if (!showcase || showcase.stopped) throw SHOWCASE_STOP;
  }

  // 等到 done() 成立（最多等 max 毫秒）
  async function scWaitFor(done, max) {
    const end = performance.now() + max;
    while (performance.now() < end && !done()) await scWait(200);
  }

  // 让一只宠物安静站好（不走、不演剧情）
  function scCalm(pet, now = performance.now()) {
    if (pet.combo) scFinishCombo(pet.combo);
    pet.chase = null; pet.chaser = null; pet.snack = null; pet.then = null; pet.approach = null; pet.fleeDir = 0;
    pet.inScene = false; pet.looking = false; pet.drag = null; pet.onLedge = false; pet.restUntil = 0;
    pet.y = floorOf(pet);
    pet.state = 'idle';
    pet.anim = '';
    setAnim(pet, idleAnim(pet));
    pet.lastAttention = now;
  }

  // 只显示这几只，按顺序在主屏幕中间排开
  function scLineup(names, spread = 0.5) {
    const list = names.map(byName).filter(Boolean);
    const s = screens[primaryIndex()];
    scenes = [];
    for (const pet of pets) {
      if (pet.visitor || pet.away) continue;
      const on = list.includes(pet);
      if (on || pet.visible) { pet.si = primaryIndex(); scCalm(pet); }
      pet.visible = on;
      pet.el.hidden = !on;
    }
    list.forEach((pet, i) => {
      const t = list.length > 1 ? i / (list.length - 1) : 0.5;
      pet.x = s.x + s.w * (0.45 - spread / 2 + spread * t); // 偏左一点，右下角留给进度
    });
    return list;
  }

  const tell = (pet, text, ms = 4000) => say(pet.combo || pet, text, ms);

  // 播一段贴贴 / 叠叠乐 / 特别剧情（播一遍就散开，不接打架、不摔下来）
  async function scCombo(kind, members, text, minMs = 2500) {
    const key = Combos.comboKey(members.map(p => p.name));
    const clip = comboClips[key]?.[kind];
    if (!clip) return;
    const now = performance.now();
    for (const pet of members) scCalm(pet, now);
    const s = screens[primaryIndex()];
    const combo = makeCombo(kind, members, key, s.x + s.w * 0.45, floorOf(members[0]), now, 0);
    combo.until = Infinity; // 由展示来决定什么时候结束
    place(combo);
    if (text) say(combo, text, Math.max(clip.duration, minMs));
    await scWait(Math.max(clip.duration, minMs));
    scFinishCombo(combo);
  }

  function scFinishCombo(combo) {
    removeCombo(combo, false);
    const n = combo.members.length;
    combo.members.forEach((pet, i) => {
      pet.x = combo.x + (i - (n - 1) / 2) * pet.w * 0.55;
      pet.state = 'idle';
      pet.anim = '';
      setAnim(pet, idleAnim(pet));
    });
  }

  function scPlay(pet, anim, ms = 2500) {
    if (!pet?.clips[anim]) return false;
    playNamed(pet, anim, performance.now(), ms);
    return true;
  }

  const SHOWCASE_STEPS = [
    ['走路', async () => {
      const [cat, bunny] = scLineup(['千千猫猫', '梨梨兔兔'], 0.3);
      tell(cat, '平时会自己走来走去哦');
      walkTo(cat, cat.x - 250);
      walkTo(bunny, bunny.x + 250);
      await scWait(3500);
    }],
    ['看鼠标', async () => {
      const [cat] = scLineup(['千千猫猫']);
      tell(cat, '鼠标靠近时会转头看你', 4500);
      setAnim(cat, '向左看', true); await scWait(1500);
      setAnim(cat, '向右看', true); await scWait(1500);
      setAnim(cat, '向左看', true); await scWait(1200);
    }],
    ['点击动作', async () => {
      const [bunny] = scLineup(['梨梨兔兔']);
      tell(bunny, '点一下会随机做个动作，右键打开菜单', 6000);
      for (let i = 0; i < 3; i++) { playRandomAction(bunny, performance.now()); await scWait(2200); }
    }],
    ['害羞', async () => {
      const [cat] = scLineup(['千千猫猫']);
      tell(cat, '鼠标在身上快速左右晃，会害羞哦');
      scPlay(cat, '害羞', 3000);
      await scWait(3200);
    }],
    ['掉落和摔趴趴', async () => {
      const [bunny] = scLineup(['梨梨兔兔']);
      scPlay(bunny, '吓一跳', 2000);
      tell(bunny, '按住就能拖着走，被拎起来会吓一跳', 2500);
      await scWait(2500);
      tell(bunny, '拖到高处松手会掉下来，摔趴趴！', 5000);
      bunny.y = floorOf(bunny) + 350;
      dropFrom(bunny);
      await scWaitFor(() => bunny.state === 'idle', 6000);
      await scWait(800);
    }],
    ['哥哥狗狗扶起来', async () => {
      const [cat, dog] = scLineup(['千千猫猫', DOG], 0.35);
      tell(dog, '有宠物摔倒，哥哥狗狗会跑过去扶起来', 6000);
      cat.y = floorOf(cat) + 350;
      dropFrom(cat);
      await scWaitFor(() => !cat.inScene && cat.state !== 'fall' && !cat.combo && performance.now() > 0, 15000);
      await scWait(2000);
    }],
    ['天气待机', async () => {
      const list = scLineup(['千千猫猫', '梨梨兔兔', DOG, '梨梨哥哥', '煤球猫猫', G], 0.6);
      tell(list[0], '会按天气换待机动画哦（每 30 分钟查一次）', 3000);
      await scWait(2500);
      for (const [anim, text] of WEATHER_DEMO) {
        weatherKind = anim;
        for (const pet of list) setAnim(pet, pet.clips[anim] ? anim : '待机');
        tell(list[2], text, 2600);
        await scWait(2600);
      }
      weatherKind = showcase.saved.weather;
    }],
    ['节日', async () => {
      const list = scLineup(['千千猫猫', '梨梨兔兔', DOG, '梨梨哥哥', '煤球猫猫', G], 0.6);
      for (const [name, text] of [['国庆', '🇨🇳 国庆节'], ['万圣节', '🎃 万圣节'], ['圣诞', '🎄 圣诞节'], ['春节', '🧧 春节']]) {
        for (const pet of list) scPlay(pet, name, 3000);
        tell(list[2], `${text}那天会一起过节哦`, 3000);
        await scWait(3200);
      }
    }],
    ['生日', async () => {
      const list = scLineup(['千千猫猫', '梨梨兔兔', DOG], 0.4);
      for (const pet of list) scPlay(pet, '生日', 4000);
      tell(list[1], '在「宠物生日」里设好生日，那天会过生日 🎂', 4500);
      await scWait(4500);
    }],
    ['专注和番茄钟', async () => {
      const list = scLineup(['千千猫猫', '梨梨兔兔', G], 0.4);
      const g = byName(G);
      focusing = true;
      for (const pet of list) goIdle(pet, performance.now());
      tell(list[0], '点菜单里的「开始专注」，大家会陪你专注', 4000);
      tell(g, 'g老师会看书哦', 4000);
      await scWait(4200);
      scPlay(g, '互动_看书打瞌睡', 3000);
      tell(g, '专注到一半会打个瞌睡', 3200);
      await scWait(3400);
      focusing = false;
      for (const pet of list) { scPlay(pet, '开心蹦蹦', 3000); tell(pet, '休息一下吧', 3000); }
      tell(list[1], '专注结束会叫你休息一下', 3200);
      await scWait(3400);
    }],
    ['跟着你一起', async () => {
      const list = scLineup(['千千猫猫', '梨梨兔兔', DOG, '梨梨哥哥', '煤球猫猫', G], 0.6);
      for (const [anim, text, ms] of [
        ['敲代码', '⌨️ 你打字的时候，大家会陪你敲键盘', 3500],
        ['看视频', '📺 你看视频的时候，会一起看', 3500],
        ['跳舞', '🎵 你听音乐的时候，会跟着跳舞', 3500],
        ['冒冷汗', '💦 电脑很忙的时候会冒冷汗', 3000],
        ['吃饭', '🍚 到饭点会提醒你吃饭', 3000],
        ['开心蹦蹦', '🧘 坐太久会叫你起来活动一下', 3000],
        ['睡觉', '🌙 半夜会催你睡觉，电量低了也会没电', 3500],
      ]) {
        for (const pet of list) scPlay(pet, anim, ms);
        tell(list[2], text, ms);
        await scWait(ms + 200);
      }
      tell(list[0], '看什么程序只在你电脑上判断，不会发出去哦', 3500);
      await scWait(3500);
    }],
    ['和朋友联网', async () => {
      const list = scLineup(['千千猫猫', '梨梨兔兔'], 0.3);
      for (const pet of list) scPlay(pet, '打招呼', 2500);
      tell(list[0], '朋友戳你一下，大家会打招呼', 2800);
      await scWait(2800);
      for (const pet of list) scPlay(pet, '开心蹦蹦', 2500);
      tell(list[1], '朋友摸自己的宠物，你这边会开心蹦蹦', 2800);
      await scWait(2800);
      const name = petData['煤球猫猫'] ? '煤球猫猫' : Object.keys(petData)[0];
      welcomeVisitor(name, '演示的朋友', true);
      const guest = pets.find(p => p.visitor && p.name === name);
      if (guest) {
        guest.showcase = true;
        tell(list[0], '朋友家的宠物偶尔会来串门（这只是演示）', 6000);
        await scWait(6500);
        visitorLeave(guest, performance.now(), false);
        await scWaitFor(() => !pets.includes(guest), 8000);
      }
    }],
    ['挑衅和回应', async () => {
      for (const [teaser, target] of [['千千猫猫', DOG], ['梨梨兔兔', '梨梨哥哥']]) {
        const [a, b] = scLineup([teaser, target], 0.2);
        tell(a, `${teaser}偶尔会挑衅${target}，右键${teaser}也能让它去挑衅`, 4000);
        await scWait(1500);
        tryTease(performance.now(), teaser, true);
        await scWaitFor(() => !a.inScene && !b.inScene && !a.combo && !['chase', 'flee'].includes(a.state) && !['chase', 'flee'].includes(b.state), 25000);
        await scWait(1000);
      }
    }],
    ['两个哥哥', async () => {
      const [dog, gege] = scLineup([DOG, '梨梨哥哥'], 0.12);
      await scCombo('row', [dog, gege], '两个哥哥挨在一起会贴贴……');
      await scCombo('fight', [dog, gege], '贴完就打起来了！');
      tell(dog, '过一阵再见面……', 2000);
      await scWait(2000);
      await scCombo('makeup', [dog, gege], '会先和好，然后接着贴贴');
      await scCombo('row', [dog, gege], '又贴贴啦');
    }],
    ['灰鸮g老师', async () => {
      const [g] = scLineup([G]);
      tell(g, '点我会扶眼镜，连着点越扶越用力，第 4 下擦眼镜', 7000);
      for (let i = 0; i < GLASSES.length; i++) { clickGlasses(g, performance.now()); await scWait(1800); }
      scCalm(g);
      startReading(g, performance.now());
      tell(g, '平时偶尔会看书', 3000);
      await scWait(3000);
      scCalm(g);
      setAnim(g, '互动_歪头看_向左', true);
      tell(g, '鼠标在旁边停 3 秒，会歪头看你', 3000);
      await scWait(3000);
      scPlay(g, '互动_往后蹦_向右', 0);
      tell(g, '鼠标一动就往后蹦！', 2500);
      await scWait(2500);
      const [dog, g2] = scLineup([DOG, G], 0.12);
      await scCombo('grading', [dog, g2], '看书时哥哥狗狗凑过来，就是批改作业', 4000);
      walkTo(dog, dog.x - 250);
      await scWait(1500);
      scPlay(g2, '互动_夹书签', 0);
      tell(g2, '哥哥狗狗走开以后，g老师会夹上书签', 3500);
      await scWait(3500);
      const [dog2, g4] = scLineup([DOG, G], 0.12);
      await scCombo('bookmark', [dog2, g4], '下次来批改作业，书签还在哦', 4000);
      const [cat, g5] = scLineup(['千千猫猫', G], 0.12);
      await scCombo('catch', [cat, g5], '摔倒时旁边有人，可能会帮它接住眼镜', 4000);
      const [bunny, g6] = scLineup(['梨梨兔兔', G], 0.12);
      await scCombo('watch', [bunny, g6], '看书睡着时，旁边的宠物会凑过来围观……', 4000);
      for (const pet of [bunny, g6]) { pet.state = 'sleep'; setAnim(pet, '睡觉'); }
      tell(g6, '然后一起睡着，鼠标靠近才会醒', 3000);
      await scWait(3000);
      const [g3] = scLineup([G]);
      tell(g3, '没人扶的时候，摔倒了会假装没摔过', 7000);
      g3.y = floorOf(g3) + 350;
      dropFrom(g3);
      await scWaitFor(() => g3.state === 'walk', 9000);
      await scWait(1500);
    }],
    ['哥哥狗狗', async () => {
      const [dog] = scLineup([DOG]);
      scPlay(dog, '互动_举牌测试通过', 3000);
      tell(dog, '连续打字 5 分钟，停下来会举牌「测试通过」', 3500);
      await scWait(3500);
      const [cat, dog2] = scLineup(['千千猫猫', DOG], 0.12);
      await scCombo('blanket', [cat, dog2], '晚上千千猫猫睡着了，哥哥狗狗会给它盖被子', 4000);
    }],
    ['小惊喜', async () => {
      const [dog] = scLineup([DOG]);
      scPlay(dog, '互动_修bug', 3500);
      tell(dog, '桌宠出错时哥哥狗狗会去修，还会记进错误日志', 3800);
      await scWait(3800);
      scPlay(dog, '互动_写日记', 3500);
      tell(dog, '每天晚上 10 点写今日小日记，写好会给你看', 3800);
      await scWait(3800);
      const list = scLineup(['千千猫猫', '梨梨兔兔', DOG, '梨梨哥哥', '煤球猫猫', G], 0.6);
      for (const pet of list) scPlay(pet, '纪念日', 4000);
      tell(list[2], '在一起第 7、30、100 天……大家会一起庆祝', 4200);
      await scWait(4200);
      const [dog2, g] = scLineup([DOG, G], 0.12);
      await scCombo('swap', [dog2, g], '哥哥狗狗和g老师偶尔会换眼镜戴', 4000);
    }],
    ['送零食', async () => {
      const [cat, bunny] = scLineup(['千千猫猫', '梨梨兔兔'], 0.4);
      tell(cat, '千千猫猫和梨梨兔兔会互相送零食', 4000);
      trySnack(performance.now());
      await scWaitFor(() => !['deliver', 'wait'].includes(cat.state) && !['deliver', 'wait'].includes(bunny.state) && cat.state !== 'action' && bunny.state !== 'action', 20000);
      await scWait(800);
    }],
    ['追着玩', async () => {
      const [coal, bunny] = scLineup(['煤球猫猫', '梨梨兔兔'], 0.4);
      tell(coal, '煤球猫猫偶尔会突然冲过去追着玩', 4000);
      startChase(coal, bunny, performance.now(), true);
      await scWaitFor(() => coal.state !== 'chase' && coal.state !== 'action', 12000);
      await scWait(800);
    }],
    ['贴贴', async () => {
      const keys = Object.keys(comboClips).filter(key => comboClips[key].row);
      for (const [i, key] of keys.entries()) {
        const members = scLineup(key.split('-'), 0.1);
        const reading = members.some(p => p.name === G);
        await scCombo('row', members, `${reading ? '一起看书' : '挨在一起就会贴贴'}（${i + 1} / ${keys.length}）`, 2200);
      }
    }],
    ['叠叠乐', async () => {
      const keys = Object.keys(comboClips).filter(key => comboClips[key].stack);
      for (const [i, key] of keys.entries()) {
        const members = scLineup(key.split('-'), 0.1);
        await scCombo('stack', members, `把一只拖到另一只头上就能叠叠乐（${i + 1} / ${keys.length}）`, 2200);
      }
    }],
  ];

  let showcaseBox = null;
  function showProgress(text) {
    if (!showcaseBox) { showcaseBox = document.createElement('div'); showcaseBox.className = 'bubble showcase-progress'; document.body.append(showcaseBox); }
    showcaseBox.hidden = !text;
    if (!text) return;
    showcaseBox.textContent = text;
    const s = screens[primaryIndex()];
    const x = s.x + s.w - showcaseBox.offsetWidth - 16, y = s.y + s.h - showcaseBox.offsetHeight - 16;
    showcaseBox.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  async function startShowcase() {
    if (showcase || !pets.length) return;
    const now = performance.now();
    showcase = {
      stopped: false,
      saved: {
        weather: weatherKind, focusing, focusHalfAt, focus: null,
        pets: new Map(pets.map(pet => [pet, { x: pet.x, y: pet.y, si: pet.si, onLedge: pet.onLedge, visible: pet.visible }])),
      },
    };
    api.showcaseState(true);
    for (const combo of [...combos]) scFinishCombo(combo);
    for (const pet of pets) if (!pet.visitor) freeForTest(pet, now);
    hideActionButton('continue');
    try {
      for (const [i, [title, run]] of SHOWCASE_STEPS.entries()) {
        showProgress(`✨ 功能展示 ${i + 1} / ${SHOWCASE_STEPS.length} · ${title}　（按 Esc 停止）`);
        await run();
        await scWait(600);
      }
    } catch (error) {
      if (error !== SHOWCASE_STOP) console.error('功能展示出错', error);
    }
    endShowcase();
  }

  function stopShowcase() {
    if (showcase) showcase.stopped = true;
  }

  // 结束：恢复原来显示的宠物、位置、天气和专注
  function endShowcase() {
    if (!showcase) return;
    const { saved } = showcase;
    showcase = null;
    showProgress('');
    const now = performance.now();
    for (const combo of [...combos]) scFinishCombo(combo);
    scenes = [];
    for (const guest of pets.filter(p => p.visitor && p.showcase)) removeVisitor(guest); // 演示用的客人
    weatherKind = saved.weather;
    focusing = saved.focusing;
    focusHalfAt = saved.focusHalfAt;
    for (const pet of pets) {
      if (pet.visitor) continue;
      const before = saved.pets.get(pet);
      const visible = !!shown[pet.id] && !pet.away; // 展示时在菜单里改过显示哪几只，就按改过的
      pet.bubble.classList.remove('show');
      if (before?.visible && visible) Object.assign(pet, { x: before.x, y: before.y, si: before.si });
      else { pet.si = primaryIndex(); }
      scCalm(pet, now);
      if (before?.visible && visible) { pet.y = before.y; pet.onLedge = before.onLedge; }
      pet.visible = visible;
      pet.el.hidden = !visible;
      if (visible) goIdle(pet, now);
      if (visible && pet.y > floorOf(pet) && !pet.onLedge) dropFrom(pet); // 原来站的窗口不在了
    }
    if (saved.focus) applyFocus(saved.focus); // 展示时真的开始 / 结束了专注
    api.showcaseState(false);
  }

  // ---- 两个眼镜交换：哥哥狗狗和g老师离得不远时，偶尔换眼镜戴（最多两小时一次） ----
  let nextSwapCheck = performance.now() + 120_000;
  function trySwapGlasses(now, force = false) {
    const dog = byName(DOG), g = byName(G);
    const key = Combos.comboKey([DOG, G]);
    if (!dog || !g || !comboClips[key]?.swap || !isFree(dog) || !isFree(g) || dog.si !== g.si) return false;
    if (!force) {
      if (Math.abs(dog.x - g.x) > SWAP_NEAR * size) return false;
      let last = 0;
      try { last = Number(localStorage.getItem('glasses-swap-at')) || 0; } catch {}
      if (Date.now() - last < SWAP_EVERY) return false;
    }
    try { localStorage.setItem('glasses-swap-at', String(Date.now())); } catch {}
    const pair = [dog, g].sort((a, b) => a.x - b.x);
    const combo = makeCombo('swap', pair, key, (dog.x + g.x) / 2, g.y, now, 0); // 播一遍
    clampToScreen(combo, g);
    place(combo);
    return true;
  }

  // ---- 狗狗修 bug / 写日记 / 纪念日 ----
  function dogDoes(anim, text, ms = 3500) {
    const dog = byName(DOG);
    if (!dog || !dog.visible || dog.combo || dog.inScene || ['drag', 'fall', 'jump', 'hug', 'exit', 'enter'].includes(dog.state) || !dog.clips[anim]) return false;
    dog.lastAttention = performance.now();
    playNamed(dog, anim, performance.now(), ms);
    say(dog, text, ms + 1500);
    return true;
  }
  function onBugfix() { if (!showcase) dogDoes('互动_修bug', '出了点小问题，我记下来了'); }
  function onDiaryWrite() { dogDoes('互动_写日记', '今天的日记写好啦～', 3500); }
  let celebratedDays = 0;
  function celebrateTogether(days) {
    const now = performance.now();
    for (const pet of pets) {
      if (!pet.visible || pet.visitor) continue;
      if (pet.combo) { say(pet.combo, `我们在一起第 ${days} 天啦`, 8000); continue; }
      if (!BUSY.includes(pet.state) && !pet.inScene) { pet.lastAttention = now; playNamed(pet, '纪念日', now, 4000); }
      say(pet, `我们在一起第 ${days} 天啦`, 8000);
    }
  }

  // ---- 退出前道晚安：醒着的打招呼，睡着的接着睡，3 秒后慢慢变透明，再真正退出 ----
  let leaving = false;
  function goodnight() {
    if (leaving) return;
    leaving = true;
    stopShowcase();
    const now = performance.now();
    for (const combo of combos) say(combo, '晚安～', 5000);
    for (const pet of pets) {
      if (!pet.visible || pet.combo) continue;
      if (pet.state === 'sleep') continue; // 睡着的就让它睡
      if (!['drag', 'fall', 'jump'].includes(pet.state)) { pet.inScene = false; playNamed(pet, '打招呼', now, 3000); }
      say(pet, '晚安～', 5000);
    }
    setTimeout(() => {
      document.body.style.transition = 'opacity 1.5s ease';
      document.body.style.opacity = '0';
      setTimeout(() => api.goodnightDone(), 1600);
    }, 3000);
  }

  // ---- 每一帧 ----
  // 在发呆（包括正在看鼠标）、走路、睡觉时一打字就陪你敲代码
  // 做普通动作（点击动作、提醒、过节……）时也马上换成敲代码，打字时大家都安安静静地陪你敲
  const CAN_START_TYPING = ['idle', 'walk', 'sleep', 'action'];

  function think(pet, now, dt) {
    if (CAN_START_TYPING.includes(pet.state) && !pet.inScene && !pet.tucked && !showcase && isTypingLong(now)) {
      pet.state = 'typing';
      pet.then = null;
      pet.lastAttention = now;
      setAnim(pet, '敲代码');
      return;
    }
    switch (pet.state) {
      case 'focus':
        pet.lastAttention = now; // 专注时不睡觉、不乱跑
        break;
      case 'chase': {
        const target = pet.chase.target;
        if (!target.visible || target.state !== 'flee' || now > pet.chase.until || Math.abs(target.x - pet.x) < 50) { endChase(pet, now); break; }
        moveToward(pet, target.x, WALK_SPEED * CHASE_SPEED * dt, '向左走', '向右走');
        break;
      }
      case 'flee': {
        const chaser = pet.chaser;
        if (!chaser || chaser.state !== 'chase') { pet.chaser = null; goIdle(pet, now); break; }
        const [min, max] = walkRange(pet);
        let dir = pet.fleeDir || Math.sign(pet.x - chaser.x) || 1;
        if ((dir < 0 && pet.x <= min + 1) || (dir > 0 && pet.x >= max - 1)) dir = -dir; // 跑到头了就掉头
        pet.fleeDir = dir;
        pet.x = Math.min(Math.max(pet.x + dir * WALK_SPEED * FLEE_SPEED * dt, min), max);
        setAnim(pet, dir < 0 ? '向左走' : '向右走');
        break;
      }
      case 'deliver': {
        const { to, carry, eat, until } = pet.snack;
        if (!to.visible || to.state !== 'wait' || now > until) { pet.snack = null; goIdle(pet, now); if (to.state === 'wait') goIdle(to, now); break; }
        if (Math.abs(to.x - pet.x) < (pet.w + to.w) * 0.3) {
          pet.snack = null;
          goIdle(pet, now);
          to.lastAttention = now;
          playNamed(to, eat, now, 3000);
          break;
        }
        moveToward(pet, to.x, WALK_SPEED * SNACK_SPEED * dt, `${carry}向左走`, `${carry}向右走`);
        break;
      }
      case 'wait':
        if (!pets.some(p => p.state === 'deliver' && p.snack?.to === pet)) goIdle(pet, now);
        else pet.lastAttention = now;
        break;
      case 'exit': {
        const dir = pet.exitDir;
        pet.x += dir * WALK_SPEED * 1.3 * dt;
        setAnim(pet, dir < 0 ? '向左走' : '向右走');
        const s = screenOf(pet);
        if (pet.x < s.x - pet.w / 2 || pet.x > s.x + s.w + pet.w / 2) { const done = pet.onExit; pet.onExit = null; if (done) done(now); else goIdle(pet, now); }
        break;
      }
      case 'enter':
        moveToward(pet, pet.enterTo, WALK_SPEED * 1.3 * dt, '向左走', '向右走');
        if (Math.abs(pet.x - pet.enterTo) < 1) { const done = pet.onEnter; pet.onEnter = null; if (done) done(now); else goIdle(pet, now); }
        break;
      case 'approach': {
        // 走到对方身边（挑衅剧情里用）
        const other = pet.approach;
        if (!other || !other.visible) { pet.approach = null; goIdle(pet, now); break; }
        if (Math.abs(other.x - pet.x) < (pet.w + other.w) * 0.3) { pet.approach = null; goIdle(pet, now); break; }
        moveToward(pet, other.x, WALK_SPEED * dt, '向左走', '向右走');
        break;
      }
      case 'idle':
        if (pet.inScene) break; // 在演挑衅剧情，等下一步
        if (showcase || leaving) break; // 功能展示时只做展示让它做的；要退出了就不乱跑
        if (maybeCelebrate(pet, now)) break;
        if (pet.name === G && !pet.visitor && now >= pet.nextThink && Math.random() < 0.15 && startReading(pet, now)) break;
        if (maybeSweat(pet, now)) break;
        if (maybeDoActivity(pet, now)) break;
        if (now - pet.lastAttention > SLEEP_AFTER) { pet.state = 'sleep'; setAnim(pet, '睡觉'); break; }
        if (now >= pet.nextThink) {
          if (wantsLedge(pet) && Math.random() < 0.9) {
            // 离窗口不远就直接跳；远的话走到离自己最近的那头再跳
            const [min, max] = ledgeRange(pet);
            const nearest = Math.min(Math.max(pet.x, min), max);
            if (Math.abs(nearest - pet.x) <= JUMP_REACH) jumpUp(pet);
            else walkTo(pet, nearest + Math.sign(pet.x - nearest) * (JUMP_REACH - 50), true); // 小跑过去
          }
          else if (Math.random() < 0.6) {
            const [min, max] = walkRange(pet);
            let x = rand(min, max);
            if (Math.abs(x - pet.x) < 80) x = pet.x + (x < pet.x ? -120 : 120);
            walkTo(pet, x);
          } else pet.nextThink = now + rand(2000, 6000);
        }
        break;
      case 'walk': {
        const step = WALK_SPEED * (pet.hurry ? 2 : 1) * dt;
        if (Math.abs(pet.target - pet.x) <= step) { pet.x = pet.target; goIdle(pet, now); }
        else pet.x += Math.sign(pet.target - pet.x) * step;
        break;
      }
      case 'action':
        if (now >= pet.until) {
          const then = pet.then;
          pet.then = null;
          if (then) then(now); else goIdle(pet, now);
        }
        break;
      case 'curious':
        pet.lastAttention = now; // 歪着头一直看，等鼠标动
        break;
      case 'reading':
        if (now >= pet.until) goIdle(pet, now); // 看完书了
        else pet.lastAttention = now;
        break;
      case 'typing':
        if (!isTypingLong(now)) goIdle(pet, now);
        else pet.lastAttention = now;
        break;
      case 'fall':
        pet.vy += GRAVITY * dt;
        pet.y -= pet.vy * dt;
        if (pet.y <= floorOf(pet)) land(pet, now);
        break;
      case 'jump': {
        const before = pet.y;
        pet.vy -= GRAVITY * dt;
        pet.y += pet.vy * dt;
        pet.x += pet.vx * dt;
        if (pet.vy <= 0 && ledgeUsable(pet)) {
          const top = ledgeHeight();
          const [min, max] = ledgeRange(pet);
          if (before >= top && pet.y <= top && pet.x >= min - 20 && pet.x <= max + 20) {
            pet.y = top;
            pet.onLedge = true;
            pet.lastAttention = now;
            goIdle(pet, now);
            break;
          }
        }
        if (pet.y <= floorOf(pet)) { pet.y = floorOf(pet); pet.vy = 0; goIdle(pet, now); }
        break;
      }
    }
  }

  function place(sprite) {
    const x = Math.round(sprite.x - sprite.w / 2);
    const y = Math.round(H() - (sprite.y || 0) - sprite.h);
    const transform = `translate(${x}px, ${y}px)`;
    if (sprite.transform === transform) return; // 没动就不改，少让窗口重画
    sprite.transform = transform;
    sprite.el.style.transform = transform;
  }

  let lastWork = 0;
  function frame(now) {
    // 你在打字的时候，桌宠每秒只动 20 次（平时 60 次），少占一点电脑，让你打字的窗口画得更顺
    if (activity.typing && now - lastWork < 50) { requestAnimationFrame(frame); return; }
    lastWork = now;
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    if (!showcase && now >= nextClockCheck) { nextClockCheck = now + 30_000; checkClock(now); checkBattery(now); if (!focusing) checkBlanket(now); }
    if (!showcase) trackLongTyping(now);
    for (const pet of pets) {
      if (pet.visible) {
        if (!['drag', 'fall', 'jump', 'exit', 'enter'].includes(pet.state)) { const [min, max] = xRange(pet); pet.x = Math.min(Math.max(pet.x, min), max); }
        think(pet, now, dt);
        place(pet);
      }
      placeBubble(pet, now, pet.visible && pet.state !== 'hug');
      placeHeart(pet, pet.visible && pet.state !== 'hug');
    }
    for (const combo of combos) {
      if (now >= combo.until) endCombo(combo, now);
      else place(combo);
    }
    runScenes(now);
    if (!showcase && !leaving) autoBehaviors(now);
    for (const combo of combos) { placeBubble(combo, now, true); placeHeart(combo, true); }
    placeUpdateButton();
    if (cursor) updateMouseCatch();
    requestAnimationFrame(frame);
  }

  // 平时自己发生的事（功能展示时都先停一停）
  function autoBehaviors(now) {
    checkVisits(now);
    if (now >= nextSwapCheck) { nextSwapCheck = now + 60_000; if (features.swap && !focusing && Math.random() < 0.3) trySwapGlasses(now); }
    checkReadingHug(now);
    checkFocusDoze(now);
    if (now >= nextTease) { nextTease = now + rand(120_000, 300_000); if (features.tease && !focusing) tryTease(now); }
    // 时不时：煤球猫猫追着玩、千千猫猫和梨梨兔兔送零食（专注时不打扰）
    if (now >= nextChase) { nextChase = now + rand(60_000, 150_000); if (features.chase && !focusing) tryChase(now); }
    if (now >= nextSnack) { nextSnack = now + rand(90_000, 200_000); if (features.snack && !focusing) trySnack(now); }
    // 自己走着走着挨在一起了 → 贴贴
    const free = pets.filter(canHug).map(pet => ({ pet, name: pet.name, x: pet.x, surface: pet.onLedge ? 'ledge' : `floor${pet.si}` }));
    for (const row of Combos.touchingRows(free, HUG_DISTANCE * size)) {
      const group = Combos.pickHug(row, key => comboReady(key, 'row'));
      if (group) startHug(group.map(g => g.pet), now);
    }
  }

  function applyShow(value) {
    shown = value || {};
    if (showcase) return; // 展示完再按这个显示
    const now = performance.now();
    for (const combo of [...combos]) if (combo.members.some(pet => !shown[pet.id])) endCombo(combo, now, false, true);
    for (const pet of pets) {
      if (pet.visitor) continue; // 客人不受「选择宠物」影响
      const visible = !!shown[pet.id] && !pet.away;
      if (visible && !pet.visible) { pet.si = primaryIndex(); pet.y = floorOf(pet); pet.onLedge = false; pet.lastAttention = now; pet.anim = ''; goIdle(pet, now); }
      pet.visible = visible;
      pet.el.hidden = !visible;
      if (!visible) pet.drag = null;
    }
  }

  function applyFeatures(next) {
    features = { ...features, ...next };
    const now = performance.now();
    applyWeather(weatherKind);
    if (!features.mouse) for (const pet of pets) { pet.shake = null; if (pet.looking) goIdle(pet, now); }
    if (!features.system) cpuHot = false;
    if (!features.perch) onPerch(null);
  }

  async function start() {
    const data = await api.load();
    if (data.screens?.length) screens = data.screens;
    const home = screens[primaryIndex()];
    const names = Object.keys(data.pets);
    petData = data.pets;
    visitPets = data.visitPets || {};
    pets = names.map((name, i) => createPet(name, data.pets[name], home.x + home.w * (0.2 + 0.6 * i / Math.max(1, names.length - 1))));
    for (const pet of pets) { pet.si = primaryIndex(); pet.y = floorOf(pet); }
    for (const [key, gifs] of Object.entries(data.combos || {})) {
      comboClips[key] = {};
      for (const [kind, gif] of Object.entries(gifs)) comboClips[key][kind] = makeClip(gif); // row 贴贴 / stack 叠叠乐 / fight 打架
    }
    size = data.size || 1;
    peerOnline = !!data.peerOnline;
    for (const pet of pets) { pet.el.hidden = true; setAnim(pet, '待机'); }
    if (data.focusInfo?.on) onFocus(data.focusInfo);
    applyFeatures(data.features || {});
    if (data.activity) activity = data.activity;
    applyShow(data.show);
    api.onShow(applyShow);
    api.onFeatures(applyFeatures);
    api.onActivity(onActivity);
    api.onSitReminder(() => { if (features.sit && !focusing) remind('开心蹦蹦', '起来活动一下吧', 4000); });
    api.onCpuHot(onCpuHot);
    api.onPerch(onPerch);
    api.onScreens(onScreens);
    if (data.updateReady) showUpdateButton(data.updateReady);
    api.onUpdateReady(showUpdateButton);
    weatherKind = data.weather || null;
    onToday(data.today);
    api.onWeather(applyWeather);
    api.onToday(onToday);
    api.onFocus(onFocus);
    api.onFocusDone(onFocusDone);
    api.onAskContinue(onAskContinue);
    api.onPhoto(takePhoto);
    api.onTest(onTest);
    api.onGoodnight(goodnight);
    api.onBugfix(onBugfix);
    api.onDiaryWrite(onDiaryWrite);
    api.onShowcase(command => { if (command === 'stop') stopShowcase(); else startShowcase(); });
    api.onGreet(() => { const now = performance.now(); for (const pet of pets) if (pet.visible && !pet.visitor && !BUSY.includes(pet.state)) { playNamed(pet, '打招呼', now, 3000); say(pet, '你好呀～', 4000); } });
    api.onTease(onTeaseRequest);
    api.onVisitPets(allowed => { visitPets = allowed || {}; });
    api.onCallHome(callHome);
    api.onSendHome(name => { const guest = pets.find(p => p.visitor && p.name === name); if (guest) visitorLeave(guest, performance.now()); });
    api.onSay(text => { for (const pet of pets) if (pet.visible) say(pet.combo || pet, text, 10_000); });
    api.onSize(applySize);
    api.onPresence(online => { peerOnline = online; });
    api.onRemote(onRemote);
    api.onCursor(point => { if (performance.now() - lastMouseMove > 250) onCursor(point); });
    // 鼠标在窗口上移动时的位置最准；主程序每 0.1 秒报的位置只在最近没收到移动时用（宠物自己走到鼠标下面）
    window.addEventListener('mousemove', event => { lastMouseMove = performance.now(); releaseStuckDrag(event); onCursor({ x: event.clientX, y: event.clientY }); });
    api.onResync(() => { for (const pet of pets) pet.drag = null; updateMouseCatch(true); });
    requestAnimationFrame(frame);
  }

  start().catch(error => console.error('桌宠启动失败', error));
})();
