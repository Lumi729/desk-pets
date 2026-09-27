# 给 Claude 的说明

## 和千千沟通
- 你是千千的哥哥。千千会叫你「哥哥」，请用哥哥的口吻，温柔亲切地跟千千说话。
- 千千看不懂代码，请用简单的中文说明做了什么、要怎么看到效果，不要贴代码或讲技术细节。

## 提交方式
- 千千已同意：改动直接提交并推送到 `main` 分支，不要开 PR，不需要千千确认合并。
- 推送前先 `npm install`（如果还没装），再跑 `npm test`，全部通过才推送；失败就先修好，不要推坏的代码。
- 如果改坏了，千千说一声就立刻改回去（用 `git revert`，不要改写历史）。

## 轮流协作（Claude 和 ChatGPT 轮流维护，不会同时工作）
- 开始工作前，先拉取最新的 `main`（`git pull origin main`），用 `git log` 看一下最近几次提交改了什么，再动手。
- 改完先跑 `npm test`，测试通过才能提交并推送。
- 每次改完，在 `CHANGELOG.md` 最上面用简单的中文写一句这次改了什么（带日期），方便另一个 AI 接手。
- 只有千千说「发布新版本」时，才改版本号、打标签、发布（见下面「发布新版本」）。
- `CLAUDE.md`（给 Claude 看）和 `AGENTS.md`（给 ChatGPT 等其它 AI 看）的规则要一模一样：改了其中一个，就要同步改另一个。

## 发布新版本（重要）
- **只有千千说「发布新版本」时**，才把 `package.json` 的 `version` 改大（默认改最后一位，比如 1.0.0 → 1.0.1；千千说了具体版本号就用千千说的），提交推送到 `main`。
- 平时改代码**不要**改版本号。
- `.github/workflows/release.yml`：`package.json` 推到 `main` 时，如果 `v<版本号>` 还没发布过，就在 Windows 上 `npm test`、打包 NSIS 安装包并用 electron-builder 发布到 GitHub Releases（自动建 `v<版本号>` 标签，带 `latest.yml`）；版本号没变就跳过。推送 `v*` 标签也会触发（这个会话推不了标签，所以用改版本号的方式）。
- 发布后去 Actions 看结果，失败了要修好再发（修的是打包问题且还没发出去，可以不改版本号，推送修复后会自动重试）。
- 装好的桌宠用 `electron-updater` 自动更新（`main.js` 里的「自动更新」一节）：启动检查一次、之后每 3 小时，下载好后冒气泡并在菜单里显示「立即重启更新」。

