# 2 分鐘宣傳片的產生器

成品在 **Releases**：`promo-2min.mp4`（1920×1080、24fps、118.6 秒、靜音）。

這支影片是**逐格渲染**出來的，不是錄屏：用一個小的 Swift 程式開 WKWebView 載入 HTML 場景，
呼叫 `window.__render(t)` 之後截圖，再用 ffmpeg 編成 H.264。

## 流程

```sh
python3 tokens.py                     # 從本機 DSH app.asar 抽官方 token → tokens.css
swiftc -O -o rec rec.swift            # 編譯逐格錄影器
./render_all.sh                       # 11 幕 × 24fps → frames/*.jpg（約 2 分鐘）
python3 build.py                      # 每幕各自編碼 + xfade 串接 → ../out/promo-2min.mp4
```

- 場景：`scene00.html` … `scene10.html`，每幕自己定義 `window.__duration` 與 `window.__render(t)`
  （`t` 是秒；全部狀態都由 `t` 決定，因此逐格可重現）。
- 共用素材：`stage.css`（舞台／字幕／卡片）、`app.css` + `app.js`（DSH 介面 mock，
  透明度用與外掛相同的 `a = 1-(1-t)^(1/d)` 換算）、`bg.jpg`（烘焙好的背景貼圖，避免每幀重繪 blur）。
- `bgonly.html` 用來把背景烘成一張圖：`./rec bgonly.html frames 960 540 24 bg 1 0.0`。
- 時間軸與文案見 [`../../docs/promo-2min.md`](../../docs/promo-2min.md)。

## 為什麼要烘焙背景

每幀都重繪 `filter: blur(60px)` 的三顆色斑時，單幀要 0.78 秒（全片 46 分鐘）；
改成貼圖 ＋ JPEG 影格後是 0.05 秒/幀（全片 2 分鐘）。

## 改音樂

```sh
ffmpeg -i promo-2min.mp4 -i music.m4a -map 0:v -map 1:a -shortest \
  -c:v copy -c:a aac -b:a 192k -movflags +faststart promo-2min-music.mp4
```
