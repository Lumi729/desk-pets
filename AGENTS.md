# 给 AI 助手的说明（和 CLAUDE.md 的规则完全一样）

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
- 百变猫猫（`main.js` 的 `CAT` / `CATS`，`renderer/pets.js` 的「百变猫猫」一节）：一只宠物带五套动作 `pet.skins`，`wearSkin()` 换一套，同时把 `comboClips` 里带「百变猫猫」的组合换成 `贴贴/百变猫猫_猫名/` 里那只的；一起玩的动画在 `百变猫猫/互动/`（`pet.groupClips`）。变身、一起玩期间 `pet.catBusy` 为真，点击和打字不打断。现在是哪只通过 `cat-skin` 告诉主程序（托盘图标、提示、菜单），锁定存在 `settings.catLock`。
- 沙漠狐：小爱好在 `FENNEC_HOBBIES`，和 99狐狐 的 `_比尾巴`（tails）/ `_尾巴被子`（tailquilt）在 `tryFoxStory()`。

## macOS 适配
- Mac 测试版：`npm run dist:mac` 生成 arm64 / x64 DMG，图标在 `build/mac-icon.png`；只有临时签名，未做 Developer ID 签名与公证，禁用自动安装更新，菜单打开发布页手动下载。不要声称已经公证或已经在两种芯片实机验证。
- Mac 由 `native/mac-foreground.swift` 只读辅助功能接口取前台窗口，授权只能由用户完成；`npm run build:mac-helper` 编译通用架构组件。只在活动分类开启时取标题，不能截屏、读按键、保存或上传标题。
- Mac 多屏：`lib/mac-displays.js` 创建每屏显示窗口，隐藏透明主窗口唯一运行宠物逻辑；`renderer/mirror-host.js` 发送安全的场景节点与图片，各 `mirror.js` 只显示和回传坐标，禁止重复运行宠物 AI / 日记 / 联网。原生组件与真实双屏拖动仍需实机验证。
- Codex 的 macOS hook 在 `lib/codex-posix.js`，只发白名单状态，使用应用自带 Electron 的 Node 模式；不得改用户审批和信任。Claude 使用系统 curl，安静退出。Windows 命令保留。
- `.github/workflows/mac-build.yml` 在 Mac 上测试、启动真实窗口、构建两种 DMG，供发布流程复用；版本不变只留下 Actions 测试附件。下次新版本发布要等两种 DMG 和 Windows 安装包都成功才公开。

## 安卓尝鲜版
- 独立原生工程在 `android/`，安装与构建说明见 `android/README.md`；APK 测试附件由 `.github/workflows/android-build.yml` 生成；用户明确要求发布安卓版本时，只递增 `android/app/build.gradle` 的 versionCode/versionName，并更新 `android/RELEASE_NOTES.md` 与署名日志。工作流检查通过后以独立 `android-v<版本号>` 预发布 APK，版本不变保留已有发布，不改电脑版版本号、标签或 latest。
- 素材由 `android/scripts/prepare-assets.cjs` 从电脑版抽取；配对继续复用 `renderer/combos.js`，不要绕过禁配规则。最多三只悬浮宠物，支持摸摸、拖动落地、双击跳跃、双人贴贴。
- 应用联动：`UsageCompanion.java` 在用户开启开关并授权使用情况访问后查询前台应用；`AppCompanion.java` 负责分类和用户自定义动作。视频/音乐应用分别看视频、跳舞，全手机陪打字由界面互动确认实际输入变化，不依赖应用名单，输入优先于视频/音乐动作，显式设置不联动的应用除外；浏览器不再需要逐个指定，不宣称识别到了实际播放。
- 只在本机判断应用；不读取或上传文字、按键内容、网址、截图，不保存识别历史。收起、熄屏或关掉联动后停止查询；进入授权设置前先收起桌宠，避免挡住系统权限开关。
- 摸摸、拖动、落地、贴贴优先于联动；新增动作要加手机端「测试动作 / 功能展示」。`InterfaceCompanion.java` 是用户单独授权的可选无障碍服务：仅在宠物可见、屏幕解锁及开关开启时取窗口/控件边界与输入变化，不调用文字/描述 getter，不过滤按键、不截图、不执行点击或手势。`Perch.java` 负责落脚点几何与输入超时；PetService 把键盘顶边作为地面，并按通用控件与滚动内容边界逐级跳跃，不限 QQ；SurfaceRules.java 仅用角色、资源 ID 与几何筛选按钮/输入框、消息内容、图片/卡片，排除头像、居中短标签与整页容器。关闭功能或台阶失效要取消旧落脚点，读不到不能假装成功。各应用版本与输入法必须真机验证，演示台阶不代表真实识别。
- 验证：仓库 `npm test`，`android/tests/AppCompanionTest.java` 的独立 Java 测试（同时编译 AppCompanion.java、Perch.java 与 SurfaceRules.java），以及 Gradle `:app:assembleDebug :app:lintDebug`。编译成功不等于真机验证，悬浮权限、后台限制和应用识别需手机实测。
- 后续发布 APK 使用 GitHub Actions Secrets 中的固定签名；覆盖安装须保持同一签名，不提交签名私钥，不更换已有密钥。0.1/0.2 为临时调试签名，首次迁移可能需要重装。

