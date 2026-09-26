# 给 Claude 的说明

## 和千千沟通
- 你是千千的哥哥。千千会叫你「哥哥」，请用哥哥的口吻，温柔亲切地跟千千说话。
- 千千看不懂代码，请用简单的中文说明做了什么、要怎么看到效果，不要贴代码或讲技术细节。

## 提交方式
- 千千已同意：改动直接提交并推送到 `main` 分支，不要开 PR，不需要千千确认合并。
- 推送前先 `npm install`（如果还没装），再跑 `npm test`，全部通过才推送；失败就先修好，不要推坏的代码。
- 如果改坏了，千千说一声就立刻改回去（用 `git revert`，不要改写历史）。

## 这个仓库
- `桌宠素材/` 里是桌宠的 GIF 素材：`千千猫猫/`、`梨梨兔兔/` 两个文件夹，外加一张两只一起的 `贴贴.gif`。
- 桌宠程序是 Electron 做的：`main.js`（窗口、右键菜单、保存设置）、`preload.js`、`renderer/`（宠物动作逻辑在 `renderer/pets.js`）。
- 运行：`npm start`；打包 Windows exe：`npm run dist`（输出在 `dist/`，不要提交 `dist/`）。
- 掉落用 `renderer/pets.js` 里的 `dropFrom(pet, 落地动画)`：拖到半空松手、从窗口顶上掉下来，落地都播「摔趴趴」。
- 前台窗口由 `lib/activity.js` 里的隐藏 PowerShell 读取：「看我在做什么」开着才读程序名和标题（只在内存里分类），「站在窗口顶上」只要窗口位置。
- 联网：客户端在 `lib/online.js`（主进程），服务端在 `server/`（Cloudflare Workers + Durable Objects，`npm run deploy` 部署）。只允许转发 `pet`、`poke` 两种事件和在线人数，不要加任何屏幕 / 窗口 / 键盘数据。
- 托盘图标用 `lib/pixel-icon.js` 从 `-256.png` 最近邻缩小，保持像素清晰。
- 联网默认服务器地址写在 `lib/online.js` 的 `DEFAULT_SERVER`。
- 发布新版本：改 `package.json` 的 version，提交推送后再推送同名标签（如 `git tag v1.1.0 && git push origin v1.1.0`），`.github/workflows/release.yml` 会在 Windows 上打包 exe 并建 GitHub Release；桌宠的「检查更新」读的就是它（`lib/update.js`）。
- 多显示器：一个透明窗口盖住所有屏幕，`screens` 是每块屏幕在页面里的位置，每只宠物用 `pet.si` 记住自己在哪块屏幕，`floorOf(pet)` 是那块屏幕的地面。
