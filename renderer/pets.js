// 桌宠的动作逻辑：待机、走路、拖动、点击动作、睡觉、贴贴、提醒气泡、鼠标互动、看你在做什么。
(() => {
  const SCALE = 0.7;               // 「100%」时宠物的大小（GIF 原图 × 这个倍数）
  const WALK_SPEED = 70;           // 走路速度（像素/秒）
  const SLEEP_AFTER = 60_000;      // 多久没人理就睡觉（毫秒）
  const WAKE_DISTANCE = 160;       // 鼠标离多近会醒（像素）
  const LOOK_DISTANCE = 220;       // 鼠标离多近会转头看（像素）
  const HUG_DISTANCE = 120;        // 两只靠多近会贴贴（像素）
  const HUG_COOLDOWN = 30_000;     // 贴贴完多久内不再贴贴（毫秒）
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
  const CORE = ['待机', '向左走', '向右走', '睡觉', '向左看', '向右看', '掉落', '摔趴趴', '冒冷汗'];
  const ACTIVITY_ANIM = { code: '敲代码', video: '看视频', music: '跳舞' };

  const api = window.petApi;
  const stage = document.getElementById('stage');
  const hitCanvas = document.createElement('canvas');
  hitCanvas.width = hitCanvas.height = 5;
  const hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true });

  let pets = [];
  let hug = null;
  let show = 'both';
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
  let hugCooldownUntil = 0;
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
      actions: Object.keys(clips).filter(name => !CORE.includes(name)),
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

  function goIdle(pet, now) {
    pet.state = 'idle';
    pet.looking = false;
    // 地上有能站的窗口时想得快一点，马上过去
    pet.nextThink = now + (wantsLedge(pet) ? rand(300, 900) : rand(2000, 6000));
    setAnim(pet, '待机');
  }

  function walkTo(pet, x, hurry = false) {
    pet.hurry = hurry;
    const [min, max] = walkRange(pet);
    pet.target = Math.min(Math.max(x, min), max);
    pet.state = 'walk';
    setAnim(pet, pet.target < pet.x ? '向左走' : '向右走');
  }

  function playNamed(pet, name, now, minPlay = MIN_PLAY) {
    const clip = setAnim(pet, name, true);
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
    let told = false;
    for (const pet of pets) {
      if (!pet.visible) continue;
      if (pet.state === 'hug') { if (!told) say(hug, text, 8000); told = true; continue; }
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
      if (now - lastNightNag >= NIGHT_EVERY) { lastNightNag = now; remind('睡觉', '该睡觉啦', 6000); }
    } else {
      lastNightNag = -Infinity;
    }
    MEALS.forEach(([from, to], i) => {
      const key = `${date.toDateString()}-${i}`;
      if (minutes >= from && minutes <= to && !mealsDone.has(key)) { mealsDone.add(key); remind('吃饭', '该吃饭啦', 4000); }
    });
  }

  // ---- 鼠标：拖动 / 点击 / 右键 ----
  function onPointerDown(pet, event) {
    if (event.button !== 0) return;
    if (pet.state === 'hug') { pet.el.hidden = !pet.visible; goIdle(pet, performance.now()); } // 万一卡在贴贴里，点一下就恢复
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
      pet.si = screenAt(pet.x, H() - pet.y - pet.h / 2); // 松手时在哪块屏幕上，就落到那块屏幕的底部
      if (pet.y < floorOf(pet)) pet.y = floorOf(pet);
      if (pet.y > floorOf(pet)) dropFrom(pet); else goIdle(pet, now);
    } else if (event.type === 'pointerup') {
      playRandomAction(pet, now);
      api.touched();
    }
  }

  window.addEventListener('contextmenu', event => { event.preventDefault(); api.showMenu(); });

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

  let lastMouseSync = 0;
  function updateMouseCatch(force = false) {
    const dragging = pets.some(pet => pet.drag);
    // 已经接住鼠标时，只要还在宠物的方框里就一直接着，不会因为动画换帧、透明的缝一下子漏掉点击
    const over = cursor && (petUnder(cursor.x, cursor.y) || (!ignoringMouse && petBoxUnder(cursor.x, cursor.y)));
    const ignore = !dragging && !over;
    const now = performance.now();
    // 状态变了就告诉主程序；没变也每 3 秒再说一次（拖动时不打扰），万一哪里没对上能自己恢复
    if (force || ignore !== ignoringMouse || (!dragging && now - lastMouseSync > 3000)) {
      ignoringMouse = ignore;
      lastMouseSync = now;
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
    }
  }

  // 鼠标靠近 → 转头看鼠标
  // 鼠标靠近 → 发呆的宠物转头看鼠标。只是换个眼神，不打断任何事：
  // 它照样会去走路、睡觉、做动作、敲代码、跳上窗口，走路时也不会停下来看
  function lookAtMouse(pet, point, distance) {
    const near = features.mouse && pet.state === 'idle' && distance < LOOK_DISTANCE;
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
      if (pet.state === 'idle') setAnim(pet, '待机');
    }
  }


  function onCursor(point) {
    cursor = point;
    const now = performance.now();
    for (const pet of pets) {
      if (!pet.visible) continue;
      const distance = Math.hypot(point.x - pet.x, point.y - (H() - pet.y - pet.h / 2));
      if (distance < WAKE_DISTANCE) wake(pet, now);
      lookAtMouse(pet, point, distance);
      if (features.mouse) trackShake(pet, point, now);
    }
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
    if (pet.fallFrom >= SPLAT_HEIGHT) playNamed(pet, pet.landAnim, now, 0); // 播一遍，播完回待机
    else goIdle(pet, now);
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
      if (now - lastBatteryNag >= LOW_BATTERY_EVERY) { lastBatteryNag = now; remind('睡觉', '我也没电了……', 6000); }
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

  // ---- 大小 ----
  function applySize(next) {
    size = next;
    for (const sprite of [...pets, hug]) {
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

  // ---- 贴贴 ----
  function canHug(pet) {
    return pet.visible && (pet.state === 'idle' || pet.state === 'walk') && onFloor(pet);
  }

  function startHug(a, b, now) {
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    const mid = (a.x + b.x) / 2;
    for (const pet of [a, b]) { pet.state = 'hug'; pet.el.hidden = true; }
    hug.visible = true;
    const s = screenOf(left);
    hug.x = Math.min(Math.max(mid, s.x + hug.w / 2), s.x + s.w - hug.w / 2);
    hug.y = floorOf(left);
    hug.el.hidden = false;
    playClip(hug, hug.clip);
    hug.pair = [left, right];
    hug.until = now + hug.clip.duration * Math.max(1, Math.ceil(3000 / hug.clip.duration));
  }

  function endHug(now) {
    if (!hug.pair) return;
    const [left, right] = hug.pair;
    hug.pair = null;
    hug.visible = false;
    hug.el.hidden = true;
    hugCooldownUntil = now + HUG_COOLDOWN;
    const gap = hug.w / 4;
    left.x = hug.x - gap;
    right.x = hug.x + gap;
    for (const pet of [left, right]) {
      pet.anim = '';
      pet.lastAttention = now;
      pet.el.hidden = !pet.visible;
      goIdle(pet, now);
    }
    if (left.visible) walkTo(left, left.x - rand(150, 300));
    if (right.visible) walkTo(right, right.x + rand(150, 300));
  }

  // ---- 每一帧 ----
  // 在发呆（包括正在看鼠标）、走路、睡觉时一打字就陪你敲代码
  const CAN_START_TYPING = ['idle', 'walk', 'sleep'];

  function think(pet, now, dt) {
    if (CAN_START_TYPING.includes(pet.state) && isTypingLong(now)) {
      pet.state = 'typing';
      pet.lastAttention = now;
      setAnim(pet, '敲代码');
      return;
    }
    switch (pet.state) {
      case 'idle':
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
        if (now >= pet.until) goIdle(pet, now);
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
    sprite.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    if (now >= nextClockCheck) { nextClockCheck = now + 30_000; checkClock(now); checkBattery(now); }
    for (const pet of pets) {
      if (pet.visible) {
        if (pet.state !== 'drag' && pet.state !== 'fall' && pet.state !== 'jump') { const [min, max] = xRange(pet); pet.x = Math.min(Math.max(pet.x, min), max); }
        think(pet, now, dt);
        place(pet);
      }
      placeBubble(pet, now, pet.visible && pet.state !== 'hug');
      placeHeart(pet, pet.visible && pet.state !== 'hug');
    }
    if (hug.pair) {
      if (now >= hug.until) endHug(now);
      else place(hug);
    } else if (pets.length === 2 && now >= hugCooldownUntil && canHug(pets[0]) && canHug(pets[1]) && pets[0].si === pets[1].si && Math.abs(pets[0].x - pets[1].x) < HUG_DISTANCE) {
      startHug(pets[0], pets[1], now);
      place(hug);
    }
    placeBubble(hug, now, hug.visible);
    placeHeart(hug, hug.visible);
    if (cursor) updateMouseCatch();
    requestAnimationFrame(frame);
  }

  function applyShow(value) {
    show = value;
    const now = performance.now();
    if (hug.pair) endHug(now);
    for (const pet of pets) {
      const visible = show === 'both' || show === pet.id;
      if (visible && !pet.visible) { pet.si = primaryIndex(); pet.y = floorOf(pet); pet.onLedge = false; pet.lastAttention = now; pet.anim = ''; goIdle(pet, now); }
      pet.visible = visible;
      pet.el.hidden = !visible;
      if (!visible) pet.drag = null;
    }
  }

  function applyFeatures(next) {
    features = { ...features, ...next };
    const now = performance.now();
    if (!features.mouse) for (const pet of pets) { pet.shake = null; if (pet.looking) goIdle(pet, now); }
    if (!features.system) cpuHot = false;
    if (!features.perch) onPerch(null);
  }

  async function start() {
    const data = await api.load();
    if (data.screens?.length) screens = data.screens;
    const home = screens[primaryIndex()];
    pets = [createPet('cat', data.pets.cat, home.x + home.w * 0.4), createPet('bunny', data.pets.bunny, home.x + home.w * 0.6)];
    for (const pet of pets) { pet.si = primaryIndex(); pet.y = floorOf(pet); }
    hug = { ...makeSprite('pet hug'), clip: makeClip(data.hug), x: 0, y: 0, pair: null, until: 0, visible: false };
    size = data.size || 1;
    fitSize(hug);
    peerOnline = !!data.peerOnline;
    hug.el.hidden = true;
    for (const pet of pets) { pet.el.hidden = true; setAnim(pet, '待机'); }
    applyFeatures(data.features || {});
    if (data.activity) activity = data.activity;
    applyShow(data.show);
    api.onShow(applyShow);
    api.onFeatures(applyFeatures);
    api.onActivity(onActivity);
    api.onSitReminder(() => { if (features.sit) remind('开心蹦蹦', '起来活动一下吧', 4000); });
    api.onCpuHot(onCpuHot);
    api.onPerch(onPerch);
    api.onScreens(onScreens);
    api.onSay(text => { for (const pet of pets) if (pet.visible) say(pet.state === 'hug' ? hug : pet, text, 10_000); });
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
