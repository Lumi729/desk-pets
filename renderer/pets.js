// 桌宠的动作逻辑：待机、走路、拖动、点击动作、睡觉、贴贴。
(() => {
  const SCALE = 0.7;               // 宠物显示大小（GIF 原图 × 这个倍数）
  const WALK_SPEED = 70;           // 走路速度（像素/秒）
  const SLEEP_AFTER = 60_000;      // 多久没人理就睡觉（毫秒）
  const WAKE_DISTANCE = 160;       // 鼠标离多近会醒（像素）
  const HUG_DISTANCE = 120;        // 两只靠多近会贴贴（像素）
  const HUG_COOLDOWN = 30_000;     // 贴贴完多久内不再贴贴（毫秒）
  const MIN_PLAY = 2_000;          // 很短的动作至少播这么久（会重复几遍）
  const GRAVITY = 2_600;           // 拖到半空松手后掉下来的速度
  const CORE = ['待机', '向左走', '向右走', '睡觉'];

  const api = window.petApi;
  const stage = document.getElementById('stage');
  const hitCanvas = document.createElement('canvas');
  hitCanvas.width = hitCanvas.height = 5;
  const hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true });

  let pets = [];
  let hug = null;
  let show = 'both';
  let cursor = null;
  let ignoringMouse = true;
  let hugCooldownUntil = 0;
  let lastTime = performance.now();

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  function makeClip(gif) {
    return { blob: new Blob([gif.bytes], { type: 'image/gif' }), width: gif.width * SCALE, height: gif.height * SCALE, duration: gif.duration };
  }

  // 每次换动画都用新的地址，这样 GIF 一定从第一帧开始播。
  function playClip(sprite, clip) {
    if (sprite.url) URL.revokeObjectURL(sprite.url);
    sprite.url = URL.createObjectURL(clip.blob);
    sprite.img.src = sprite.url;
    sprite.w = clip.width;
    sprite.h = clip.height;
    sprite.el.style.width = `${clip.width}px`;
    sprite.el.style.height = `${clip.height}px`;
  }

  function makeSprite(className) {
    const el = document.createElement('div');
    el.className = className;
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    el.append(img);
    stage.append(el);
    return { el, img, url: '', w: 0, h: 0 };
  }

  function createPet(id, data, startX) {
    const clips = {};
    for (const [name, gif] of Object.entries(data.anims)) clips[name] = makeClip(gif);
    const pet = {
      id, name: data.name, clips,
      actions: Object.keys(clips).filter(name => !CORE.includes(name)),
      ...makeSprite('pet'),
      x: startX, y: 0, vy: 0,
      state: 'idle', anim: '', until: 0, nextThink: performance.now() + rand(1500, 4000),
      target: startX, lastAttention: performance.now(), visible: false, drag: null,
    };
    pet.el.title = data.name;
    pet.el.addEventListener('pointerdown', event => onPointerDown(pet, event));
    pet.el.addEventListener('pointermove', event => onPointerMove(pet, event));
    pet.el.addEventListener('pointerup', event => onPointerUp(pet, event));
    pet.el.addEventListener('pointercancel', event => onPointerUp(pet, event));
    return pet;
  }

  function setAnim(pet, name) {
    const clip = pet.clips[name] || pet.clips['待机'];
    const key = pet.clips[name] ? name : '待机';
    if (pet.anim === key) return clip;
    pet.anim = key;
    pet.el.dataset.anim = key;
    playClip(pet, clip);
    return clip;
  }

  function goIdle(pet, now) {
    pet.state = 'idle';
    pet.nextThink = now + rand(2000, 6000);
    setAnim(pet, '待机');
  }

  function walkTo(pet, x) {
    const half = pet.w / 2;
    pet.target = Math.min(Math.max(x, half), W() - half);
    pet.state = 'walk';
    setAnim(pet, pet.target < pet.x ? '向左走' : '向右走');
  }

  function playAction(pet, now) {
    if (!pet.actions.length) return goIdle(pet, now);
    const name = pet.actions.length > 1 ? pick(pet.actions.filter(a => a !== pet.anim)) : pet.actions[0];
    pet.anim = '';
    const clip = setAnim(pet, name);
    pet.state = 'action';
    pet.until = now + clip.duration * Math.max(1, Math.ceil(MIN_PLAY / clip.duration));
  }

  function wake(pet, now) {
    pet.lastAttention = now;
    if (pet.state === 'sleep') goIdle(pet, now);
  }

  // ---- 鼠标：拖动 / 点击 / 右键 ----
  function onPointerDown(pet, event) {
    if (event.button !== 0 || pet.state === 'hug') return;
    event.preventDefault();
    pet.el.setPointerCapture(event.pointerId);
    const rect = pet.el.getBoundingClientRect();
    pet.drag = { startX: event.clientX, startY: event.clientY, dx: event.clientX - (rect.left + rect.width / 2), dy: rect.bottom - event.clientY, moved: false };
    wake(pet, performance.now());
  }

  function onPointerMove(pet, event) {
    const drag = pet.drag;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      pet.state = 'drag';
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
      if (pet.y > 0) { pet.state = 'fall'; } else goIdle(pet, now);
    } else if (event.type === 'pointerup') {
      playAction(pet, now);
    }
  }

  window.addEventListener('contextmenu', event => { event.preventDefault(); api.showMenu(); });

  // 鼠标在宠物身上（不透明的地方）时才接住点击，其他地方点击会穿透到桌面。
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

  function updateMouseCatch() {
    const dragging = pets.some(pet => pet.drag);
    const over = cursor && petUnder(cursor.x, cursor.y);
    const ignore = !dragging && !over;
    if (ignore !== ignoringMouse) {
      ignoringMouse = ignore;
      api.setIgnoreMouse(ignore);
    }
  }

  function onCursor(point) {
    cursor = point;
    const now = performance.now();
    for (const pet of pets) {
      if (!pet.visible) continue;
      const cx = pet.x, cy = H() - pet.y - pet.h / 2;
      if (Math.hypot(point.x - cx, point.y - cy) < WAKE_DISTANCE) wake(pet, now);
    }
    updateMouseCatch();
  }

  // ---- 贴贴 ----
  function canHug(pet) {
    return pet.visible && (pet.state === 'idle' || pet.state === 'walk') && pet.y === 0;
  }

  function startHug(a, b, now) {
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    const mid = (a.x + b.x) / 2;
    for (const pet of [a, b]) { pet.state = 'hug'; pet.el.hidden = true; }
    hug.visible = true;
    hug.x = Math.min(Math.max(mid, hug.w / 2), W() - hug.w / 2);
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
  function think(pet, now, dt) {
    switch (pet.state) {
      case 'idle':
        if (now - pet.lastAttention > SLEEP_AFTER) { pet.state = 'sleep'; setAnim(pet, '睡觉'); break; }
        if (now >= pet.nextThink) {
          if (Math.random() < 0.6) {
            let x = rand(pet.w / 2, W() - pet.w / 2);
            if (Math.abs(x - pet.x) < 80) x = pet.x + (x < pet.x ? -120 : 120);
            walkTo(pet, x);
          } else pet.nextThink = now + rand(2000, 6000);
        }
        break;
      case 'walk': {
        const step = WALK_SPEED * dt;
        if (Math.abs(pet.target - pet.x) <= step) { pet.x = pet.target; goIdle(pet, now); }
        else pet.x += Math.sign(pet.target - pet.x) * step;
        break;
      }
      case 'action':
        if (now >= pet.until) goIdle(pet, now);
        break;
      case 'fall':
        pet.vy += GRAVITY * dt;
        pet.y -= pet.vy * dt;
        if (pet.y <= 0) { pet.y = 0; pet.vy = 0; goIdle(pet, now); }
        break;
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
    for (const pet of pets) {
      if (!pet.visible) continue;
      if (pet.state !== 'drag' && pet.state !== 'fall') pet.x = Math.min(Math.max(pet.x, pet.w / 2), W() - pet.w / 2);
      think(pet, now, dt);
      place(pet);
    }
    if (hug.pair) {
      if (now >= hug.until) endHug(now);
      else place(hug);
    } else if (pets.length === 2 && now >= hugCooldownUntil && canHug(pets[0]) && canHug(pets[1]) && Math.abs(pets[0].x - pets[1].x) < HUG_DISTANCE) {
      startHug(pets[0], pets[1], now);
      place(hug);
    }
    if (cursor) updateMouseCatch();
    requestAnimationFrame(frame);
  }

  function applyShow(value) {
    show = value;
    const now = performance.now();
    if (hug.pair) endHug(now);
    for (const pet of pets) {
      const visible = show === 'both' || show === pet.id;
      if (visible && !pet.visible) { pet.y = 0; pet.lastAttention = now; pet.anim = ''; goIdle(pet, now); }
      pet.visible = visible;
      pet.el.hidden = !visible;
      if (!visible) pet.drag = null;
    }
  }

  async function start() {
    const data = await api.load();
    pets = [createPet('cat', data.pets.cat, W() * 0.4), createPet('bunny', data.pets.bunny, W() * 0.6)];
    hug = { ...makeSprite('pet hug'), clip: makeClip(data.hug), x: 0, y: 0, pair: null, until: 0, visible: false };
    hug.w = hug.clip.width;
    hug.h = hug.clip.height;
    hug.el.hidden = true;
    for (const pet of pets) { pet.el.hidden = true; setAnim(pet, '待机'); }
    applyShow(data.show);
    api.onShow(applyShow);
    api.onCursor(onCursor);
    window.addEventListener('mousemove', event => onCursor({ x: event.clientX, y: event.clientY }));
    requestAnimationFrame(frame);
  }

  start().catch(error => console.error('桌宠启动失败', error));
})();
