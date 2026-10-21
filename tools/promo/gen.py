HEAD = '''<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="stage.css"><link rel="stylesheet" href="app.css">
{extra_css}
</head>
<body>
<div class="stage" id="stage">
  <div class="bg"><div class="bg-base"></div><div class="blob a"></div><div class="blob b"></div><div class="blob c"></div><div class="vignette"></div></div>
{body}
  <div class="caption" id="cap"><div class="zh" id="czh">{zh}</div><div class="en2" id="cen">{en}</div></div>
</div>
<script src="app.js"></script>
<script>
window.__duration = {duration}
const $ = (id) => document.getElementById(id)
const ease = (x) => {{ x = Math.max(0, Math.min(1, x)); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x+2,3)/2 }}
const ramp = (t,a,b) => ease((t-a)/(b-a))
const lerp = (a,b,k) => a + (b-a) * k
{script}
</script></body></html>
'''

def scene(name, duration, body, script, zh, en, extra_css=''):
    html = HEAD.format(duration=duration, body=body, script=script, zh=zh, en=en, extra_css=extra_css)
    open(f'scene{name}.html', 'w', encoding='utf-8').write(html)
    print('wrote', name, duration, 's')

FRAME = '''  <div class="frame" id="frame" style="left:56px;top:44px;width:566px;height:430px">
    <div class="wall" id="wall"></div><div class="clip" id="host"></div>
  </div>'''

def ctrl_placeholder(x=648, y=44, w=256):
    return f'  <div class="ctrl" id="ctrl" style="left:{x}px;top:{y}px;width:{w}px"></div>'

def slider_pair():
    return '''
    <div class="h"><span>Interface appearance</span><span class="badge">live</span></div>
    <div class="row"><div class="lab"><span>Main panel</span><b><span id="v-base">68</span>%</b></div>
      <div class="track"><div class="fill" id="f-base"></div><div class="knob" id="k-base"></div></div></div>
    <div class="row"><div class="lab"><span>Sidebar</span><b><span id="v-side">68</span>%</b></div>
      <div class="track"><div class="fill" id="f-side"></div><div class="knob" id="k-side"></div></div></div>
    <div class="row"><div class="lab"><span>Cards / inputs</span><b><span id="v-sur">68</span>%</b></div>
      <div class="track"><div class="fill" id="f-sur"></div><div class="knob" id="k-sur"></div></div></div>
    <div class="row" style="margin-bottom:8px"><div class="lab"><span>Menus / popovers</span><b><span id="v-ove">72</span>%</b></div>
      <div class="track"><div class="fill" id="f-ove"></div><div class="knob" id="k-ove"></div></div></div>
    <div class="hint">Slider value = <b style="color:#c9d3e6">composited</b> opacity.</div>'''

# ── scene03：四個分區各自獨立 ─────────────────────────────────────
scene('03', 13.0, FRAME + ctrl_placeholder() + '''
  <div class="bignum" id="big" style="left:648px;top:396px;width:256px">
    <div><span class="v" id="bignum">100</span><span class="u">%</span></div>
    <div class="k" id="bigk">sidebar · composited</div>
  </div>''',
'''
const app = buildApp($('host'), { menu: true, card: false })
applyWallpaper($('wall'), { ...WALL_BLOBS.aurora, strength: 58 })
$('ctrl').innerHTML = `%s`
const S = {
  set: (k, v) => {
    $('v-' + k).textContent = Math.round(v)
    $('f-' + k).style.width = v + '%%'
    $('k-' + k).style.left = v + '%%'
  },
}
window.__render = (t) => {
  $('stage').style.transform = `scale(${1 + 0.012 * (t / window.__duration)})`
  const base = 68
  const side = 100 - 80 * ramp(t, 2.0, 5.0)
  const sur2 = 100 - 78 * ramp(t, 5.6, 8.4)
  const ove2 = 100 - 12 * ramp(t, 8.9, 11.4)
  applyOpacity(app, { base, side, surface: sur2, overlay: ove2 })
  S.set('base', base); S.set('side', side); S.set('sur', sur2); S.set('ove', ove2)
  // 大數字跟著當前 beat
  let key = 'side', val = side
  if (t >= 5.6) { key = 'surface'; val = sur2 }
  if (t >= 8.9) { key = 'overlay'; val = ove2 }
  $('bignum').textContent = Math.round(val)
  $('bigk').textContent = key + ' · composited'
  const cIn = ramp(t, 0.2, 1.0)
  $('frame').style.opacity = cIn; $('ctrl').style.opacity = cIn; $('big').style.opacity = cIn
  $('cap').style.opacity = ramp(t, 1.0, 1.6) * (1 - ramp(t, 12.3, 13.0))
  if (t < 5.4) { $('czh').textContent = '側欄可以單獨調透明，主畫面不動'; $('cen').textContent = 'The sidebar fades on its own — the main panel barely moves' }
  else if (t < 8.7) { $('czh').textContent = '卡片與輸入框是第三個分區'; $('cen').textContent = 'Cards and inputs are their own region' }
  else { $('czh').textContent = '浮層只降一點：選單與提示要保持清楚'; $('cen').textContent = 'Overlays stay near the top: menus and tooltips must keep their contrast' }
}
''' % slider_pair(),
'側欄可以單獨調透明，主畫面不動', 'The sidebar fades on its own — the main panel barely moves')

