// 「挑衅」互动的规则：谁挑衅谁、每个挑衅动画对应怎么回应（页面和测试都会用到）
(function (root) {
  // 回应里的步骤：
  //   '跺脚' 这样的字 → 被挑衅的播放「回应_跺脚」
  //   { chase: true }  → 被挑衅的加速追，挑衅的加速跑开，追一小会儿停下
  //   { hug: true }    → 被挑衅的走过去，两只贴贴
  //   { comfort: true } → 被挑衅的走过去播「回应_摸摸头」，挑衅的「开心蹦蹦」（露馅了），被挑衅的「回应_无语」
  const PAIRS = {
    千千猫猫: {
      target: '哥哥狗狗',
      replies: {
        做鬼脸: ['冒冷汗'],
        略略略: ['跺脚'],
        就这: ['委屈'],
        扭屁股: ['捂眼睛'],
        来打我呀: ['跺脚', { chase: true }],
        勾勾手指: [{ hug: true }],
      },
    },
    梨梨兔兔: {
      target: '梨梨哥哥',
      replies: {
        晃小鱼: ['跺脚', { chase: true }],
        装哭: ['冒冷汗', { comfort: true }],
        戳戳: ['委屈'],
        扔胡萝卜: ['被砸'],
        耳朵拍拍: ['捂眼睛'],
        吓你一跳: ['吓一跳'],
      },
    },
  };

  const WINDOW = 10 * 60_000; // 10 分钟
  const LIMIT = 3;            // 10 分钟内被挑衅超过 3 次就投降

  // 这一次挑衅要怎么回应。history 是之前被挑衅的时间（毫秒）
  function replyFor(teaser, tease, history, now) {
    const pair = PAIRS[teaser];
    if (!pair || !pair.replies[tease]) return null;
    const recent = history.filter(t => now - t < WINDOW);
    if (recent.length >= LIMIT) return ['投降'];
    return pair.replies[tease];
  }

  // 平时点宠物随机播放的动作里不要这些
  const isTeaseAnim = name => name.startsWith('挑衅_') || name.startsWith('回应_');

  const api = { PAIRS, WINDOW, LIMIT, replyFor, isTeaseAnim };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PetTeases = api;
})(this);
