# 2 分鐘宣傳片（storyboard）

- 成品：Release 資產 [`promo-2min.mp4`](https://github.com/david0304git/dsh-appearance-glass/releases/download/v1.1.1/promo-2min.mp4)（1920×1080、24fps、**118.6 秒**、靜音、27MB）
- 產生器：`tools/promo/`（HTML 場景 ＋ Swift 逐格錄影器 ＋ ffmpeg 串接）
- 全部畫面都是**逐格渲染**出來的：用 WKWebView 載入 HTML 場景，呼叫 `window.__render(t)` 之後截圖，
  再用 ffmpeg 串成 H.264。**不是錄屏、也不是示意圖** —— 場景裡的介面用的就是外掛真正的
  CSS 與官方 token，透明度用的是外掛同一套 `a = 1-(1-t)^(1/d)` 換算。
- 重新渲染：`tools/promo/` 下有完整場景與腳本（見該目錄 README）。

## 時間軸

| 時間 | 幕 | 內容 | 字幕（繁中） |
| --- | --- | --- | --- |
| 0:00–0:05 | 00 | 圖標＋標題進場，副標點出「四個分區」 | — |
| 0:05–0:11 | 01 | DSH 預設介面（面板不透明），壁紙被擋住 | DSH 預設：面板不透明，桌面與壁紙都被擋住 |
| 0:11–0:22 | 02 | **主戲**：拖「主畫面」滑桿 100% → 20%，介面真的變透；右側即時控制卡與大數字 | 拖曳滑桿，面板真的變透 → 滑桿寫 20%，畫面上就是真的 20% |
| 0:22–0:35 | 03 | 四個分區各自獨立：側欄 → 卡片 → 浮層，各自滑桿與數字 | 側欄可以單獨調透明…／卡片與輸入框…／浮層只降一點 |
| 0:35–0:50 | 04 | 內建壁紙：五組配色輪播（極光→深海→日落→森林→石墨）＋強度動畫 | 五組配色，一鍵換掉三個色斑與底色 |
| 0:50–1:04 | 05 | **設定頁特寫**：真的外掛面板（一列一個控制項、左緣對齊、即時預覽）＋游標點擊 | 設定 → 介面外觀… |
| 1:04–1:14 | 06 | 淺色／深色切換（同一組滑桿，底色跟著換） | 淺色：同一組滑桿，自動換成淺色底色 |
| 1:14–1:22 | 07 | 啟用開關 A/B：關 → 面板立刻回到不透明 → 再開，設定還在 | 不喜歡？一個開關就回到原本的 DSH |
| 1:22–1:35 | 08 | 為什麼「調到最低還是不透」：層數補償公式與三個例子 | 同一個底色被疊兩層，直接設 68% 會變成 90% |
| 1:35–1:47 | 09 | 三個重點：44 項自動測試／DSH 0.2.x／macOS 原生材質；三語 | 不是畫上去的假玻璃：外掛只把面板換成半透明 |
| 1:47–1:59 | 10 | 結尾：安裝指令、repo、MIT、v1.1.1 | — |


## 旁白（音軌 ＋ 混音版）

三種成品（都在 Release 上）：

| 檔案 | 內容 | 大小 |
| --- | --- | --- |
| `promo-2min.mp4` | 無聲版 | 27MB |
| `promo-2min-zh.mp4` | **中文旁白**（Meijia／zh_TW 麥克風聲） | 29MB |
| `promo-2min-en.mp4` | English narration（Samantha／en_US） | 29MB |
| `promo-2min-narration.zh-TW.m4a` | 純音軌母帶（48kHz 立體聲、−16 LUFS） | 1.9MB |
| `promo-2min-narration.en.m4a` | 同上，英文 | 1.6MB |

### 為什麼「音軌」與「影片」都給

- **音軌母帶**：想換配音、換音樂、或自己重錄，直接拿它對時間軸（不用重跑影片）。
- **混音版影片**：交付／貼到市場用，一打開就有聲音。

### 旁白腳本（每個時間點都對齊那一幕）

| 幕 | 起點 | 中文旁白 | English narration |
| --- | --- | --- | --- |
| 00 | 0.0s | 把 DSH 的介面變透明。 | Make the DSH interface see-through. |
| 01 | 4.2s | 預設的面板完全不透明，桌面被擋住。 | Out of the box, every panel is opaque. |
| 02 | 9.8s | 拖一下主畫面的滑桿，面板真的變透。滑桿寫兩成，畫面上就是兩成，因為疊層已經換算過。 | Drag the main panel slider and the panels really become transparent. Twenty percent on the slider is twenty percent on screen, because layer counts are already compensated. |
| 03 | 20.4s | 四個分區可以分開調：主畫面、側欄、卡片和輸入框、選單與浮層。想讓哪一塊更透，就調哪一塊。 | Four regions tune separately: main panel, sidebar, cards and inputs, and menus. |
| 04 | 33.0s | 不想用桌面，就用內建壁紙。五組配色，三個色斑、底色、強度都能改，調完馬上看到。 | No desktop? Use the built-in wallpaper: five palettes, three blobs, a base colour and a strength. |
| 05 | 47.6s | 設定都在介面外觀這一頁：一列一個控制項，左緣對齊，上面就是即時預覽。 | Everything lives in Settings, Interface appearance: one control per row, with a live preview. |
| 06 | 61.2s | 深色淺色都支援。同一組滑桿，淺色時底色自動換成淡藍。 | Light and dark both work; the base colour follows the scheme. |
| 07 | 70.8s | 不喜歡？一個開關就回到原本的 DSH，設定不會丟。 | Not for you? One switch restores the stock DSH, and your settings stay. |
| 08 | 78.4s | 為什麼以前調到最低還是不透？因為同一個底色被疊了兩層。外掛用層數反推單層值，你看到的數字就是真的。 | Why did it barely look transparent before? Because the same colour is painted twice. The plugin solves for the layer value, so the number you see is the number you get. |
| 09 | 93.0s | 它不畫假玻璃，只把面板換成半透明。另外還有四十四項自動測試，每次改版都會跑。 | It does not fake the glass; it only makes the panels translucent. Forty-four automated checks guard every release. |
| 10 | 106.6s | 一行指令就裝好。開源、MIT，歡迎試用。 | One command to install. Open source, MIT. |

### 怎麼產生的

```sh
# 一句一幕，用 macOS 內建語音（Meijia = zh_TW、Samantha = en_US）
say -v Meijia -r 170 -o vo02.aiff '拖一下主畫面的滑桿…'
# 每句延遲到那一幕的起點（毫秒），再混音、響度正規化（−16 LUFS、峰值 −1.5 dBFS）
ffmpeg -i vo00.aiff -i vo01.aiff …   -filter_complex "[0:a]aresample=48000,aformat=channel_layouts=stereo,adelay=0|0[a0];…;\
                   [a0][a1]…amix=inputs=11:normalize=0[m];[m]apad=whole_dur=118.583[p];\
                   [p]loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.95[out]" \
  -map '[out]' -c:a aac -b:a 192k -ar 48000 -t 118.583 narration.zh-TW.m4a
# 混進影片（影像不重編碼）
ffmpeg -i promo-2min.mp4 -i narration.zh-TW.m4a -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart promo-2min-zh.mp4
```

### 要換成自己的聲音

1. 按上表的**起點**逐句錄（每句留 0.3 秒餘量，slot 長度見腳本）。
2. 用同一條 `ffmpeg` 指令混音（把 `vo00.aiff` 換成你的檔），再 mux。
3. 或直接把你的錄音給我，我照同樣的時間軸混。

## 關於聲音

無聲版仍是預設（不放聽不出品質的配樂）；旁白版見上節。要再加自己的音樂（旁白版請把音樂壓到 −24 LUFS 以下）：

```sh
ffmpeg -i preview/promo-2min.mp4 -i your-music.m4a \
  -map 0:v -map 1:a -shortest -c:v copy -c:a aac -b:a 192k \
  -movflags +faststart preview/promo-2min-music.mp4
```

需要的話我也可以加旁白（macOS `say` 的合成語音）或字幕檔（`.srt`）。