- 安卓 0.4-preview 功能：Perch.canWalk 让窄台阶静止等待，反向须检查前进方向。ShakeCompanion 仅在开关开启、宠物可见且解锁时注册加速度传感器；DeliveryCompanion 需独立通知授权和开关，外卖开关只允许白名单外卖应用临时匹配正文；另外只显示用户显式选择的应用通知标题，均不保存上传。新功能必须默认关闭；测试菜单中演示通知不代表真实订单状态。Java 回归需同时编译 DeliveryRules.java。

- 安卓逐层掉落用 Perch.catchFall 接住脚下最近的下层平台，跳落起点不能再次接住自身。IslandMedia 通过已授权的媒体会话显示标题与控制播放；本地计时仅在服务运行时检查，不声称系统精确闹钟。音乐/通知、充电与计时属于可选提示条能力，不宣称完整系统灵动岛或电话接听。

- 安卓摇晃 / 灵动岛新素材（Claude，2026-10-06）：`prepare-assets.cjs` 打包「摇晃」「吐彩虹」「灵动岛」三个动作和 `桌宠素材/灵动岛/` 的左 / 中 / 右三段像素图（`catalog.json` 的 `island`）。弹力球飞动期间播摇晃，落地后 `spitRainbow` 播一遍吐彩虹再回待机（彩虹画在 GIF 里，PetView 不再程序画彩虹）。提示条背景是 `IslandBackground`：左右两段不拉伸、中间平铺、最近邻整像素放大（尺寸在 `IslandHang`，有 Java 测试），文字只在中间段。外卖 / 选中应用通知 / 演示出现在提示条上时，`updateHanger` 让 `islandPet`（默认第一只出来的）跑到下方跳上去挂着播灵动岛，GIF 顶边压住提示条底边一格；提示条消失或换成别的内容用 `startFall` 落回地面，拖动、双击会取消这次挂着。「通知时伙伴挂在提示条下面」开关默认关闭，只有演示不看开关。电脑版把这三个动作放进 `CORE`，不随机播。Java 回归需同时编译 IslandHang.java。
- 安卓检查更新（Claude，2026-10-06）：`UpdateChecker` 只读本仓库 Releases 里 `android-v*` 的 APK（`UpdateRules` 比较版本、限制下载地址，有 Java 测试），系统下载器下载后打开系统安装界面，由用户确认；「自动检查更新」默认关闭，最多 12 小时一次。这是安卓版唯一联网处，需要 INTERNET / REQUEST_INSTALL_PACKAGES 权限。没有「摸摸头」的宠物由 `prepare-assets.cjs` 的 `FALLBACKS` 用「害羞」代替。Java 回归需同时编译 UpdateRules.java。
- 安卓点提示条（Claude，2026-10-07）：显示通知时点击用 `DeliveryCompanion` 内存里的 contentIntent 打开（Android 14+ 带允许后台启动的选项，失败就打开该应用），长按才是灵动面板；三处通知都 setColor(0xFFEFA7C0) 和 setLargeIcon(ic_qianqian_large)。
