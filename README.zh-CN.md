# dsh-appearance-glass

[English](README.md) ｜ **简体中文** ｜ [繁體中文](README.zh-TW.md)

DSH 界面透明度插件，外加内置壁纸。
只有纯 alpha，**没有任何模糊、饱和或高光**（1.1 起移除了「模式」与液态玻璃）。

![插件图标](icon.svg)

| | |
| --- | --- |
| 设置位置 | **设置 → 界面外观**（独立的 `settings.section` 页面，排在「通用设置」之后、「模型」之前） |
| 同一份面板 | **设置 → 插件 → dsh-appearance-glass**（`plugins.bundle.config`） |
| 写到哪里 | profile 的 `cordis.patch.yml`（`config:` 段），**改完立即生效、不需要重启** |
| 不影响 | DSH 任何源码；卸载后整层效果完全撤除 |

## 你能得到什么

- **四个区域各自可调的不透明度** —— 主界面／侧栏／卡片与输入框／菜单与浮层。
  滑杆上的数值是**合成后**的结果：写 20% 就真的看到 20%（算法见下）。
- **内置壁纸** —— 三个色块、底色、强度、五组配色，外加实时预览；
  预览的每个 mock 表面都吃官方 token，叠层数与真实界面一致。
- **一个总开关** —— 关掉「启用」就能立刻对比，不需要卸载。

![界面外观设置页](preview/wallpaper-after.jpg)

## 安装

```sh
dsh plugin --profile web add dsh-appearance-glass          # 从 npm 安装
dsh plugin --profile web add github:david0304git/dsh-appearance-glass   # 从 GitHub 安装
```

需要 `dsh >= 0.2.0`（`engines.dsh`），实测版本 0.2.1-rc.2。
唯一的 peer 依赖是 `@deepseek-ai/schemastery`（由宿主提供，标记为 `optional`），不需要另外安装。

### 在插件市场里找到它

- **官方 Discover**：`plugin_market` 读的是**你自己添加的索引 URL**（DSH 默认不加任何索引）。两个现成的：
  - `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` —— awesome-dsh-plugin 清单的 format-1 索引
  - `https://awesome-dsh-plugin.com/index.json`
- **dsh-market**（`dshmarket`）：只安装 awesome-dsh-plugin 清单里的插件，所以本插件要先被收录。

## 设置页结构

1. **标题栏** —— 标题、`本 profile 已自定义` 徽章、写入状态、**启用**（官方 `Switch`）、**恢复默认**
2. **界面不透明度** —— 四根滑杆（主界面／侧栏／卡片与输入框／菜单与浮层）＋ **同步** 按钮（把主界面的值一次应用到其他三项）
3. **透视背景** —— 自动／内置壁纸／纯透明
4. **内置壁纸** —— 实时预览，然后四列对齐的控件：**色块**（三颗颜色 pill）、**底色**（颜色 pill ＋ 跟随深浅色）、**强度**（滑杆 pill）、**配色**（五张 44px 渐变卡，命中时外圈一圈 focus 蓝）

## 参数

| 字段 | 范围 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | 布尔 | `true` | 总开关；`false` 时不动任何 token |
| `opacityBase` | 0–100 % | 68 | 主界面（对话区底色实际被叠了两层，见下节） |
| `opacitySidebar` | 0–100 % | 68 | 侧栏与其选中态（官方在栏上另加一层 40% 底色） |
| `opacitySurface` | 0–100 % | 68 | 卡片、输入框、消息气泡、代码块 |
| `opacityOverlay` | 0–100 % | 72 | 菜单、tooltip、toast、浮层 |
| `backdrop` | `auto` / `wallpaper` / `none` | `auto` | `auto`＝桌面版用系统窗口材质，其他环境铺壁纸 |
| `wallpaperA/B/C` | `#rrggbb` 或 `auto` | `auto` | 三颗色块；`auto` 跟随深浅色 |
| `wallpaperBase` | `#rrggbb` 或 `auto` | `auto` | 底色；`auto`＝浅色 `#e9f0ff`／深色 `#0b0f1c` |
| `wallpaperStrength` | 10–100 | 58 | 色块强度（第二、三颗自动比第一颗弱） |

## 为什么滑杆数值就是合成后的透明度

同一块底色常被叠好几层：macOS 下官方的 `.centerCol` 与对话区 root **各画一次** `--dsw-alias-bg-base`。
直接把 token 设成 68%，实际看到的是 `1-(1-0.68)² = 89.8%` —— 这就是「调到最低还是看不透」的原因。

所以插件用真实层数反推单层值（`a = 1-(1-target)^(1/depth)`）：

