/**
 * dsh-appearance-glass — 瀏覽器半（DSH Web Client）
 * ==========================================================
 * 對外行為：設定側欄的「介面外觀」一頁（＋外掛頁同一份面板）。
 * 這個外掛**只做透明度** —— 1.1 起移除「模式」與液態玻璃（模糊／飽和／高光／
 * 邊緣描邊／遮罩模糊），所以效果永遠是在「透明」上進行：
 *
 *   把各表面的背景 token 換成帶 alpha 的顏色 → DSH 自己的原生材質透出來；
 *   想看見自己的顏色就鋪「內建壁紙」（同樣是純 alpha，沒有任何額外圖層）。
 *
 * 為什麼在 macOS 桌面版會有「真的透視」
 * -----------------------------------
 * DSH 桌面版的主視窗是 `vibrancy: 'sidebar'` + `backgroundColor: '#00000000'`
 * 建立的，而官方 CSS 在 `html[data-platform=darwin]` 下把 html/body 的背景設成
 * transparent（`html[data-platform=darwin],html[data-platform=darwin] body
 * {background:transparent}`）。也就是說：**桌面模糊一直都在，只是被各面板的不透明
 * 背景蓋住了**。本外掛把那些表面的 token 換成半透明色，原生材質就透出來 ——
 * 這是真正的桌面透視，不是 CSS 假裝的。
 *
 * 滑桿上的數字是「合成後」的不透明度
 * ---------------------------------
 * 介面上同一塊底色常被疊了好幾層（例：darwin 的 `.centerCol` 與對話區 root 都畫
 * `--dsw-alias-bg-base`），所以四根分區滑桿的值會被換算成單層 alpha
 * （`a = 1-(1-target)^(1/depth)`，見 GROUP_DEPTH），滑桿寫 20% 就真的是 20%。
 *
 * UI 一律照官方形狀（不自己發明樣式）
 * ------------------------------------
 * 一列一個控制項（官方 FontSizeRow 的形狀）：`36px` pill、
 * `--dsw-radius-md`、`--dsw-alias-bg-module-platform` 底；選單用官方 `Menu`、
 * 開關用官方 `Switch`（都來自 `@deepseek-ai/dsh-client-ui-primitives`，
 * 它在 web shell 的 static module 表裡，與 react 同等級）。取不到時退化成
 * 同形狀的原生 <select>／同位置的文字按鈕，不會壞掉整列。
 *
 * 實作紀律（為什麼這樣挑選擇器）
 * ------------------------------
 *  * 主要手段是 **theme token 覆寫**（`ctx.theme.overrideTokens`）：官方元件自己
 *    消費 `--dsw-*` token，所以覆寫會沿用到所有面板，而且不依賴任何 hash 過的
 *    class 名（`._3WPZCG_root` 這種名字每次 build 都會變，碰不得）。
 *  * 除了壁紙（畫在 `<html>` 的 background-image），**不碰任何容器**：
 *    容器一旦有 backdrop-filter 就會變成 fixed 子孫的 containing block，
 *    而 DSH 的選單用 CSS anchor positioning + position:fixed 就地渲染，
 *    套在大容器上會有定位風險。
 *  * 全部 fail-open：找不到 theme/slots/configForms 就不註冊、什麼都不改。
 */

