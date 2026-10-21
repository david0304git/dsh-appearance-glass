/* 介面 mock + 外掛同一套 alpha 模型（layerAlpha / surfaceAlpha 的簡化版） */
const WALL_BLOBS = {
  aurora: { a: '#94c4ff', b: '#ffa6d6', c: '#967aff', base: '#0b0f1c' },
  ocean: { a: '#5ec8ff', b: '#3f7bff', c: '#22d3ee', base: '#061426' },
  sunset: { a: '#ffb26b', b: '#ff7aa8', c: '#c084fc', base: '#241019' },
  forest: { a: '#9ede73', b: '#39a06b', c: '#d9f99c', base: '#0c1a13' },
  graphite: { a: '#8ea0b8', b: '#5b6472', c: '#a8b3c4', base: '#14161a' },
}
/** 合成目標 → 單層 alpha（與外掛的 layerAlpha 同式）。 */
const layerAlpha = (target, depth) => 1 - Math.pow(1 - target / 100, 1 / depth)
function wallpaperLayers({ a, b, c, base, strength = 58 }) {
  const soft = Math.max(10, Math.round(strength * 0.85))
  return [
    `radial-gradient(120% 90% at 6% 2%, color-mix(in srgb, ${a} ${strength}%, transparent) 0%, transparent 58%)`,
    `radial-gradient(115% 95% at 94% 6%, color-mix(in srgb, ${b} ${soft}%, transparent) 0%, transparent 60%)`,
    `radial-gradient(135% 115% at 58% 104%, color-mix(in srgb, ${c} ${strength}%, transparent) 0%, transparent 62%)`,
    `linear-gradient(158deg, ${base} 0%, ${base} 45%, color-mix(in srgb, ${base} 86%, white) 100%)`,
  ].join(',')
}
function applyWallpaper(node, colors) {
  node.style.backgroundImage = wallpaperLayers(colors)
}
/** 設定四個分區的「合成後」目標（%），換算成單層 alpha 寫進 CSS 變數。 */
function applyOpacity(app, { base, side, surface, overlay }) {
  app.style.setProperty('--a-base', `${(layerAlpha(base, 2) * 100).toFixed(1)}%`)
  app.style.setProperty('--a-side', `${(layerAlpha(side, 1.4) * 100).toFixed(1)}%`)
  app.style.setProperty('--a-sur', `${(layerAlpha(surface, 1) * 100).toFixed(1)}%`)
  app.style.setProperty('--a-ove', `${(layerAlpha(overlay, 1) * 100).toFixed(1)}%`)
}
const APP_HTML = `
  <div class="side">
    <div class="brand"><i></i><span>DeepSeek Harness</span></div>
    <div class="search">Search conversations</div>
    <div class="row on"><span class="dot"></span><span class="t">Plugin packaging plan</span></div>
    <div class="row"><span class="dot"></span><span class="t">Refactor the settings page</span></div>
    <div class="row"><span class="dot"></span><span class="t">Release checklist</span></div>
    <div class="row"><span class="dot"></span><span class="t">Wallpaper palettes</span></div>
    <div class="row"><span class="dot"></span><span class="t">Icon exploration</span></div>
    <div class="row"><span class="dot"></span><span class="t">Market submission</span></div>
    <div class="spacer"></div>
    <div class="foot"><span class="dot"></span><span>8 sessions · desktop</span></div>
  </div>
  <div class="main">
    <div class="inner">
      <div class="head">
        <div class="h-title">Plugin packaging plan</div>
        <div class="h-right">
          <span class="pill accent">deepseek-flash</span>
          <span class="pill">Settings</span>
        </div>
      </div>
      <div class="msgs">
        <div class="msg user">
          <div class="av"></div>
          <div class="bubble">Make the panels translucent.</div>
        </div>
        <div class="msg">
          <div class="av"></div>
          <div class="bubble">
            Done — it overrides the surface tokens, so the window material shows through.
            <div class="code">
              <div class="tok"><span class="s">--dsw-alias-bg-base</span><b>43%</b></div>
              <div class="tok"><span class="s">--dsw-specific-input-major</span><b>68%</b></div>
              <div class="tok"><span class="s">--dsw-menu-surface-fill</span><b>86%</b></div>
            </div>
            <div class="tool">▸ 44 checks passed · no backdrop-filter added</div>
          </div>
        </div>
      </div>
      <div class="composer">
        <span class="ph">Reply to the agent…</span>
        <span class="send"></span>
      </div>
    </div>
    <div class="menu" id="floatMenu" style="right:26px;top:52px">
      <div class="mi on"><span>Appearance</span><span>⌘,</span></div>
      <div class="mi"><span>Model</span><span></span></div>
      <div class="mi"><span>Settings</span><span></span></div>
    </div>
    <div class="card" id="floatCard">
      <div class="ct">Interface appearance</div>
      <div class="cl">Main panel 20% · sidebar 55%</div>
      <div class="bar"></div><div class="bar b2"></div>
    </div>
  </div>`
function buildApp(host, { menu = true, card = false } = {}) {
  host.innerHTML = `<div class="app" style="--a-base:100%;--a-side:100%;--a-sur:100%;--a-ove:100%">${APP_HTML}</div>`
  const app = host.querySelector('.app')
  if (!menu) app.querySelector('#floatMenu')?.remove()
  if (!card) app.querySelector('#floatCard')?.remove()
  return app
}