# ── scene04：壁紙配色 ─────────────────────────────────────────────
scene('04', 15.0, FRAME + ctrl_placeholder() + '''
  <div id="presets" style="display:none"></div>''',
'''
const app = buildApp($('host'), { menu: false, card: false })
const order = ['aurora','ocean','sunset','forest','graphite']
const names = { aurora:'極光', ocean:'深海', sunset:'日落', forest:'森林', graphite:'石墨' }
$('ctrl').innerHTML = `<div class="h"><span>Built-in wallpaper</span><span class="badge">58%</span></div>
  <div class="hint" style="margin-top:-6px;font-size:10px">Three blobs, a base colour and a strength — five palettes.</div>
  <div style="height:1px;background:rgba(255,255,255,.09);margin:12px 0"></div>
  <div id="wallinfo" style="font-size:11px;color:#c9d3e6;line-height:1.9">colour · <b id="wcolor" style="color:#fff">極光</b></div>
  <div id="presetsInline" style="display:flex;gap:8px;margin-top:12px"></div>`
const presetEls = order.map((id, i) => {
  const el = document.createElement('div')
  el.style.cssText = 'flex:1;aspect-ratio:1;border-radius:12px;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.18);transition:none'
  $('presetsInline').appendChild(el)
  return el
})
window.__render = (t) => {
  $('stage').style.transform = `scale(${1 + 0.02 * (t / window.__duration)})`
  // 每 2.6s 換一個配色，最後一段加強度動畫
  const idx = Math.min(4, Math.floor(Math.max(0, t - 1.4) / 2.6))
  const strength = t > 9.6 ? 30 + 50 * ramp(t, 9.8, 12.6) : 58
  const colors = { ...WALL_BLOBS[order[idx]], strength }
  applyWallpaper($('wall'), colors)
  presetEls.forEach((el, i) => {
    el.style.backgroundImage = wallpaperLayers({ ...WALL_BLOBS[order[i]], strength: 62 })
    el.style.boxShadow = i === idx
      ? '0 0 0 2px #5b8bff, inset 0 0 0 .5px rgba(255,255,255,.2)'
      : 'inset 0 0 0 .5px rgba(255,255,255,.18)'
    el.style.opacity = i === idx ? 1 : .55
  })
  applyOpacity(app, { base: 26, side: 58, surface: 66, overlay: 78 })
  $('wcolor').textContent = names[order[idx]]
  $('cap').style.opacity = ramp(t, 1.2, 1.8) * (1 - ramp(t, 14.2, 15.0))
  $('ctrl').style.opacity = ramp(t, 0.3, 1.0)
  $('frame').style.opacity = ramp(t, 0.3, 1.0)
  if (t < 9.4) { $('czh').textContent = '五組配色，一鍵換掉三個色斑與底色'; $('cen').textContent = 'Five palettes swap the three blobs and the base colour at once' }
  else { $('czh').textContent = '強度決定色斑有多明顯'; $('cen').textContent = 'Strength controls how present the blobs are' }
}
''',
'五組配色，一鍵換掉三個色斑與底色', 'Five palettes swap the three blobs and the base colour at once')