window.__ModuleLoader__.load({
  id: 'dsh-appearance-glass',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement
    /** 官方 UI 元件庫；取不到時 fallback 成同形狀的原生控件（見 SelectPill）。 */
    const primitives = (() => {
      try {
        return require('@deepseek-ai/dsh-client-ui-primitives')
      } catch (error) {
        console.warn('[appearance-glass] primitives unavailable, falling back to native controls:', error)
        return undefined
      }
    })()

    // ── 身分與命名空間 ────────────────────────────────────────────────────
    /** 外掛頁 keyed slot 的鍵：bundle 的 npm 套件名。 */
    const PACKAGE_NAME = 'dsh-appearance-glass'
    /** settings 命名空間＝bundle patch 裡的 row id（見 cordis.patch.yml）。 */
    const ENTRY_NS = 'appearance-glass'
    /** theme override 層的名字（同 source 重複呼叫＝整層替換）。 */
    const SOURCE = 'dsh-appearance-glass'
    /** 本外掛擁有的 locale 命名空間。 */
    const LOCALE_NS = 'appearanceGlass'

    /** `<html>` 上的背景策略標記。 */
    const BACKDROP_ATTR = 'data-dsh-glass-backdrop'
    /** 本外掛注入的唯一個 <style>。 */
    const STYLE_ATTR = 'data-plugin'

    const BACKDROPS = ['auto', 'wallpaper', 'none']
    const NUMBER_FIELDS = {
      opacityBase: [0, 100],
      opacitySidebar: [0, 100],
      opacitySurface: [0, 100],
      opacityOverlay: [0, 100],
      wallpaperStrength: [10, 100],
    }
    /** 本外掛擁有的全部欄位（順序＝「恢復預設」的清除順序）。 */
    const FIELDS = [
      'enabled',
      'opacityBase',
      'opacitySidebar',
      'opacitySurface',
      'opacityOverlay',
      'backdrop',
      'wallpaperA',
      'wallpaperB',
      'wallpaperC',
      'wallpaperBase',
      'wallpaperStrength',
    ]
    /** 與 Host 半 Config 的 default 必須一致（設定載入前的開機值）。 */
    const DEFAULTS = Object.freeze({
      enabled: true,
      opacityBase: 68,
      opacitySidebar: 68,
      opacitySurface: 68,
      opacityOverlay: 72,
      backdrop: 'auto',
      wallpaperA: 'auto',
      wallpaperB: 'auto',
      wallpaperC: 'auto',
      wallpaperBase: 'auto',
      wallpaperStrength: 58,
    })
    /**
     * 出廠壁紙的色票：'auto' 時用這組值，且**跟隨深淺色**（深色用沉一階的色斑，
     * 這是原本那張壁紙的樣子，不要改動）。使用者選色後就整組換成他的顏色。
     */
    const WALL_BASE = Object.freeze({ light: '#e9f0ff', dark: '#0b0f1c' })
    const WALL_BLOBS = Object.freeze({
      wallpaperA: Object.freeze({ light: '#94c4ff', dark: '#5680ff' }),
      wallpaperB: Object.freeze({ light: '#ffa6d6', dark: '#d660a8' }),
      wallpaperC: Object.freeze({ light: '#967aff', dark: '#765cff' }),
    })

    // ── Token 覆寫表 ──────────────────────────────────────────────────────
    /**
     * 需要半透明化的表面：`[token, light static, dark static, delta]`。
     * static 色票名是 `--dsw-static-<name>` 的 `<name>` 部分，與 light/dark 的
     * 配對完全照官方 `ui-theme` 的 alias 表抄，所以任何主題／任何深淺色都不會
     * 走鐘（我們只改 alpha，不改色相）。
     * delta 是各表面的不透明度加權：越靠內容（卡片、選單）越不透明，越靠底
     * （app base、側欄）越透。
     */
    const STATIC_SURFACES = [
      ['--dsw-alias-bg-base', 'neutral-bluish-00', 'neutral-bluish-950', 0, 'opacityBase'],
      ['--dsw-specific-sidebar-fill', 'neutral-bluish-50', 'neutral-bluish-900', 0, 'opacitySidebar'],
      ['--dsw-specific-sidebar-nav-item-active', 'neutral-bluish-100', 'neutral-bluish-750', 12, 'opacitySidebar'],
      ['--dsw-specific-sidebar-nav-item-hover', 'neutral-bluish-75', 'neutral-bluish-850', 6, 'opacitySidebar'],
      ['--dsw-specific-input-major', 'neutral-bluish-00', 'neutral-bluish-850', 0, 'opacitySurface'],
      ['--dsw-specific-login-input', 'neutral-bluish-50', 'neutral-bluish-900', 2, 'opacitySurface'],
      ['--dsw-alias-bg-layer-1', 'neutral-bluish-00', 'neutral-bluish-875', 6, 'opacitySurface'],
      ['--dsw-alias-bg-layer-2', 'neutral-bluish-00', 'neutral-bluish-850', 10, 'opacitySurface'],
      ['--dsw-alias-bg-layer-3', 'neutral-bluish-00', 'neutral-bluish-800', 14, 'opacitySurface'],
      ['--dsw-alias-bg-module-platform', 'neutral-bluish-60', 'neutral-bluish-800', 10, 'opacitySurface'],
      ['--dsw-alias-bg-multi-select', 'neutral-bluish-60', 'neutral-bluish-850', 10, 'opacitySurface'],
      ['--dsw-alias-bg-document-preview', 'neutral-bluish-100', 'neutral-bluish-950', 6, 'opacitySurface'],
      ['--dsw-specific-bubble', 'deepseek-50', 'neutral-bluish-850', 4, 'opacitySurface'],
      ['--dsw-specific-tip', 'neutral-bluish-60', 'neutral-bluish-800', 8, 'opacitySurface'],
      ['--dsw-specific-selector', 'neutral-bluish-60', 'neutral-bluish-800', 8, 'opacitySurface'],
      ['--dsw-alias-markdown-code-block', 'neutral-bluish-50', 'neutral-bluish-900', 14, 'opacitySurface'],
      ['--dsw-alias-markdown-code-block-banner', 'neutral-bluish-50', 'neutral-bluish-850', 16, 'opacitySurface'],
      ['--dsw-alias-markdown-inline-code', 'neutral-50', 'neutral-800', 12, 'opacitySurface'],
      ['--dsw-alias-markdown-tag', 'neutral-bluish-75', 'neutral-bluish-850', 10, 'opacitySurface'],
      ['--dsw-alias-button-floating-fill', 'neutral-bluish-00', 'neutral-bluish-850', 12, 'opacitySurface'],
      ['--dsw-alias-button-floating-hover', 'neutral-bluish-75', 'neutral-bluish-800', 14, 'opacitySurface'],
      ['--dsw-alias-bg-overlay', 'neutral-bluish-150', 'neutral-bluish-700', 0, 'opacityOverlay'],
      ['--dsw-alias-tooltip-bg', 'neutral-bluish-850', 'neutral-bluish-750', 18, 'opacityOverlay'],
      ['--dsw-alias-toast-bg', 'neutral-bluish-800', 'neutral-bluish-750', 20, 'opacityOverlay'],
    ]

    /**
     * 官方用 rgba() 字面值定義的表面（不是 static token），因此直接輸出 rgb。
     * `--dsw-specific-menu` 在 darwin 被官方以更高優先權改成 rgba(.94)，
     * 所以它必須跟 `--dsw-menu-surface-fill` 一起覆寫（我們是 inline style，必勝）。
     */
    const RGB_SURFACES = [
      ['--dsw-menu-surface-fill', '248 249 250', '67 69 74', 14, 'opacityOverlay'],
      ['--dsw-specific-menu', '248 249 250', '67 69 74', 14, 'opacityOverlay'],
      ['--dsw-alias-menu-group-header-fill', '248 249 250', '48 49 54', 20, 'opacityOverlay'],
    ]

    /**
     * 每一區在真實介面裡「同一塊背景被疊了幾層」——數字直接對應官方 CSS：
     *   base   2.0  `[data-platform=darwin] .centerCol{background:var(--dsw-alias-bg-base)}`
     *                ＋ 對話區 root 再一次 bg-base
     *   sidebar 1.4 `.sidebarCol` 自己先上 `color-mix(sidebar-fill 40%, transparent)`，
     *                側欄 root 再一層 sidebar-fill（合成 ≈ 1-(1-0.4a)(1-a)）
     *   surface 1.0 卡片／輸入框疊在 base 之上，本身只有一層
     *   overlay 1.0 選單與浮層是最上層
     * 有了它，滑桿上的數字才是**使用者實際看到的合成不透明度**。
     */
    const GROUP_DEPTH = Object.freeze({
      opacityBase: 2,
      opacitySidebar: 1.4,
      opacitySurface: 1,
      opacityOverlay: 1,
    })
    /** delta 是在預設值 68 時調出來的；目標值更低時要一起縮小才不會喧賓奪主。 */
    const DELTA_REFERENCE = 68

    /** 邊界夾限。 */    /** 邊界夾限。 */
    const clamp = (value, min, max) => (value < min ? min : value > max ? max : value)

    /**
     * 反推單層 alpha：要讓 depth 層疊起來的**合成**結果等於 target。
     * 合成 = 1-(1-a)^depth  ⇒  a = 1-(1-target)^(1/depth)
     * @param target - 使用者看到的合成不透明度（0–100）。
     * @param depth - 該區實際疊了幾層。
     * @returns 單層 alpha（0–100）。
     */
    function layerAlpha(target, depth) {
      const t = clamp(target, 0, 100) / 100
      if (t === 0) return 0
      if (t === 1) return 100
      return 100 * (1 - Math.pow(1 - t, 1 / depth))
    }

    /**
     * 某個表面在目前設定下的最終 alpha。
     * @param settings - 目前設定。
     * @param group - 四個分區之一。
     * @param delta - 同區內的相對加權。
     * @returns 0–100。
     */
    function surfaceAlpha(settings, group, delta) {
      const target = settings[group]
      return clamp(
        layerAlpha(target, GROUP_DEPTH[group]) + delta * (target / DELTA_REFERENCE),
        0,
        100,
      )
    }
    /** 數字欄位的安全讀取。 */
    function number(value, fallback, min, max) {
      return typeof value === 'number' && Number.isFinite(value)
        ? clamp(Math.round(value), min, max)
        : fallback
    }
    /** 列舉欄位的安全讀取。 */
    function pick(value, allowed, fallback) {
      return allowed.includes(value) ? value : fallback
    }
    /** #rrggbb（不分大小寫）→ 小寫；其他一律回退到預設色（fail-open）。 */
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
    function color(value, fallback) {
      return typeof value === 'string' && HEX_COLOR.test(value.trim())
        ? value.trim().toLowerCase()
        : fallback
    }
    /** 底色欄位：'auto'（跟隨深淺色）或一個 #rrggbb。 */
    function baseColor(value, fallback) {
      return value === 'auto' ? 'auto' : color(value, fallback)
    }

    /**
     * 把任何來源（Host 投影、預覽值）折成一份完整、合法的設定。
     * @param raw - 部分設定。
     * @param base - 缺欄位時的來源（預設是 DEFAULTS）。
     * @returns 完整設定。
     */
    function normalize(raw, base = DEFAULTS) {
      const source = raw === null || typeof raw !== 'object' ? {} : raw
      return {
        enabled: typeof source.enabled === 'boolean' ? source.enabled : base.enabled,
        opacityBase: number(source.opacityBase, base.opacityBase, ...NUMBER_FIELDS.opacityBase),
        opacitySidebar: number(source.opacitySidebar, base.opacitySidebar, ...NUMBER_FIELDS.opacitySidebar),
        opacitySurface: number(source.opacitySurface, base.opacitySurface, ...NUMBER_FIELDS.opacitySurface),
        opacityOverlay: number(source.opacityOverlay, base.opacityOverlay, ...NUMBER_FIELDS.opacityOverlay),
        backdrop: pick(source.backdrop, BACKDROPS, base.backdrop),
        wallpaperA: baseColor(source.wallpaperA, base.wallpaperA),
        wallpaperB: baseColor(source.wallpaperB, base.wallpaperB),
        wallpaperC: baseColor(source.wallpaperC, base.wallpaperC),
        wallpaperBase: baseColor(source.wallpaperBase, base.wallpaperBase),
        wallpaperStrength: number(
          source.wallpaperStrength,
          base.wallpaperStrength,
          ...NUMBER_FIELDS.wallpaperStrength,
        ),
      }
    }

    /** 兩個設定是否等價（避免重複重繪）。 */
    function sameSettings(a, b) {
      return (
        a.enabled === b.enabled &&
        a.opacityBase === b.opacityBase &&
        a.opacitySidebar === b.opacitySidebar &&
        a.opacitySurface === b.opacitySurface &&
        a.opacityOverlay === b.opacityOverlay &&
        a.backdrop === b.backdrop &&
        a.wallpaperA === b.wallpaperA &&
        a.wallpaperB === b.wallpaperB &&
        a.wallpaperC === b.wallpaperC &&
        a.wallpaperBase === b.wallpaperBase &&
        a.wallpaperStrength === b.wallpaperStrength
      )
    }

    /** 目前文件是不是深色（色票要顯示「跟隨深淺色」時的有效值）。 */
    function isDarkScheme() {
      const body = typeof document === 'undefined' ? undefined : document.body
      return body !== undefined && body !== null && typeof body.hasAttribute === 'function'
        ? body.hasAttribute('data-ds-dark-theme')
        : false
    }

    /**
     * 一個顏色欄位在目前深淺色下的有效值（給色票顯示；'auto' 時等於出廠色）。
     * @param field - `wallpaperA` / `wallpaperB` / `wallpaperC` / `wallpaperBase`。
     * @param value - 該欄位目前的值（'auto' 或 #rrggbb）。
     * @returns #rrggbb。
     */
    function effectiveColor(field, value) {
      const dark = isDarkScheme()
      if (value !== 'auto') return value
      if (field === 'wallpaperBase') return dark ? WALL_BASE.dark : WALL_BASE.light
      return dark ? WALL_BLOBS[field].dark : WALL_BLOBS[field].light
    }

    /** 桌面/Windows 的原生視窗材質是否可用（preload 只在桌面殼裡寫 data-platform）。 */
    function hasNativeMaterial() {
      const platform = document.documentElement.dataset.platform
      return platform === 'darwin' || platform === 'win32'
    }

    /**
     * 實際採用的背景策略。
     * @param settings - 目前設定。
     * @returns `native` | `wallpaper` | `none`。
     */
    function resolvedBackdrop(settings) {
      if (settings.backdrop === 'wallpaper') return 'wallpaper'
      if (settings.backdrop === 'none') return 'none'
      return hasNativeMaterial() ? 'native' : 'wallpaper'
    }

    /**
     * 產生 theme override 層。
     * @param settings - 目前設定。
     * @returns token → { light, dark } 對照表（theme 服務要求的形狀）。
     */
    function tokenLayer(settings) {
      const layer = {}
      for (const [token, lightStatic, darkStatic, delta, group] of STATIC_SURFACES) {
        const alpha = Math.round(surfaceAlpha(settings, group, delta))
        layer[token] = {
          light: `color-mix(in srgb, var(--dsw-static-${lightStatic}) ${alpha}%, transparent)`,
          dark: `color-mix(in srgb, var(--dsw-static-${darkStatic}) ${alpha}%, transparent)`,
        }
      }
      for (const [token, lightRgb, darkRgb, delta, group] of RGB_SURFACES) {
        const alpha = Math.round(surfaceAlpha(settings, group, delta))
        layer[token] = { light: `rgb(${lightRgb} / ${alpha}%)`, dark: `rgb(${darkRgb} / ${alpha}%)` }
      }
      return layer
    }

    /**
     * 壁紙的圖層清單（三個色斑 + 一條底色漸層）。
     * **CSS 與設定頁的即時預覽都呼叫這一個函式**，所以兩邊永遠一致：
     * CSS 傳 `var(--dsh-wall-*)`，預覽傳實際色票。
     * @param colors - `{ a, b, c, base, strength }`。
     * @returns background-image 的圖層字串陣列。
     */
    function wallpaperLayers(colors) {
      const soft = Math.max(10, Math.round(colors.strength * 0.85))
      return [
        `radial-gradient(120% 90% at 6% 2%, color-mix(in srgb, ${colors.a} ${colors.strength}%, transparent) 0%, transparent 58%)`,
        `radial-gradient(115% 95% at 94% 6%, color-mix(in srgb, ${colors.b} ${soft}%, transparent) 0%, transparent 60%)`,
        `radial-gradient(135% 115% at 58% 104%, color-mix(in srgb, ${colors.c} ${colors.strength}%, transparent) 0%, transparent 62%)`,
        // 底色只用一條很淡的斜向提亮：出廠的淺／深底色幾乎維持原本的觀感
        // （色斑才是主角），而使用者換底色時也會得到同一個方向的光感。
        `linear-gradient(158deg, ${colors.base} 0%, ${colors.base} 45%, color-mix(in srgb, ${colors.base} 86%, white) 100%)`,
      ]
    }

    /** 壁紙配色預設組（一鍵換掉三個色斑 + 底色）。 */
    const WALL_PRESETS = [
      Object.freeze({ id: 'aurora', a: '#7ee0c0', b: '#6aa9ff', c: '#b388ff', base: '#0b1020' }),
      Object.freeze({ id: 'ocean', a: '#5ec8ff', b: '#3f7bff', c: '#22d3ee', base: '#061426' }),
      Object.freeze({ id: 'sunset', a: '#ffb26b', b: '#ff7aa8', c: '#c084fc', base: '#241019' }),
      Object.freeze({ id: 'forest', a: '#9ede73', b: '#39a06b', c: '#d9f99d', base: '#0c1a13' }),
      Object.freeze({ id: 'graphite', a: '#8ea0b8', b: '#5b6472', c: '#a8b3c4', base: '#14161a' }),
    ]

    /**
     * 產生本外掛的結構 CSS。現在只剩**內建壁紙**：透明本身純粹是 token 的
     * alpha，不需要任何額外圖層；液態玻璃（模糊／飽和／高光／描邊／遮罩模糊）
     * 已經移除，所以外掛不會再另外加 `backdrop-filter`。
     * @param settings - 目前設定。
     * @param backdrop - `resolvedBackdrop` 的結果。
     * @returns CSS 文字；停用或非壁紙模式時是空字串。
     */
    function stylesheet(settings, backdrop) {
      if (settings.enabled !== true || backdrop !== 'wallpaper') return ''
      const strength = settings.wallpaperStrength
      /** 'auto' → 出廠值（跟隨深淺色）；否則使用者指定的固定色。 */
      const resolve = (field, pair) => (settings[field] === 'auto' ? pair : settings[field])
      const lightBase = settings.wallpaperBase === 'auto' ? WALL_BASE.light : settings.wallpaperBase
      const darkBase = settings.wallpaperBase === 'auto' ? WALL_BASE.dark : settings.wallpaperBase
      const layers = wallpaperLayers({
        a: 'var(--dsh-wall-a)',
        b: 'var(--dsh-wall-b)',
        c: 'var(--dsh-wall-c)',
        base: 'var(--dsh-wall-base)',
        strength,
      }).join(',')
      return [
        `html[${BACKDROP_ATTR}="wallpaper"]{` +
          `--dsh-wall-a:${resolve('wallpaperA', WALL_BLOBS.wallpaperA.light)};` +
          `--dsh-wall-b:${resolve('wallpaperB', WALL_BLOBS.wallpaperB.light)};` +
          `--dsh-wall-c:${resolve('wallpaperC', WALL_BLOBS.wallpaperC.light)};` +
          `--dsh-wall-base:${lightBase};` +
          `background-image:${layers};` +
          'background-attachment:fixed;background-repeat:no-repeat}',
        `html[${BACKDROP_ATTR}="wallpaper"]:has(body[data-ds-dark-theme]){` +
          `--dsh-wall-a:${resolve('wallpaperA', WALL_BLOBS.wallpaperA.dark)};` +
          `--dsh-wall-b:${resolve('wallpaperB', WALL_BLOBS.wallpaperB.dark)};` +
          `--dsh-wall-c:${resolve('wallpaperC', WALL_BLOBS.wallpaperC.dark)};` +
          `--dsh-wall-base:${darkBase}}`,
      ].join('\n')
    }

    // ── 引擎：設定 → 畫面 ────────────────────────────────────────────────
    /**
     * 把設定投影到文件上。整個外掛只有這一個副作用出口，其餘都是純函式。
     * @param ctx - client cordis context（需要 ctx.theme 做 token 覆寫）。
     * @returns 引擎介面。
     */
    function createEngine(ctx) {
      const listeners = new Set()
      let state = Object.freeze({
        status: 'loading',
        value: undefined,
        writable: false,
        revision: undefined,
        overridden: false,
        served: undefined,
        effective: DEFAULTS,
      })
      let serverValues = DEFAULTS
      let preview = {}
      let painted = null
      let releaseTokens

      /**
       * 兩個 <style> 分開，因為生命週期不同：
       *   uiStyle    本外掛設定列的控件樣式，一旦掛上就不再變（mode=off 時
       *              設定列仍然存在，所以樣式必須留著）。
       *   glassStyle 玻璃層的結構 CSS，每次 paint 重寫，mode=off 時清空。
       * 先前把兩者混在一個節點上，等於「控件樣式從來沒被寫進去」—— 這是回報
       * 「按鈕與文字格式不一致」的真正原因，測試已補上對應斷言。
       */
      const uiStyle = document.createElement('style')
      uiStyle.setAttribute(STYLE_ATTR, PACKAGE_NAME)
      const glassStyle = document.createElement('style')
      glassStyle.setAttribute(STYLE_ATTR, PACKAGE_NAME)
      glassStyle.setAttribute('data-part', 'glass')

      const publish = (patch) => {
        state = Object.freeze({ ...state, ...patch })
        for (const listener of [...listeners]) listener()
      }

      /** 目前生效的設定＝預設值 ⊕ Host 投影值 ⊕ 拖動中的預覽值。 */
      const effective = () => normalize({ ...serverValues, ...preview })

      /** 重畫：token 覆寫層、結構 CSS、<html> 上的兩個標記。 */
      function paint() {
        const settings = effective()
        if (painted !== null && sameSettings(painted, settings)) return
        const first = painted === null
        painted = settings
        const backdrop = resolvedBackdrop(settings)
        const root = document.documentElement
        if (settings.enabled !== true) {
          root.removeAttribute(BACKDROP_ATTR)
          glassStyle.textContent = ''
          releaseTokens?.()
          releaseTokens = undefined
        } else {
          root.setAttribute(BACKDROP_ATTR, backdrop)
          glassStyle.textContent = stylesheet(settings, backdrop)
          if (ctx.theme !== undefined && typeof ctx.theme.overrideTokens === 'function') {
            try {
              // 同一個 source 再呼叫一次＝整層替換並重新疊到最上層，所以不必
              // 手動先釋放上一層；失敗（例如 schema 驗證）時保留舊層最安全。
              releaseTokens = ctx.theme.overrideTokens(SOURCE, tokenLayer(settings))
            } catch (error) {
              console.error('[appearance-glass] theme override rejected:', error)
            }
          } else if (first) {
            console.warn('[appearance-glass] no theme service: only structural CSS is applied')
          }
        }
        publish({ effective: settings })
      }

      return {
        /** React 訂閱入口。 */
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        /** React 快照入口（穩定參考）。 */
        read() {
          return state
        },
        /** 掛上兩個 <style>（控件樣式固定，玻璃層另計）。 */
        mountStyle() {
          // 先清掉任何殘留的同名節點：HMR 重新載入或卸載若漏跑一次 disposer，
          // 少了這一步就會愈疊愈多份樣式。
          if (typeof document.querySelectorAll === 'function') {
            for (const stale of document.querySelectorAll(`style[${STYLE_ATTR}="${PACKAGE_NAME}"]`)) {
              stale.remove()
            }
          }
          uiStyle.textContent = CSS
          document.head.appendChild(uiStyle)
          document.head.appendChild(glassStyle)
          return () => {
            releaseTokens?.()
            releaseTokens = undefined
            uiStyle.remove()
            glassStyle.remove()
            const root = document.documentElement
            root.removeAttribute(BACKDROP_ATTR)
          }
        },
        /** 接上 settings 表單（由 ctx.inject(['configForms']) 提供）。 */
        attach(scope) {
          const adopt = () => {
            const snapshot = scope.getSnapshot()
            const value = snapshot !== null && typeof snapshot === 'object' ? snapshot.value : undefined
            if (snapshot.status === 'ready' && value !== undefined && value !== null) {
              serverValues = normalize(value)
              preview = {}
            }
            publish({
              status: snapshot.status,
              value,
              // 宿主真正有服務的欄位。改過 Host 半的 Config 之後、DSH 還沒重啟時，
              // 新欄位不會出現在投影裡 —— 這時候 UI 必須說實話，而不是讓寫入失敗。
              served:
                value !== undefined && value !== null && typeof value === 'object'
                  ? Object.keys(value)
                  : undefined,
              writable: snapshot.writable === true,
              revision: snapshot.revision,
              overridden:
                snapshot.user !== undefined &&
                snapshot.user !== null &&
                FIELDS.some((field) =>
                  Object.hasOwn(snapshot.user, field),
                ),
            })
            paint()
          }
          const release = scope.subscribe(adopt)
          adopt()
          return release
        },
        /** 立即預覽（拖動中），不寫 Host。 */
        preview(field, value) {
          preview = { ...preview, [field]: value }
          paint()
        },
        /** 清掉預覽，回到 Host 的值。 */
        clearPreview() {
          if (Object.keys(preview).length === 0) return
          preview = {}
          paint()
        },
        /** 寫入 Host（一次拖動結束才呼叫，避免每個 pixel 一次寫）。 */
        async commit(field, value) {
          const scope = this.scope
          if (scope === undefined) return false
          this.preview(field, value)
          let accepted = false
          try {
            accepted = (await scope.set(field, value)) === true
          } catch (error) {
            console.error('[appearance-glass] settings write failed:', error)
            accepted = false
          }
          this.clearPreview()
          return accepted
        },
        /** 一次寫入多個欄位（壁紙預設組用）：有原子 mutate 就用，沒有才逐一寫。 */
        async setAll(patch) {
          const scope = this.scope
          if (scope === undefined) return false
          preview = { ...preview, ...patch }
          paint()
          let accepted = false
          try {
            if (typeof scope.mutate === 'function') {
              const ops = Object.entries(patch).map(([field, value]) => ({
                op: 'set',
                path: [field],
                value,
              }))
              accepted = (await scope.mutate(ops)) === true
            } else {
              for (const [field, value] of Object.entries(patch)) {
                accepted = (await scope.set(field, value)) === true
              }
            }
          } catch (error) {
            console.error('[appearance-glass] settings batch write failed:', error)
            accepted = false
          }
          this.clearPreview()
          return accepted
        },
        /**
         * 全部欄位回到預設（清掉本外掛在 profile 的覆寫）。
         * 只清宿主真的有的欄位（剛新增、還沒重啟的欄位若一併寫入，settings 服務
         * 會整批拒絕，等於連舊欄位都重設不了），並且優先走一次原子 mutate。
         */
        async reset() {
          const scope = this.scope
          if (scope === undefined) return false
          const snapshot = scope.getSnapshot()
          const value = snapshot.value
          const served =
            value !== undefined && value !== null && typeof value === 'object' ? Object.keys(value) : FIELDS
          const fields = FIELDS.filter((name) => served.includes(name))
          let accepted = false
          try {
            if (typeof scope.mutate === 'function') {
              accepted =
                (await scope.mutate(fields.map((field) => ({ op: 'unset', path: [field] })))) === true
            } else {
              for (const field of fields) accepted = (await scope.unset(field)) === true
            }
          } catch (error) {
            console.error('[appearance-glass] settings reset failed:', error)
            accepted = false
          }
          this.clearPreview()
          return accepted
        },
        /**
         * 深淺色切換時重繪一次：玻璃 CSS 自己用 `:has(body[data-ds-dark-theme])`
         * 分派、不需要重畫，但色票上顯示的「跟隨深淺色」有效色會變，
         * 所以要讓訂閱者收到一次新快照。
         */
        watchScheme() {
          if (typeof ctx.on !== 'function') return
          let last
          ctx.on('theme/change', (snapshot) => {
            // 事件帶的主題快照比 DOM 屬性可靠（presenter 可能還沒寫 data-ds-dark-theme）。
            const scheme =
              snapshot !== null && typeof snapshot === 'object' && snapshot.active !== undefined
                ? snapshot.active.colorScheme
                : isDarkScheme()
                  ? 'dark'
                  : 'light'
            // 自己的 overrideTokens 也會發 theme/change —— 深淺色沒變就不必重繪。
            if (scheme === last) return
            last = scheme
            publish({})
          })
        },
        /**
         * 寫入結果的回報口。元件掛載時會換成 setState；卸載時**還原成 no-op**
         * 而不是 undefined —— 事件回呼裡的 `engine.report(...)` 就永遠不會炸。
         */
        report() {},
        /** 目前生效設定。 */
        current: effective,
        scope: undefined,
        paint,
      }
    }

    // ── 文案 ──────────────────────────────────────────────────────────────
    /** 簡體中文：DSH 內建的 `zh` 就是簡體，用語對齊官方（界面／侧栏／预设／默认…）。 */
    const zh = {
      'section.nav': '界面外观',
      'appearance.title': '界面外观',
      'appearance.desc': '把面板调淡，就能透出桌面或壁纸；四个区域各自调整。',
      'enabled': '启用',
      'disabledNotice': '目前已停用：面板保持 DSH 原本的不透明度。打开标题栏的「启用」就会应用下面的设置。',
      'fields.needsRestart': '这一版新增了设置字段，要重启 DSH 才会生效（置灰的控件就是还没生效的那些；插件的 Host 半没有热重载）。',
      'opacity.title': '界面不透明度',
      'opacity.sync': '同步',
      'opacity.syncHint': '把「主界面」的值应用到其他三项',
      'opacity.hint': '数值是「合成后」的不透明度：滑杆写 20% 就真的看到 20%（有些底色叠了好几层，这里已经换算过）。越低越能看见桌面或壁纸。',
      'opacityBase': '主界面',
      'opacitySidebar': '侧栏',
      'opacitySurface': '卡片／输入框',
      'opacityOverlay': '菜单／浮层',
      'backdrop.title': '透视背景',
      'backdrop': '背景',
      'backdrop.auto': '自动',
      'backdrop.wallpaper': '内置壁纸',
      'backdrop.none': '纯透明',
      'backdrop.desc': '决定面板后面透出来的是什么。「自动」＝桌面版用系统窗口材质（macOS 会把桌面模糊掉），其他环境铺内置壁纸。',
      'wallpaper.title': '内置壁纸',
      'wallpaper.desc': '三个色块 ＋ 底色与强度；底色「跟随深浅色」＝浅色淡蓝、深色近黑。',
      'wallpaper.inactive': '目前「背景」不是内置壁纸，这里的颜色不会显示。',
      'wallpaper.needsRestart': '这一区的字段还没生效：要重启 DSH（插件的 Host 半没有热重载）。',
      'wallpaper.preview': '预览',
      'wallpaper.previewText': '主面板与卡片',
      'wallpaper.previewMenu': '菜单',
      'wallpaper.presets': '配色',
      'wallpaper.blobs': '色块',
      'wallpaper.a': '色块 1',
      'wallpaper.b': '色块 2',
      'wallpaper.c': '色块 3',
      'wallpaper.base': '底色',
      'wallpaper.baseAuto': '跟随深浅色',
      'wallpaper.strength': '强度',
      'preset.aurora': '极光',
      'preset.ocean': '深海',
      'preset.sunset': '日落',
      'preset.forest': '森林',
      'preset.graphite': '石墨',
      'overridden': '本 profile 已自定义',
      'reset': '恢复默认',
      'resetDone': '已恢复默认',
      'resetFailed': '重置失败',
      'saved': '已应用',
      'failed': '没有接受这次写入',
      'readOnly': '本设置是只读的',
      'unavailable': '插件尚未加载或设置服务不可用，暂时无法调整。',
    }
    /** 繁體中文：DSH 的內建 zh 是簡體，所以繁體走「語言包」而不是內建 zh。 */
    const zhHant = {
      'section.nav': '介面外觀',
      'appearance.title': '介面外觀',
      'appearance.desc': '把面板調淡，就會透出桌面或壁紙；四個分區各自調整。',
      'enabled': '啟用',
      'disabledNotice': '目前已停用：面板維持 DSH 原本的不透明度。把標題列的「啟用」打開就會套用下面的設定。',
      'fields.needsRestart': '這一版有新增的設定欄位，要重啟 DSH 才會生效（反白的控制項就是還沒生效的那些；外掛的 Host 半沒有熱重載）。',
      'opacity.title': '介面不透明度',
      'opacity.sync': '同步',
      'opacity.syncHint': '把「主畫面」的值套用到其他三項',
      'opacity.hint': '數值是「合成後」的不透明度：滑桿寫 20% 就是真的看到 20%（有些底色被疊了好幾層，這裡已經換算過）。越低越能看見桌面或壁紙。',
      'opacityBase': '主畫面',
      'opacitySidebar': '側欄',
      'opacitySurface': '卡片／輸入框',
      'opacityOverlay': '選單／浮層',
      'backdrop.title': '透視背景',
      'backdrop': '背景',
      'backdrop.auto': '自動',
      'backdrop.wallpaper': '內建壁紙',
      'backdrop.none': '純透明',
      'backdrop.desc': '決定面板後面透出來的是什麼。「自動」＝桌面版用系統視窗材質（macOS 會把桌面模糊掉），其他環境鋪內建壁紙。',
      'wallpaper.title': '內建壁紙',
      'wallpaper.desc': '三個色斑 ＋ 底色與強度；底色「跟隨深淺色」＝淺色淡藍、深色近黑。',
      'wallpaper.inactive': '目前「背景」不是內建壁紙，這裡的顏色不會顯示。',
      'wallpaper.needsRestart': '這一區的欄位還沒生效：要重啟 DSH（外掛的 Host 半沒有熱重載）。',
      'wallpaper.preview': '預覽',
      'wallpaper.previewText': '主面板與卡片',
      'wallpaper.previewMenu': '選單',
      'wallpaper.presets': '配色',
      'wallpaper.blobs': '色斑',
      'wallpaper.a': '色斑 1',
      'wallpaper.b': '色斑 2',
      'wallpaper.c': '色斑 3',
      'wallpaper.base': '底色',
      'wallpaper.baseAuto': '跟隨深淺色',
      'wallpaper.strength': '強度',
      'preset.aurora': '極光',
      'preset.ocean': '深海',
      'preset.sunset': '日落',
      'preset.forest': '森林',
      'preset.graphite': '石墨',
      'overridden': '本 profile 已自訂',
      'reset': '恢復預設',
      'resetDone': '已恢復預設',
      'resetFailed': '重設失敗',
      'saved': '已套用',
      'failed': '沒有接受這次寫入',
      'readOnly': '本設定是唯讀的',
      'unavailable': '外掛尚未載入或設定服務不可用，暫時無法調整。',
    }
    const en = {
      'section.nav': 'Interface appearance',
      'appearance.title': 'Interface appearance',
      'appearance.desc': 'Fade the panels to see the desktop or wallpaper through them; each of the four regions is independent.',
      'enabled': 'Enabled',
      'disabledNotice': 'Currently disabled: panels keep the stock DSH opacity. Switch “Enabled” on in the header to apply the settings below.',
      'fields.needsRestart': 'This build added config fields that need a DSH restart (the greyed-out controls are the ones not live yet — the plugin host half has no hot reload).',
      'opacity.title': 'Interface opacity',
      'opacity.sync': 'Sync',
      'opacity.syncHint': 'Copy the main-panel value to the other three regions',
      'opacity.hint': 'Values are the composited result: 20% really shows 20% (some backgrounds stack several layers, which is already compensated for). Lower reveals more of the desktop or wallpaper.',
      'opacityBase': 'Main panel',
      'opacitySidebar': 'Sidebar',
      'opacitySurface': 'Cards / inputs',
      'opacityOverlay': 'Menus / popovers',
      'backdrop.title': 'See-through backdrop',
      'backdrop': 'Backdrop',
      'backdrop.auto': 'Auto',
      'backdrop.wallpaper': 'Built-in wallpaper',
      'backdrop.none': 'Pure transparent',
      'backdrop.desc': 'What shows through behind the panels. “Auto” uses the native window material on desktop (macOS blurs the desktop) and the built-in wallpaper everywhere else.',
      'wallpaper.title': 'Built-in wallpaper',
      'wallpaper.desc': 'Three blobs, plus a base colour and strength. “Follow light/dark” uses pale blue in light mode, near-black in dark.',
      'wallpaper.inactive': 'The backdrop is not the built-in wallpaper right now, so these colours are not shown.',
      'wallpaper.needsRestart': 'The fields in this section are not live yet: restart DSH (the plugin host half has no hot reload).',
      'wallpaper.preview': 'Preview',
      'wallpaper.previewText': 'Panel and card',
      'wallpaper.previewMenu': 'Menu',
      'wallpaper.presets': 'Palette',
      'wallpaper.blobs': 'Blobs',
      'wallpaper.a': 'Blob 1',
      'wallpaper.b': 'Blob 2',
      'wallpaper.c': 'Blob 3',
      'wallpaper.base': 'Base',
      'wallpaper.baseAuto': 'Follow light/dark',
      'wallpaper.strength': 'Strength',
      'preset.aurora': 'Aurora',
      'preset.ocean': 'Deep sea',
      'preset.sunset': 'Sunset',
      'preset.forest': 'Forest',
      'preset.graphite': 'Graphite',
      'overridden': 'Customised in this profile',
      'reset': 'Reset to defaults',
      'resetDone': 'Defaults restored',
      'resetFailed': 'Reset failed',
      'saved': 'Applied',
      'failed': 'The write was rejected',
      'readOnly': 'Settings are read-only',
      'unavailable': 'The plugin is not loaded or has no settings service, so it cannot be configured yet.',
    }

    const CSS = [
      // 一般設定列（官方 .row 形狀）
      '.dsg-page{display:flex;flex-direction:column;width:100%}',
      '.dsg-page>:last-child,.dsg-card>:last-child{border-bottom:none}',
      '.dsg-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.dsg-rowText{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px}',
      '.dsg-title{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
      '.dsg-badge{flex:none;padding:1px 6px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}',
      '.dsg-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
      '.dsg-control{display:inline-flex;align-items:center;gap:8px;flex:none}',
      '.dsg-cardControl{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
      // 官方 selector pill
      '.dsg-selector{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}',
      '.dsg-selector:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsg-selector:disabled{opacity:.4;cursor:default}',
      '.dsg-selector:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.dsg-chevron{flex:none}',
      // 數值 pill：與官方 stepper 同高、同底、同字級
      '.dsg-sliderChip{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);height:36px;align-items:center;gap:12px;padding:0 14px;display:inline-flex}',
      '.dsg-slider{border:none;background:none;width:88px;height:20px;margin:0;accent-color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.dsg-slider:disabled{opacity:.4;cursor:default}',
      '.dsg-slider:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dsg-value{text-align:right;font-variant-numeric:tabular-nums;min-width:40px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}',
      // 外掛頁卡片（官方 fields.module.css 形狀）,
      '.dsg-line{display:flex;align-items:center;gap:10px}',
      '.dsg-lineLabel{flex:none;width:84px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dsg-preview{position:relative;display:flex;height:150px;padding:12px;overflow:hidden;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background-repeat:no-repeat;box-shadow:0 1px 2px 0 color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)}',
      '.dsg-previewFrame{display:flex;flex:1;gap:8px;min-width:0}',
      '.dsg-previewSide{position:relative;display:flex;flex-direction:column;flex:none;width:58px;padding:8px 6px;gap:6px;border-radius:var(--dsw-radius-md);background:var(--dsw-specific-sidebar-fill)}',
      '.dsg-previewSide>*{position:relative;z-index:1}',
      // 側欄的第二層（真實側欄也是兩層）：鋪滿整個側欄、壓在細列下面
      '.dsg-previewSideFill{position:absolute;inset:0;z-index:0;border-radius:inherit;background:var(--dsw-specific-sidebar-fill)}',
      '.dsg-previewNav{display:block;height:14px;border-radius:var(--dsw-radius-sm);background:var(--dsw-specific-sidebar-nav-item-active)}',
      '.dsg-previewMain{display:flex;flex-direction:column;justify-content:center;gap:8px;flex:1;min-width:0;padding:12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-base)}',
      '.dsg-previewCard{display:inline-flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}',
      '.dsg-previewDot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}',
      '.dsg-previewText{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}',
      '.dsg-previewMenu{position:absolute;top:20px;right:24px;padding:4px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-specific-menu);box-shadow:var(--dsw-elevation-panel);color:var(--dsw-alias-label-primary);font-size:11px;line-height:16px}',
      // 壁紙區：一列一個控制項，標籤對齊 84px 欄寬（與上面的四根滑桿同一條線）
      '.dsg-colorRow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}',
      '.dsg-colorPill{position:relative;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px 0 8px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);cursor:pointer}',
      '.dsg-colorPill:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsg-colorDot{flex:none;width:20px;height:20px;border-radius:50%;box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}',
      '.dsg-colorHex{color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;letter-spacing:.02em;font-variant-numeric:tabular-nums}',
      '.dsg-colorInput{position:absolute;inset:0;width:100%;height:100%;padding:0;border:none;margin:0;opacity:0;cursor:pointer}',
      '.dsg-colorPill:has(.dsg-colorInput:disabled){cursor:default;opacity:.45}',
      '.dsg-colorPill:has(.dsg-colorInput:focus-visible){outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.dsg-presetRow{display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px;min-width:0}',
      '.dsg-presetCard{display:flex;flex-direction:column;align-items:center;gap:6px;padding:0;border:none;background:none;font:inherit;cursor:pointer}',
      '.dsg-presetCard:disabled{cursor:default;opacity:.45}',
      '.dsg-presetFill{width:44px;height:44px;border-radius:var(--dsw-radius-md);box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent)}',
      '.dsg-presetCard[aria-pressed=true] .dsg-presetFill{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary),inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent)}',
      '.dsg-presetCard:focus-visible{outline:none}',
      '.dsg-presetCard:focus-visible .dsg-presetFill{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:3px}',
      '.dsg-presetName{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:14px}',
      '.dsg-presetCard[aria-pressed=true] .dsg-presetName{color:var(--dsw-alias-label-primary)}',
      '.dsg-presetCard:hover:not(:disabled) .dsg-presetName{color:var(--dsw-alias-label-secondary)}',
      '.dsg-previewBar{display:block;height:5px;border-radius:3px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent)}',
      '.dsg-previewBar.dsg-w60{width:60%}',
      '.dsg-previewBar.dsg-w80{width:80%}',
      '.dsg-previewBar.dsg-w40{width:40%}',
      '.dsg-auto{border:none;background:none;padding:2px 8px;border-radius:var(--dsw-radius-sm);font:inherit;font-size:12px;line-height:22px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dsg-auto[aria-pressed=true]{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary)}',
      '.dsg-auto:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
      '.dsg-auto:disabled{cursor:default;opacity:.4}',
      '.dsg-card{display:flex;flex-direction:column}',
      '.dsg-field{display:flex;flex-direction:column;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.dsg-fieldHead{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.dsg-switchLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dsg-previewSideFill{flex:1;border-radius:var(--dsw-radius-md);background:var(--dsw-specific-sidebar-fill)}',
      '.dsg-previewInner{display:flex;flex-direction:column;justify-content:center;gap:8px;flex:1;padding:10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base)}',
      '.dsg-fieldLabel{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}',
      '.dsg-hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.dsg-status{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.dsg-status[data-failed=true]{color:var(--dsw-alias-state-error-primary)}',
      '.dsg-reset{border:none;background:none;padding:0;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dsg-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
      '.dsg-reset:disabled{cursor:default;opacity:.4}',
    ].join('')

    // ── 設定側欄的導覽圖標（DSH 只給 label，圖標是 shell 硬編碼的） ──────────
    /**
     * 本外掛的導覽 glyph：16×16，沿用官方圖標的慣例 —— 父層 svg 已有
     * `fill="none"` 與 `stroke-width`（1.3），子元素只要 `stroke="currentColor"`
     * 就會跟著文字色與選取態變化。
     * 內容＝一個視窗（圓角矩形 ＋ 標題列一條線 ＋ 左上小點），
     * 讀作「介面面板」，也與旁邊 帳號／模型／外掛 的細筆畫風格一致。
     */
    const NAV_GLYPH_HTML =
      '<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="3.2" stroke="currentColor"/>' +
      '<path d="M2.4 6.1H13.6" stroke="currentColor"/>' +
      '<path d="M4.9 4.3H7.3" stroke="currentColor" stroke-linecap="round"/>'
    /** 換過的 svg 會帶這個標記，重複套用時不會覆蓋掉已保存的原樣。 */
    const NAV_MARK = 'data-dsh-ag-glyph'

    /**
     * 把設定側欄裡「本外掛那一列」的齒輪換成上面的 glyph。
     *
     * 為什麼要動 DOM：DSH 的側欄圖標是 shell 內的 `navIcon(id)` 硬編碼表
     * （只有 account / models / agent-presets / plugins / archived-sessions 五個
     * 有專屬圖標，其餘一律齒輪），而 `settings.section` 的註冊契約只有
     * `id` / `order` / `label`，沒有 icon 欄位。所以只能用導覽文字定位自己那一格。
     *
     * 三條紀律：
     *  1. 只動自己那一格（用本外掛的導覽文字比對，且只換該列的 <svg>）。
     *  2. 可完整還原（保存原始 innerHTML，卸載時放回）。
     *  3. fail-open（找不到、取不到、結構不同 → 什麼都不做；絕不 throw）。
     * 效能：只訂閱 body 的 childList（設定面板是 portal 到 body 的新子樹），
     * 不訂閱 subtree —— 串流訊息大量變動時不會被拖累。
     * @param labels - 本外掛導覽文字的所有語言版本。
     * @returns 還原用的 disposer。
     */
    function installNavGlyph(labels) {
      const doc = typeof document === 'undefined' ? undefined : document
      if (doc === undefined || typeof doc.querySelectorAll !== 'function') return () => {}
      const known = new Set(labels.filter((label) => typeof label === 'string' && label !== ''))
      /** svg 元素 → 原始 innerHTML。 */
      const saved = new Map()

      const paint = (root) => {
        let buttons
        try {
          buttons = (root ?? doc).querySelectorAll('button')
        } catch (_error) {
          return
        }
        for (const button of buttons ?? []) {
          if (!known.has((button.textContent ?? '').trim())) continue
          const svg = typeof button.querySelector === 'function' ? button.querySelector('svg') : null
          if (svg === null || svg === undefined) continue
          if (typeof svg.getAttribute === 'function' && svg.getAttribute(NAV_MARK) === '1') continue
          saved.set(svg, svg.innerHTML)
          if (typeof svg.setAttribute === 'function') svg.setAttribute(NAV_MARK, '1')
          svg.innerHTML = NAV_GLYPH_HTML
        }
      }

      paint()

      let observer
      if (typeof MutationObserver === 'function' && doc.body !== undefined && doc.body !== null) {
        observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes ?? []) {
              if (node !== null && node !== undefined && node.nodeType === 1) paint(node)
            }
          }
        })
        try {
          observer.observe(doc.body, { childList: true })
        } catch (_error) {
          observer = undefined
        }
      }

      return () => {
        if (observer !== undefined) observer.disconnect()
        for (const [svg, html] of saved) {
          try {
            svg.innerHTML = html
          } catch (_error) {
            /* 節點已被回收 —— 沒有東西要還原 */
          }
          if (typeof svg.removeAttribute === 'function') svg.removeAttribute(NAV_MARK)
        }
        saved.clear()
      }
    }

    // ── 控制項（一律用官方元件與官方形狀組出來） ──────────────────────────
    /**
     * 建立設定面板元件。設定側欄的專屬頁與外掛頁的卡片**共用同一份**，
     * 只有最外層的容器 class 不同（`.dsg-page` / `.dsg-card`）。
     * @param engine - 由 createEngine 回傳的引擎。
     * @param variant - `'page'` 或 `'card'`。
     * @returns React 元件。
     */
    function panelComponent(engine, variant) {
      /**
       * 官方 selector pill（`ui-conversation` EnterBehaviorRow 的形狀）：36px 高、
       * `--dsw-radius-md`、`--dsw-alias-bg-module-platform` 底，開官方 `Menu`。
       * 取不到 primitives 時退化成同形狀的原生 `<select>`。
       */
      function SelectPill(props) {
        const { labelKey, options, current, disabled, t, onPick } = props
        const [open, setOpen] = React.useState(false)
        if (primitives === undefined || typeof primitives.Menu !== 'function') {
          return h(
            'select',
            {
              className: 'dsg-selector',
              value: current,
              disabled,
              'aria-label': t(labelKey),
              onChange: (event) => onPick(event.currentTarget.value),
            },
            options.map((option) => h('option', { key: option, value: option }, t(`${labelKey}.${option}`))),
          )
        }
        return h(primitives.Menu, {
          open,
          onClose: () => setOpen(false),
          items: options.map((option) => ({ id: option, label: t(`${labelKey}.${option}`) })),
          selectedId: current,
          onSelect: (id) => {
            setOpen(false)
            onPick(id)
          },
          align: 'end',
          portal: true,
          anchor: h(
            'button',
            {
              type: 'button',
              className: 'dsg-selector',
              'aria-haspopup': 'menu',
              'aria-expanded': open,
              disabled,
              onClick: () => {
                if (disabled) return
                setOpen((value) => !value)
              },
            },
            t(`${labelKey}.${current}`),
            h(primitives.IconChevronDownOutlineRegular, { className: 'dsg-chevron' }),
          ),
        })
      }

      /**
       * 數值 pill：與官方 FontSizeRow 的 stepper 同高（36px）、同底、同字級。
       * 拖動中即時預覽、**放手才寫入 Host**（React 的 onChange 對 range input
       * 等同 DOM 的 input 事件，每一格都會觸發，所以提交點放在
       * pointerup / keyup / blur）。
       */
      function NumberPill(props) {
        const { labelKey, field, min, max, step, unit, current, committed, disabled, t } = props
        const pending = React.useRef(null)
        const commitPending = () => {
          const value = pending.current
          pending.current = null
          if (value === null) return
          if (value === committed) {
            engine.clearPreview()
            return
          }
          void engine.commit(field, value).then(engine.report)
        }
        return h(
          'div',
          { className: 'dsg-sliderChip' },
          h('input', {
            type: 'range',
            className: 'dsg-slider',
            min,
            max,
            step,
            value: current,
            disabled,
            'aria-label': t(labelKey),
            onInput: (event) => {
              const value = Number(event.currentTarget.value)
              pending.current = value
              engine.preview(field, value)
            },
            onPointerUp: commitPending,
            onKeyUp: commitPending,
            onBlur: commitPending,
          }),
          h('span', { className: 'dsg-value' }, `${current}${unit}`),
        )
      }

      /**
       * 色票：`<input type="color">` 放在官方 pill 尺寸裡（36px、radius-md、
       * bg-module-platform），點下去開系統調色盤。顏色是離散值，直接寫入。
       */
      /**
       * 顏色選取：一顆 pill（色點 ＋ hex）＋ 疊在上面的原生 <input type="color">。
       * 原生 input 完全透明、鋪滿整顆 pill，所以點哪裡都會開系統色盤，
       * 但外觀是我們自己的（原生色票在不同平台長得差很多，撐不起這個面板）。
       */
      function ColorPill(props) {
        const { labelKey, field, value, disabled, t, suffix } = props
        return h(
          'label',
          { className: 'dsg-colorPill' },
          h('span', { className: 'dsg-colorDot', style: { background: value } }),
          h(
            'span',
            { className: 'dsg-colorHex' },
            suffix === undefined ? value.toUpperCase() : suffix,
          ),
          h('input', {
            type: 'color',
            className: 'dsg-colorInput',
            value,
            disabled,
            'aria-label': t(labelKey),
            onChange: (event) => {
              void engine.commit(field, event.currentTarget.value).then(engine.report)
            },
          }),
        )
      }

      /** 配色預設卡：44px 的漸層方塊 ＋ 名稱；命中時外圍一圈 focus 藍。 */
      function PresetCard(props) {
        const { preset, active, disabled, t, onPick } = props
        return h(
          'button',
          {
            type: 'button',
            className: 'dsg-presetCard',
            'aria-pressed': active,
            disabled,
            title: t(`preset.${preset.id}`),
            onClick: () => onPick(preset),
          },
          h('span', {
            className: 'dsg-presetFill',
            style: {
              backgroundImage: wallpaperLayers({
                a: preset.a,
                b: preset.b,
                c: preset.c,
                base: preset.base,
                strength: 62,
              }).join(','),
            },
          }),
          h('span', { className: 'dsg-presetName' }, t(`preset.${preset.id}`)),
        )
      }


      return function AppearancePanel(props) {
        const t = typeof props.t === 'function' ? props.t : (key) => key
        const state = React.useSyncExternalStore(engine.subscribe, engine.read, engine.read)
        /** 最近一次寫入的結果：'saved' | 'failed' | null（顯示在標題列）。 */
        const [outcome, setOutcome] = React.useState(null)
        /** 「恢復預設」按鈕自己的即時回饋（2.4 秒後回標籤）。 */
        const [resetOutcome, setResetOutcome] = React.useState(null)
        React.useEffect(() => {
          if (resetOutcome === null) return undefined
          const timer = setTimeout(() => setResetOutcome(null), 2400)
          return () => clearTimeout(timer)
        }, [resetOutcome])
        React.useEffect(() => {
          // 引擎把寫入結果（boolean）回報到這裡；元件卸載時就停止回報，
          // 並清掉還沒提交的預覽值（例如拖到一半就關掉設定頁）。
          engine.report = (accepted) => {
            setOutcome(accepted === true ? 'saved' : 'failed')
          }
          return () => {
            engine.report = () => {}
            engine.clearPreview()
          }
        }, [])

        if (state.status === 'unavailable') {
          return h('p', { className: 'dsg-hint' }, t('unavailable'))
        }
        const settings = state.effective
        const committed = normalize(state.value)
        const ready = state.status === 'ready' && state.writable === true
        // 宿主還沒重啟時，新增的欄位不在投影裡。**每一個控制項各自判斷**，
        // 沒有被服務的就停用，而不是讓使用者按了才發現寫不進去。
        const isServed = (field) => state.served === undefined || state.served.includes(field)
        const needsRestart =
          state.served !== undefined && FIELDS.some((field) => !state.served.includes(field))
        const off = settings.enabled !== true
        const disabled = !ready || off
        const wallpaperServed = [
          'wallpaperA',
          'wallpaperB',
          'wallpaperC',
          'wallpaperBase',
          'wallpaperStrength',
        ].every(isServed)
        const wallpaperDisabled = disabled || !wallpaperServed
        const write = (field, value) => {
          void engine.commit(field, value).then(engine.report)
        }
        const autoText = t('wallpaper.baseAuto')
        const effectiveBase = effectiveColor('wallpaperBase', settings.wallpaperBase)
        const effectiveBlob = (field) => effectiveColor(field, settings[field])
        /**
         * 目前命中的配色預設：**逐欄位比對原始值**（大小寫不敏感）。
         * 預設值是 'auto'（出廠配色、跟隨深淺色），它不等於任何一組固定預設，
         * 所以剛裝好時五張卡都不會被圈起來 —— 使用者一旦選過某一組，圈就會出現在那組上。
         */
        const activePresetId = (() => {
          const same = (left, right) =>
            typeof left === 'string' && left.toUpperCase() === right.toUpperCase()
          const hit = WALL_PRESETS.find(
            (preset) =>
              same(settings.wallpaperA, preset.a) &&
              same(settings.wallpaperB, preset.b) &&
              same(settings.wallpaperC, preset.c) &&
              same(settings.wallpaperBase, preset.base),
          )
          return hit === undefined ? undefined : hit.id
        })()
        const blobSwatch = (field, labelKey) =>
          h(ColorPill, {
            key: field,
            labelKey,
            field,
            value: effectiveBlob(field),
            disabled: wallpaperDisabled,
            t,
            suffix: settings[field] === 'auto' ? autoText : settings[field].toUpperCase(),
          })

        /** 一列：標籤在左、pill 在右（一列一個控制項）。 */
        const sliderLine = (key, labelKey, pill) =>
          h(
            'div',
            { className: 'dsg-line', key },
            h('span', { className: 'dsg-lineLabel' }, t(labelKey)),
            pill,
          )

        /** 標題列：標題／說明在左，啟用開關＋狀態＋恢復預設在右。 */
        const header = h(
          'div',
          { className: 'dsg-row' },
          h(
            'div',
            { className: 'dsg-rowText' },
            h(
              'div',
              { className: 'dsg-title' },
              h('span', null, t('appearance.title')),
              state.overridden ? h('span', { className: 'dsg-badge' }, t('overridden')) : null,
            ),
            h(
              'div',
              { className: 'dsg-desc' },
              needsRestart ? t('fields.needsRestart') : t('appearance.desc'),
            ),
          ),
          h(
            'div',
            { className: 'dsg-control' },
            state.writable !== true
              ? h('span', { className: 'dsg-status' }, t('readOnly'))
              : outcome !== null
                ? h(
                    'span',
                    {
                      className: 'dsg-status',
                      'data-failed': outcome === 'failed' ? 'true' : 'false',
                      role: 'status',
                    },
                    outcome === 'saved' ? t('saved') : t('failed'),
                  )
                : null,
            h('span', { className: 'dsg-switchLabel' }, t('enabled')),
            primitives !== undefined && typeof primitives.Switch === 'function'
              ? h(primitives.Switch, {
                  checked: settings.enabled === true,
                  disabled: !ready,
                  label: t('enabled'),
                  onChange: (next) => write('enabled', next === true),
                })
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsg-auto',
                    'aria-pressed': settings.enabled === true,
                    disabled: !ready,
                    onClick: () => write('enabled', settings.enabled !== true),
                  },
                  t('enabled'),
                ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsg-reset',
                disabled: !ready,
                onClick: () => {
                  void engine.reset().then((accepted) => {
                    setResetOutcome(accepted === true ? 'done' : 'failed')
                    engine.report(accepted)
                  })
                },
              },
              resetOutcome === 'done'
                ? t('resetDone')
                : resetOutcome === 'failed'
                  ? t('resetFailed')
                  : t('reset'),
            ),
          ),
        )

        /** 介面不透明度：四個分區各一根，數值是合成後的目標。 */
        const opacitySlider = (key, labelKey) =>
          sliderLine(
            key,
            labelKey,
            h(NumberPill, {
              key,
              labelKey,
              field: key,
              min: NUMBER_FIELDS[key][0],
              max: NUMBER_FIELDS[key][1],
              step: 1,
              unit: '%',
              current: settings[key],
              committed: committed[key],
              disabled: disabled || !isServed(key),
              t,
            }),
          )
        const syncValues = () => {
          void engine
            .setAll({
              opacitySidebar: settings.opacityBase,
              opacitySurface: settings.opacityBase,
              opacityOverlay: settings.opacityBase,
            })
            .then(engine.report)
        }
        const opacityField = h(
          'div',
          { className: 'dsg-field' },
          h(
            'div',
            { className: 'dsg-fieldHead' },
            h('div', { className: 'dsg-fieldLabel' }, t('opacity.title')),
            h(
              'button',
              {
                type: 'button',
                className: 'dsg-reset',
                disabled: disabled || !isServed('opacitySidebar'),
                title: t('opacity.syncHint'),
                onClick: syncValues,
              },
              t('opacity.sync'),
            ),
          ),
          opacitySlider('opacityBase', 'opacityBase'),
          opacitySlider('opacitySidebar', 'opacitySidebar'),
          opacitySlider('opacitySurface', 'opacitySurface'),
          opacitySlider('opacityOverlay', 'opacityOverlay'),
          h('p', { className: 'dsg-hint' }, t('opacity.hint')),
        )

        /** 透視背景：決定面板後面透出來的是什麼。 */
        const backdropField = h(
          'div',
          { className: 'dsg-field' },
          h('div', { className: 'dsg-fieldLabel' }, t('backdrop.title')),
          h(
            'div',
            { className: 'dsg-cardControl' },
            h(SelectPill, {
              key: 'backdrop',
              labelKey: 'backdrop',
              options: BACKDROPS,
              current: settings.backdrop,
              disabled: disabled || !isServed('backdrop'),
              t,
              onPick: (value) => write('backdrop', value),
            }),
          ),
          h('p', { className: 'dsg-hint' }, t('backdrop.desc')),
        )

        /**
         * 即時預覽：一整塊 mock（側欄 + 主面板 + 卡片 + 浮動選單）。
         * 壁紙圖層用**和正式 CSS 同一個** wallpaperLayers()；四個 mock 表面直接
         * 用官方 token，而且**疊層數與真實介面一致**（主畫面 2 層、側欄 2 層、
         * 卡片 1 層、浮層 1 層），所以預覽看到的就是滑桿的合成結果。
         */
        const preview = h(
          'div',
          {
            className: 'dsg-preview',
            style: {
              backgroundImage: wallpaperLayers({
                a: effectiveBlob('wallpaperA'),
                b: effectiveBlob('wallpaperB'),
                c: effectiveBlob('wallpaperC'),
                base: effectiveBase,
                strength: settings.wallpaperStrength,
              }).join(','),
            },
          },
          h(
            'div',
            { className: 'dsg-previewFrame' },
            h(
              'div',
              { className: 'dsg-previewSide' },
              h('span', { className: 'dsg-previewBar dsg-w80' }),
              h('span', { className: 'dsg-previewBar dsg-w60' }),
              h('span', { className: 'dsg-previewNav' }),
              h('div', { className: 'dsg-previewSideFill' }),
            ),
            h(
              'div',
              { className: 'dsg-previewMain' },
              h(
                'div',
                { className: 'dsg-previewInner' },
                h(
                  'div',
                  { className: 'dsg-previewCard' },
                  h('span', { className: 'dsg-previewDot' }),
                  h('span', null, t('wallpaper.preview')),
                ),
                h('span', { className: 'dsg-previewText' }, t('wallpaper.previewText')),
              ),
            ),
          ),
          h('div', { className: 'dsg-previewMenu' }, t('wallpaper.previewMenu')),
        )

        /**
         * 內建壁紙：預覽 ＋ 四列（色斑／底色／強度／配色）。
         * 四列都用 `.dsg-line`（標籤固定在 84px 欄），所以整區的左緣與上面的
         * 四根不透明度滑桿完全對齊 —— 這是「整齊」的來源，不要改成自動排列。
         */
        const wallpaperRows = [
          h(
            'div',
            { className: 'dsg-line', key: 'blobs' },
            h('span', { className: 'dsg-lineLabel' }, t('wallpaper.blobs')),
            h(
              'div',
              { className: 'dsg-colorRow' },
              blobSwatch('wallpaperA', 'wallpaper.a'),
              blobSwatch('wallpaperB', 'wallpaper.b'),
              blobSwatch('wallpaperC', 'wallpaper.c'),
            ),
          ),
          h(
            'div',
            { className: 'dsg-line', key: 'base' },
            h('span', { className: 'dsg-lineLabel' }, t('wallpaper.base')),
            h(
              'div',
              { className: 'dsg-colorRow' },
              h(ColorPill, {
                key: 'wallpaperBase',
                labelKey: 'wallpaper.base',
                field: 'wallpaperBase',
                value: effectiveBase,
                disabled: wallpaperDisabled,
                t,
                suffix:
                  settings.wallpaperBase === 'auto' ? autoText : settings.wallpaperBase.toUpperCase(),
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsg-auto',
                  'aria-pressed': settings.wallpaperBase === 'auto',
                  disabled: wallpaperDisabled,
                  onClick: () => write('wallpaperBase', 'auto'),
                },
                autoText,
              ),
            ),
          ),
          h(
            'div',
            { className: 'dsg-line', key: 'strength' },
            h('span', { className: 'dsg-lineLabel' }, t('wallpaper.strength')),
            h(NumberPill, {
              key: 'wallpaperStrength',
              labelKey: 'wallpaper.strength',
              field: 'wallpaperStrength',
              min: NUMBER_FIELDS.wallpaperStrength[0],
              max: NUMBER_FIELDS.wallpaperStrength[1],
              step: 1,
              unit: '%',
              current: settings.wallpaperStrength,
              committed: committed.wallpaperStrength,
              disabled: wallpaperDisabled,
              t,
            }),
          ),
          h(
            'div',
            { className: 'dsg-line', key: 'presets' },
            h('span', { className: 'dsg-lineLabel' }, t('wallpaper.presets')),
            h(
              'div',
              { className: 'dsg-presetRow' },
              WALL_PRESETS.map((preset) =>
                h(PresetCard, {
                  key: preset.id,
                  preset,
                  active: activePresetId === preset.id,
                  disabled: wallpaperDisabled,
                  t,
                  onPick: (picked) => {
                    void engine
                      .setAll({
                        wallpaperA: picked.a,
                        wallpaperB: picked.b,
                        wallpaperC: picked.c,
                        wallpaperBase: picked.base,
                      })
                      .then(engine.report)
                  },
                }),
              ),
            ),
          ),
        ]

        const wallpaperField = h(
          'div',
          { className: 'dsg-field' },
          h('div', { className: 'dsg-fieldLabel' }, t('wallpaper.title')),
          preview,
          wallpaperRows,
          wallpaperServed
            ? resolvedBackdrop(settings) === 'wallpaper'
              ? null
              : h(
                  'p',
                  { className: 'dsg-status', 'data-failed': 'false', role: 'status' },
                  t('wallpaper.inactive'),
                )
            : h(
                'p',
                { className: 'dsg-status', 'data-failed': 'false', role: 'status' },
                t('wallpaper.needsRestart'),
              ),
          h('p', { className: 'dsg-hint' }, t('wallpaper.desc')),
        )

        return h(
          'div',
          { className: variant === 'card' ? 'dsg-card' : 'dsg-page' },
          header,
          off
            ? h(
                'p',
                { className: 'dsg-status', 'data-failed': 'false', role: 'status' },
                t('disabledNotice'),
              )
            : null,
          opacityField,
          backdropField,
          wallpaperField,
        )
      }
    }

    return {
      /**
       * 需要的 client 服務。`theme` 是 token 覆寫的提供者、`configForms` 是
       * 設定文件的讀寫面、`slots`/`locale` 是掛 UI 與文案的入口。
       */
      inject: ['theme', 'slots', 'locale', 'configForms'],

      /**
       * 瀏覽器外掛主體。
       * @param ctx - client cordis context。
       */
      apply(ctx) {
        const engine = createEngine(ctx)
        const Page = panelComponent(engine, 'page')
        const Card = panelComponent(engine, 'card')

        // 唯一的 <style>：隨外掛卸載一起移除（fiber-owned effect）。
        ctx.effect(() => engine.mountStyle(), 'appearance-glass: stylesheet')

        ctx.effect(
          () => ctx.locale.register(LOCALE_NS, { zh, en }),
          'appearance-glass: dictionaries',
        )
        /**
         * 繁體中文是「語言包」而不是內建 locale：DSH 內建的 `zh` 是簡體，
         * 所以繁體走 `locale.addLanguage` + 逐語言的字典註冊（官方 README 的
         * 「Registering a language pack」寫法）。兩個呼叫都 fail-open：
         * 舊版 locale 服務沒有這些方法時，外掛只在簡體／英文之間切換。
         */
        ctx.effect(() => {
          const disposers = []
          try {
            if (typeof ctx.locale.addLanguage === 'function') {
              disposers.push(
                ctx.locale.addLanguage({ id: 'zh-Hant', label: '繁體中文', fallback: 'zh' }),
              )
            }
            if (typeof ctx.locale.register === 'function') {
              disposers.push(ctx.locale.register(LOCALE_NS, 'zh-Hant', zhHant))
            }
          } catch (error) {
            console.warn('[appearance-glass] zh-Hant language pack unavailable:', error)
          }
          return () => {
            for (const dispose of disposers) {
              if (typeof dispose === 'function') dispose()
            }
          }
        }, 'appearance-glass: zh-Hant language pack')

        // 先畫一次預設值：設定文件是非同步抵達的，這一步讓開機就有玻璃，
        // 之後 adopt() 會以 Host 的值覆蓋（同值時 paint 會自行跳過）。
        engine.paint()

        engine.watchScheme()

        const scope = ctx.configForms.get(ENTRY_NS)
        engine.scope = scope
        ctx.effect(() => engine.attach(scope), 'appearance-glass: settings scope')

        // 設定側欄那一列的齒輪換成自己的 glyph（DSH 沒有 icon 欄位可宣告）。
        ctx.effect(
          // 三種語言的導覽文字都要認：切語言後 React 會重畫那一列，
          // 只認一種語言的畫，換語言就會變成找不到、齒輪又回來。
          () => installNavGlyph([zh['section.nav'], zhHant['section.nav'], en['section.nav']]),
          'appearance-glass: sidebar glyph',
        )

        // 專屬設定頁（設定側欄的一個頁籤）：官方 settings.section 的形狀 ——
        // id 決定導覽項目、label 是導覽文字（thunk，跟隨語言）、內容自己畫。
        const t = ctx.locale.bind(LOCALE_NS)
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'appearance-glass',
              order: 5,
              label: () => t('section.nav'),
              locale: LOCALE_NS,
            },
            Page,
          ),
        )
        // 外掛頁上的一張卡片（keyed by bundle 的套件名）：官方慣例的外掛設定面。
        ctx.slots.inject('plugins.bundle.config', () =>
          ctx.slots.register(
            { name: 'plugins.bundle.config', key: PACKAGE_NAME, locale: LOCALE_NS },
            Card,
          ),
        )
      },
    }
  },
})
