// 贴贴 / 叠叠乐的规则（页面和测试都会用到）
(function (root) {
  // 文件名里宠物的顺序
  const ORDER = ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '绿眼猫猫', '灰鸮g老师'];
  // 只和一只宠物一起「看书贴贴」，不参加多人贴贴和叠叠乐
  const SOLO = ['灰鸮g老师'];
  // 这三对不贴贴也不叠叠乐（不能直接挨着、也不能直接叠在对方头上）
  const FORBIDDEN = [['梨梨哥哥', '千千猫猫'], ['梨梨兔兔', '哥哥狗狗'], ['梨梨哥哥', '绿眼猫猫']];

  const isForbidden = (a, b) => FORBIDDEN.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  // 组合名：按固定顺序用「-」连起来，比如 千千猫猫-梨梨兔兔
  const comboKey = names => [...names].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('-');

  // 左右挨在一起的一串：同一个地面上、按位置排好，相邻两只离得够近而且不是「不贴贴」的一对
  function touchingRows(pets, reach) {
    const surfaces = new Map();
    for (const pet of pets) {
      if (!surfaces.has(pet.surface)) surfaces.set(pet.surface, []);
      surfaces.get(pet.surface).push(pet);
    }
    const rows = [];
    for (const list of surfaces.values()) {
      list.sort((a, b) => a.x - b.x);
      let row = [list[0]];
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1], cur = list[i];
        if (cur.x - prev.x < reach && !isForbidden(prev.name, cur.name)) row.push(cur);
        else { if (row.length > 1) rows.push(row); row = [cur]; }
      }
      if (row.length > 1) rows.push(row);
    }
    return rows;
  }

  // 在一串里挑能贴贴的：先试整串，没有对应动画（或刚贴贴过）就试短一点的连续几只
  function pickHug(row, canUse) {
    for (let len = row.length; len >= 2; len--) {
      for (let start = 0; start + len <= row.length; start++) {
        const group = row.slice(start, start + len);
        if (canUse(comboKey(group.map(p => p.name)))) return group;
      }
    }
    return null;
  }

  // 叠叠乐：新来的这只能不能叠到这一摞（从下到上）的最上面
  function canStack(stackNames, newName, canUse) {
    if (stackNames.includes(newName)) return null;
    if ([...stackNames, newName].some(name => SOLO.includes(name))) return null;
    if (isForbidden(stackNames[stackNames.length - 1], newName)) return null;
    const key = comboKey([...stackNames, newName]);
    return canUse(key) ? key : null;
  }

  // 贴贴文件夹里的文件名 → 组合名和种类：「组合名.gif」贴贴，「组合名_2.gif」叠叠乐，
  // 「组合名_打架.gif」贴贴完的打架剧情，「组合名_和好.gif」打完架过一阵再见面时先和好，
  // 「组合名_盖被子.gif」哥哥狗狗给睡着的千千猫猫盖被子，「组合名_批改作业.gif」g老师看书时哥哥狗狗凑过来
  const SUFFIX_KINDS = { _2: 'stack', _打架: 'fight', _和好: 'makeup', _盖被子: 'blanket', _批改作业: 'grading' };
  // 这些是特别剧情，不是随机的贴贴版本
  const SPECIAL_KINDS = ['fight', 'makeup', 'blanket', 'grading'];
  function parseComboFile(base) {
    for (const [suffix, kind] of Object.entries(SUFFIX_KINDS)) {
      if (base.endsWith(suffix)) return { key: base.slice(0, -suffix.length), kind };
    }
    return { key: base, kind: 'row' };
  }

  const api = { SPECIAL_KINDS, ORDER, SOLO, FORBIDDEN, isForbidden, comboKey, touchingRows, pickHug, canStack, parseComboFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PetCombos = api;
})(this);