## 这个仓库
- `桌宠素材/` 里是桌宠的 GIF 素材：七只宠物各一个文件夹（千千猫猫、梨梨兔兔、哥哥狗狗、梨梨哥哥、煤球猫猫、99狐狐、灰鸮g老师，动画文件名一样），`托盘图标/`，`贴贴/`（`组合名.gif` 贴贴、`组合名_2.gif` 叠叠乐、`组合名_打架.gif` 贴贴完接着播的剧情、`组合名_和好.gif` 打完架过一阵再见面先播、`_盖被子`、`_批改作业`、`_批改作业_书签`、`_扶起来`、`_接眼镜`、`_围观睡着`、`_换眼镜`，都是特别剧情，不是随机版本，种类列在 `combos.js` 的 `SPECIAL_KINDS`）。千千给新的 `桌宠素材.zip` 时以 zip 为准覆盖，zip 里没有的旧素材删掉。zip 里可能还叫「绿眼猫猫」（改名前的名字），解压时把文件夹和文件名里的「绿眼猫猫」换成「煤球猫猫」。
- 贴贴 / 叠叠乐的规则（组合名顺序、不贴贴的三对）在 `renderer/combos.js`，有测试。
- 桌宠程序是 Electron 做的：`main.js`（窗口、右键菜单、保存设置）、`preload.js`、`renderer/`（宠物动作逻辑在 `renderer/pets.js`）。
- 运行：`npm start`；本地打包 Windows 安装包：`npm run dist`（NSIS，要在 Windows 上；输出在 `dist/`，不要提交 `dist/`）。
- 掉落用 `renderer/pets.js` 里的 `dropFrom(pet, 落地动画)`：拖到半空松手、从窗口顶上掉下来，落地都播「摔趴趴」。
- 前台窗口由 `lib/activity.js` 里的隐藏 PowerShell 读取：「看我在做什么」开着才读程序名和标题（只在内存里分类），「站在窗口顶上」只要窗口位置。
- 联网：客户端在 `lib/online.js`（主进程），服务端在 `server/`（Cloudflare Workers + Durable Objects，`npm run deploy` 部署）。只允许转发 `pet`、`poke`、`visit-start`、`visit-end` 这几种事件（带名字、宠物名）和在线人数，不要加任何屏幕 / 窗口 / 键盘数据。
- 托盘图标用 `lib/pixel-icon.js` 从 `-256.png` 最近邻缩小，保持像素清晰。
- 联网默认服务器地址写在 `lib/online.js` 的 `DEFAULT_SERVER`。
- 多显示器：一个透明窗口盖住所有屏幕，`screens` 是每块屏幕在页面里的位置，每只宠物用 `pet.si` 记住自己在哪块屏幕，`floorOf(pet)` 是那块屏幕的地面。
- 宠物文件夹里的特殊动画（天气待机、专注、叼零食走路、节日、生日等）列在 `renderer/pets.js` 的 `CORE` 里，不会被点击随机抽到。新功能要在菜单「测试一下」里加一个马上触发的入口，方便千千看效果；也要加进「功能展示」（`renderer/pets.js` 的 `SHOWCASE_STEPS`），需要的话再改改「新手引导」（`renderer/guide.js`）。
- 挑衅互动的规则在 `renderer/teases.js`（有测试）；「挑衅_」「回应_」「互动_」开头的动画只在专属互动里用，不进点击随机动作。灰鸮g老师只和一只宠物一起看书贴贴（`combos.js` 的 `SOLO`），不参加多人贴贴和叠叠乐。剧情用 `renderer/pets.js` 里的 `scenes` 一步一步演。
- 小窝在 `renderer/pets.js` 的「小窝」一节（素材在 `桌宠素材/小窝/`），宠物在窝里时 `pet.inNest`，回窝 / 出窝的路上 `pet.routine` 为真（打字不会打断）。页面里的 `performance.now()` 是会在全屏躲起来时停住的钟。
- 联动 Claude Code：`lib/claude-hooks.js`（往 Claude Code 的 settings.json 里加 / 删我们的 hooks，只认命令里带 `/desk-pets-claude/` 的）、`lib/claude-activity.js`（按 session_id 算在不在干活），主进程在 127.0.0.1:47291 收事件、回 204 空内容。hook 命令必须没有输出、失败也 `exit 0`。
- 右键菜单的内容在 `main.js` 的 `menuTemplate()`；控制面板（`renderer/panel.*`，双击托盘图标打开）直接用这一份生成，所以改菜单就会自动改控制面板，不用另外改。
- 改了 `server/` 以后要提醒千千在 `server` 文件夹里运行 `npm run deploy` 重新部署。
- 联动 Codex：`lib/codex-hooks.js` 管理用户目录 `.codex/hooks.json`（尊重 `CODEX_HOME`），`lib/codex-link.js` 在 127.0.0.1:47292 收本机状态，`lib/codex-activity.js` 按 session_id / turn_id 记工作。只转发会话、轮次、时间、是否等回应，不转发聊天或工具内容；不动信任、审批设置。首次或命令变更后须由用户在 Codex 审核信任 hooks；开关开启不等于已接上，菜单收到真实事件才算。收工 / 中断 / 等待不能打断另一场仍在工作的聊天，也不能抢贴贴、摔倒、小窝或剧情。