| 区域 | 真实叠层 | 滑杆 20% 时写入 | 实际合成 |
| --- | --- | --- | --- |
| 主界面 | 2 | 11% | 20.0% |
| 侧栏 | ~1.4 | 13% | ~20% |
| 卡片／输入框 | 1 | 20% | 20.0% |
| 菜单／浮层 | 1 | 20% | 20.0% |

同一区内的相对加权（delta）也会跟着目标值等比缩小，低透明度时不会被拉回去。

## 为什么 macOS 上是「真的透」

DSH 桌面版主窗口以 `vibrancy: 'sidebar'` + `backgroundColor: '#00000000'` 创建，官方 CSS 在
`html[data-platform=darwin]` 下把 html/body 背景设成 transparent。**桌面材质一直都在，只是被各面板的
不透明背景盖住**；本插件把那些表面的 token 换成半透明色，原生材质就透出来 —— 不是 CSS 假装的效果。

> 系统窗口材质本身的模糊**关不掉**：那是 Electron 主进程的窗口属性，renderer 端没有任何 IPC 能改
> （`DESKTOP_IPC` 只有主题色与 Windows 标题栏上色）。想要完全零模糊，请用浏览器打开 DSH。

## 实现方式

- 主要手段是 **theme token 覆写**（`ctx.theme.overrideTokens`）：官方组件自己消费 `--dsw-*`，
  所以不依赖任何 hash 过的 class 名。
- 只有壁纸会碰 `<html>`（`background-image`）。插件**不对任何容器加 `backdrop-filter`** ——
  容器一旦有它，就会成为 `position: fixed` 子元素的 containing block，而 DSH 的菜单用
  CSS anchor positioning 就地渲染，会有定位风险。
- UI 全部由官方元件组成（selector pill 36px、`--dsw-radius-md`、`--dsw-alias-bg-module-platform`），
  菜单用官方 `Menu`、开关用官方 `Switch`；取不到时退化成原生 `<select>`／文字按钮。
- 全部 fail-open：找不到 theme/slots/locale/configForms 就不注册、什么都不改。

## 测试

```sh
npm test        # node test/run.mjs —— host 7 + client 33 + token 4
```

`test/tokens.test.mjs` 会读取本机安装的 DSH `app.asar`，把官方 token 表抽出来，逐一核对本插件覆写的
每一个 token —— DSH 升级后 token 改名会立刻被抓到（实测 0.2.1-rc.2，403 个官方 token）。

## 疑难解答

| 症状 | 原因与处理 |
| --- | --- |
| 某个控件置灰 | 该字段还没被宿主服务（通常是改了 Host 半但没重启）。标题栏会说明 |
| 完全没变化 | 看「启用」是否关着，再看「透视背景」是不是 `none` |
| 看不见桌面（macOS） | 层数补偿已处理；确认用的是桌面版而不是浏览器（浏览器没有窗口材质，只能铺壁纸） |
| 配置里残留 `mode` / `blur` / `saturate` | 1.0 留下的键，**不影响运行**；想清掉就手动删 |

## 图标与侧栏字形

`icon.svg` 由 `package.json` 的 `icon` 声明（官方契约：相对路径、只收 svg/png/jpg/webp、≤256 KiB；
宿主 inline 成 `data:` URL，以 48×48 显示）。

**设置侧栏的导航图标**在 shell 里是**硬编码**的（`navIcon(id)`：只有 account／models／agent-presets／
plugins／archived-sessions 有专属图标，其余一律齿轮），而 `settings.section` 没有 icon 字段。
所以本插件用一个**最小的 DOM 补丁**只替换**自己那一列**的字形：用三种语言的导航文字定位、保存原始
`innerHTML`、卸载时完整还原、只订阅 `body.childList`（设置面板是 portal 到 body 的新子树）、
结构不符就什么都不做。

## 发布

| 步骤 | 指令 |
| --- | --- |
| 打封包自检 | `npm pack --dry-run` |
| 发布 | `npm login && npm publish --access public`（`prepublishOnly` 会先跑测试） |
| GitHub release | `gh release create v1.1.x dist/dsh-appearance-glass.tgz` |
| 投稿市场 | 给 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 开 PR，新增 `data/plugins/david0304git__dsh-appearance-glass.yml` |

投稿文件在 `submit/awesome-dsh-plugin.yml`；仓库声明了 `dsh.bundle`，所以 `dsh plugin add` 能直接安装。
没有任何 `prepare`／`postinstall` 脚本，源码安装不需要建置授权。

## 授权

MIT
