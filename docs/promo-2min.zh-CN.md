# 宣传片简介（简体中文）

> 直接可用的投放文案：标题、简介、章节时间轴、下载途径、安装方法、标签与授权。
> 影片规格：**1920×1080 / 24fps / 1 分 58.6 秒**，中文旁白（另有英文旁白与无声版），字幕繁中＋英文。

## 一、标题（按平台挑一个）

| 平台 | 标题 |
| --- | --- |
| B 站 / YouTube | DSH 界面透明度插件：四个区域独立调，滑杆数字就是实际看到的透明度（2 分钟演示） |
| 小红书 / 微博 | 把 DeepSeek Harness 的界面调成半透明，看见自己的壁纸 |
| GitHub 仓库 / 市场 | dsh-appearance-glass — 2 分钟宣传片 |

## 二、一句话简介

把 DSH 的面板调淡，就能透出桌面或内置壁纸；四个区域各自可调，滑杆上的数字就是屏幕上真实的透明度。

## 三、正文（短版，约 90 字）

这是一个 DSH（DeepSeek Harness）外观插件：把界面面板换成半透明，就能看见桌面或内置壁纸。主界面、侧栏、卡片与输入框、菜单与浮层四个区域各自可调；滑杆写 20%，画面上就是真的 20% —— 因为插件已经把叠层数量换算过了。内置五组壁纸配色，深浅色都支持，一个开关就能回到原来的样子。

## 四、正文（长版，约 380 字）

**为什么以前“调到最低还是不透”？**
同一块底色在界面上常被叠了两三层。直接把 token 设成 68%，实际看到的是 90%。这个插件用真实层数反推单层值（`a = 1−(1−t)^(1/d)`），所以滑杆上的数字就是屏幕上真实的透明度。

**四个区域，各自独立**
主界面、侧栏、卡片与输入框、菜单与浮层可以分开调：想让侧栏更透、菜单保持清楚，完全可以。

**内置壁纸**
不想用桌面材质？插件自带壁纸：三个色块、底色、强度都能改，还有五组配色（极光／深海／日落／森林／石墨），预览与真实叠层一致，改完马上看到。

**只做透明，不做假玻璃**
不添加任何 `backdrop-filter`、不高光、不模糊；在 macOS 桌面版上透出来的是窗口本来就有的系统材质，不是 CSS 假装的。

**安全与可逆**
纯 token 覆写，不改 DSH 任何源码；卸载即完全消失；标题栏有一个开关可以随时回到原生外观。附带 44 项自动测试，每次发版都会跑。

## 五、章节（可直接贴成视频章节）

```
0:00 这是什么
0:04 DSH 默认：面板不透明
0:10 拖动滑杆：真的变透（20% 就是 20%）
0:22 四个区域各自独立
0:33 五组内置壁纸配色
0:47 设置页：一列一个控制项
1:02 深色 / 浅色
1:12 一个开关回到原生
1:20 为什么以前不透：叠层换算
1:33 44 项自动测试 / 兼容性 / 三语
1:47 安装方式
```

## 六、下载途径

影片、音轨、海报都在 **GitHub Release**（全部 MIT，可自由转载、二次剪辑）：

| 文件 | 内容 | 大小 | 直链 |
| --- | --- | --- | --- |
| `promo-2min-zh.mp4` | **中文旁白版**（推荐） | 29 MB | https://github.com/david0304git/dsh-appearance-glass/releases/download/v1.1.1/promo-2min-zh.mp4 |
| `promo-2min-en.mp4` | English narration | 29 MB | https://github.com/david0304git/dsh-appearance-glass/releases/download/v1.1.1/promo-2min-en.mp4 |
| `promo-2min.mp4` | 无声版（自己配乐／配音用） | 27 MB | https://github.com/david0304git/dsh-appearance-glass/releases/download/v1.1.1/promo-2min.mp4 |
| `promo-2min-narration.zh-TW.m4a` | 中文旁白音轨（48kHz，−16 LUFS） | 1.9 MB | https://github.com/david0304git/dsh-appearance-glass/releases/download/v1.1.1/promo-2min-narration.zh-TW.m4a |
| `promo-2min-narration.en.m4a` | 英文旁白音轨 | 1.6 MB | https://github.com/david0304git/dsh-appearance-glass/releases/download/v1.1.1/promo-2min-narration.en.m4a |
| `promo-poster.jpg` | 封面图（1920×1080） | 114 KB | https://github.com/david0304git/dsh-appearance-glass/releases/download/v1.1.1/promo-poster.jpg |

- **Release 页**（一次看全部）：https://github.com/david0304git/dsh-appearance-glass/releases/tag/v1.1.1
- **仓库**：https://github.com/david0304git/dsh-appearance-glass
- 若平台不允许外链：在 GitHub 搜 **`david0304git/dsh-appearance-glass`** → Releases → v1.1.1。

> 说明：npm 上还没有这个包，插件市场条目也在等收录；所以**插件本体**目前请从 GitHub 安装（见下）。

## 七、安装插件（影片里演示的那个）

```sh
# 需要 dsh >= 0.2.0
dsh plugin --profile web add github:david0304git/dsh-appearance-glass
```

装完打开 **设置 → 界面外观**。第一次若提示要重启，重启一次即可，之后调节都即时生效。

## 八、标签

`#DSH` `#DeepSeekHarness` `#插件` `#界面美化` `#透明度` `#壁纸` `#开源` `#macOS`

英文：`#DeepSeekHarness` `#desktopapp` `#transparency` `#plugins` `#opensource` `#macOS`

## 九、授权与转载

- 代码与影片都是 **MIT**：可自由转载、二次剪辑、商用，保留出处即可。
- 影片里的旁白是 **macOS 内置合成语音**（中文 Meijia／英文 Samantha），不是真人配音；没有背景音乐。想换成真人配音或加配乐，见 `docs/promo-2min.md`。
- 影片没有使用任何第三方素材：界面 mock、图标、背景全部由本仓库的 HTML 场景渲染生成（生成器在 `tools/promo/`）。
