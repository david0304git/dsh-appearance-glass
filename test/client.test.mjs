/**
 * dsh-appearance-glass — 瀏覽器半的離線測試
 * ==========================================================
 * 執行：`node test/client.test.mjs`
 *
 * 這裡不連 DSH：用最小 stub 模擬 `window.__ModuleLoader__` / `document` /
 * `react` / `@deepseek-ai/dsh-client-ui-primitives` / cordis context，然後真的
 * 呼叫外掛的 `apply(ctx)`，把**它實際送出去的**東西抓下來驗證：
 *   1. module loader 的 id 與注入的服務清單；
 *   2. theme override 層的每個 token（含 light/dark 兩色、分區 alpha 與層數補償）；
 *   3. 啟用／停用、三種背景策略下的結構 CSS（壁紙；不再有任何模糊）；
 *   4. 兩個 slot 註冊、UI 樹真的能渲染、控制項數量與官方形狀的 class 對得上；
 *   5. 官方 primitives 取不到時退化成原生 <select>／文字按鈕（fail-open）；
 *   6. 互動：啟用開關、同步四項、配色預設、恢復預設；
 *   7. 側欄導覽圖標補丁（只動自己那列、可還原、面板後開時補上）。
 */

import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const clientPath = join(here, '..', 'client', 'client.js')

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`  ok ${name}`)
}
/** 需要等一次 microtask 的檢查（例如按下按鈕後等寫入）。 */
async function checkAsync(name, fn) {
  await fn()
  passed += 1
  console.log(`  ok ${name}`)
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** ── 環境 stub ─────────────────────────────────────────────────────────── */
function makeDom() {
  const created = []
  const makeStyle = () => {
    const node = {
      tagName: 'STYLE',
      attrs: {},
      textContent: '',
      removed: false,
      setAttribute(key, value) {
        this.attrs[key] = value
      },
      remove() {
        this.removed = true
      },
    }
    created.push(node)
    return node
  }
  const root = {
    dataset: {},
    attrs: {},
    setAttribute(key, value) {
      this.attrs[key] = value
    },
    removeAttribute(key) {
      delete this.attrs[key]
    },
  }
  const head = {
    appended: [],
    appendChild(node) {
      this.appended.push(node)
    },
  }
  /** 假設定側欄的導覽按鈕（含 glyph svg），用來驗證圖標補丁。 */
  const makeNavButton = (label) => {
    const svg = {
      innerHTML: '<path d="M0 0" class="gear"/>',
      attrs: {},
      getAttribute(key) {
        return this.attrs[key] ?? null
      },
      setAttribute(key, value) {
        this.attrs[key] = value
      },
      removeAttribute(key) {
        delete this.attrs[key]
      },
    }
    return {
      nodeType: 1,
      textContent: label,
      querySelector(tag) {
        return String(tag).toLowerCase() === 'svg' ? svg : null
      },
      svg,
    }
  }
  // 三種語言的「自己那一列」＋一列別人的：補丁必須全部認得、且只動自己
  const navButtons = [
    makeNavButton('介面外觀'),
    makeNavButton('界面外观'),
    makeNavButton('Interface appearance'),
    makeNavButton('通用设置'),
  ]
  const body = {
    dark: false,
    navVisible: false,
    navButtons,
    hasAttribute(name) {
      return name === 'data-ds-dark-theme' && body.dark === true
    },
    querySelectorAll(selector) {
      return selector === 'button' && body.navVisible === true ? navButtons : []
    },
  }
  return {
    created,
    root,
    head,
    body,
    document: {
      documentElement: root,
      body,
      head,
      createElement: makeStyle,
      querySelectorAll(selector) {
        // 真實 DOM 的 document.querySelectorAll 會搜整個文件；設定面板開著時
        // 導覽按鈕就在文件裡，所以這裡照樣回傳（navVisible 關掉代表面板沒開）。
        return selector === 'button' && body.navVisible === true ? navButtons : []
      },
    },
  }
}

const FRAGMENT = Symbol.for('react.fragment')
function makeReact() {
  return {
    Fragment: FRAGMENT,
    createElement(type, props, ...children) {
      // 照 React 的規則：children 會進到 props.children（元件用 props.children
      // 取值，展開器也必須看同一份，否則會漏掉整棵子樹）。
      const merged = { ...(props ?? {}) }
      if (children.length === 1) merged.children = children[0]
      else if (children.length > 1) merged.children = children
      return { type, props: merged, children }
    },
    useSyncExternalStore(_subscribe, read) {
      return read()
    },
    useState(initial) {
      return [initial, () => {}]
    },
    useRef(initial) {
      return { current: initial }
    },
    useEffect() {},
  }
}

/** 官方 primitives 的 stub：Menu → 它的 anchor；Switch → 可辨識的節點。 */
const fakePrimitives = {
  Menu: (props) => props.anchor,
  Switch: (props) => ({ type: 'switch', props: props ?? {}, children: [] }),
  IconChevronDownOutlineRegular: (props) => ({ type: 'svg', props: props ?? {}, children: [] }),
}

/** ── 載入外掛（真的跑一次 __ModuleLoader__.load） ───────────────────────── */
async function loadPlugin({ primitives = true, platform = 'darwin', tag = 'main' } = {}) {
  const dom = makeDom()
  if (platform !== undefined) dom.root.dataset.platform = platform
  const requested = []
  let loaded = null
  globalThis.window = {
    __ModuleLoader__: {
      load(spec) {
        loaded = spec
      },
    },
  }
  globalThis.document = dom.document
  await import(`${pathToFileURL(clientPath).href}?case=${tag}`)
  assert.ok(loaded !== null, 'client half must register itself through window.__ModuleLoader__.load')
  const mod = loaded.factory((id) => {
    requested.push(id)
    if (id === 'react') return makeReact()
    if (id === '@deepseek-ai/dsh-client-ui-primitives') {
      if (!primitives) throw new Error('primitives unavailable (simulated)')
      return fakePrimitives
    }
    throw new Error(`unexpected require: ${id}`)
  })
  return { dom, mod, requested, spec: loaded }
}

/** ── 假 ctx：把對外呼叫全部記下來 ───────────────────────────────────────── */
function makeScope() {
  const listeners = new Set()
  const scope = {
    state: {
      status: 'loading',
      value: undefined,
      writable: false,
      revision: undefined,
      user: undefined,
    },
    mutations: [],
    getSnapshot() {
      return scope.state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(field, value) {
      scope.state = {
        ...scope.state,
        status: 'ready',
        writable: true,
        value: { ...(scope.state.value ?? {}), [field]: value },
        user: { ...(scope.state.user ?? {}), [field]: value },
        revision: (scope.state.revision ?? 0) + 1,
      }
      for (const listener of [...listeners]) listener()
      return Promise.resolve(true)
    },
    unset() {
      scope.state = { ...scope.state, status: 'ready', writable: true, value: {}, user: undefined }
      for (const listener of [...listeners]) listener()
      return Promise.resolve(true)
    },
    push(next) {
      scope.state = { ...scope.state, ...next }
      for (const listener of [...listeners]) listener()
    },
    /** 原子批次寫入（settings 服務的 mutate）。 */
    mutate(ops) {
      scope.mutations.push(ops)
      const value = { ...(scope.state.value ?? {}) }
      const user = { ...(scope.state.user ?? {}) }
      for (const op of ops) {
        const field = op.path[0]
        if (op.op === 'set') {
          value[field] = op.value
          user[field] = op.value
        } else {
          delete value[field]
          delete user[field]
        }
      }
      scope.state = {
        ...scope.state,
        status: 'ready',
        writable: true,
        value,
        user,
        revision: (scope.state.revision ?? 0) + 1,
      }
      for (const listener of [...listeners]) listener()
      return Promise.resolve(true)
    },
  }
  return scope
}

function makeCtx() {
  const calls = {
    tokens: [],
    releases: [],
    slots: [],
    locales: [],
    languages: [],
    addedLanguages: [],
    effects: [],
    forms: [],
  }
  const scope = makeScope()
  const ctx = {
    theme: {
      overrideTokens(source, layer) {
        calls.tokens.push({ source, layer })
        // 真正的實作回傳一個釋放函式；停用外掛時引擎會呼叫它
        return () => calls.releases.push(source)
      },
    },
    slots: {
      inject(key, register) {
        calls.slots.push({ key, registration: register() })
      },
      register(definition, component) {
        return { definition, component }
      },
    },
    locale: {
      register(ns, second, third) {
        // 兩種寫法：register(ns, {zh,en}) 與 register(ns, languageId, dict)
        if (typeof second === 'string') {
          calls.languages.push({ ns, id: second, dict: third })
          return () => {}
        }
        calls.locales.push({ ns, dicts: second })
        return () => {}
      },
      addLanguage(definition) {
        calls.addedLanguages.push(definition)
        return () => {}
      },
      bind(ns) {
        return (key) => `[${ns}]${key}`
      },
    },
    effect(run, label) {
      calls.effects.push({ label, disposer: run() })
    },
    configForms: {
      get(ns) {
        calls.forms.push(ns)
        return scope
      },
    },
    on() {},
  }
  return { ctx, calls, scope }
}

/** ── 把 stub 元素樹展開成 host 元素清單（支援 function 元件與 Fragment）── */
function flatten(node, into = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return into
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, into)
    return into
  }
  if (typeof node === 'string' || typeof node === 'number') return into
  const props = node.props ?? {}
  if (typeof node.type === 'function') {
    flatten(node.type(props), into)
    return into
  }
  if (node.type === FRAGMENT) {
    flatten(props.children, into)
    return into
  }
  into.push({ type: node.type, props })
  const opaque = node.type === 'input' || node.type === 'option' || node.type === 'svg' || node.type === 'switch'
  if (!opaque) flatten(props.children, into)
  return into
}

const byClass = (nodes, className) => nodes.filter((node) => node.props.className === className)
const alphaOf = (layer, token) => Number(/(\d+)%/.exec(layer[token].light)[1])

/** 完整的十一欄位投影（真實宿主就是長這樣）。 */
const FULL_VALUE = Object.freeze({
  enabled: true,
  opacityBase: 68,
  opacitySidebar: 68,
  opacitySurface: 68,
  opacityOverlay: 72,
  backdrop: 'wallpaper',
  wallpaperA: 'auto',
  wallpaperB: 'auto',
  wallpaperC: 'auto',
  wallpaperBase: 'auto',
  wallpaperStrength: 58,
})
/** 推一份合法的設定投影（可只覆蓋部分欄位）。 */
const setValue = (scope, patch = {}) =>
  scope.push({ status: 'ready', writable: true, value: { ...FULL_VALUE, ...patch }, user: patch })

console.log('dsh-appearance-glass · client half')

/** ── 案例 1：正常環境（macOS 桌面殼 + 官方 primitives 可用）────────────── */
const main = await loadPlugin({ primitives: true, platform: 'darwin', tag: 'main' })
const { ctx, calls, scope } = makeCtx()
/** 兩個 <style>：created[0]＝控件樣式、created[1]＝壁紙層 CSS。 */
const ui = () => main.dom.created[0]
const glass = () => main.dom.created[1]
const nodesOf = (key) => {
  const t = (k) => k
  return flatten(calls.slots.find((s) => s.key === key).registration.component({ t }))
}

check('apply() 不拋錯並註冊了專屬設定頁 + 外掛頁卡片', () => {
  main.mod.apply(ctx)
  assert.deepEqual(calls.slots.map((s) => s.key).sort(), ['plugins.bundle.config', 'settings.section'])
  assert.equal(
    calls.slots.some((s) => s.key === 'settings.general.item'),
    false,
    '一般設定列已移出，改由專屬設定頁承載',
  )
})

check('模組身分、注入的服務清單，以及真的 require 了官方 primitives', () => {
  assert.equal(main.spec.id, 'dsh-appearance-glass')
  assert.deepEqual(main.mod.inject, ['theme', 'slots', 'locale', 'configForms'])
  assert.deepEqual(calls.forms, ['appearance-glass'])
  assert.deepEqual(main.requested, ['react', '@deepseek-ai/dsh-client-ui-primitives'])
})

check('開機先畫預設值：原生材質（darwin）+ 一個 style 節點（沒有任何 backdrop-filter）', () => {
  const last = calls.tokens.at(-1)
  assert.equal(last.source, 'dsh-appearance-glass')
  // 預設 backdrop 是 'auto'：darwin 走原生視窗材質，所以不鋪壁紙
  assert.equal(main.dom.root.attrs['data-dsh-glass-backdrop'], 'native')
  assert.equal(Object.hasOwn(main.dom.root.attrs, 'data-dsh-glass'), false, '模式屬性已移除')
  assert.equal(glass().attrs['data-plugin'], 'dsh-appearance-glass')
  const css = glass().textContent
  assert.equal(css.includes('backdrop-filter'), false, '外掛不再自己加任何模糊')
  assert.equal(css.includes('--dsh-glass-sheen'), false, '液態玻璃的高光層已移除')
})

check('token 形狀：每個值都是 { light, dark }，且 base 用官方 static 色票', () => {
  const layer = calls.tokens.at(-1).layer
  for (const [token, value] of Object.entries(layer)) {
    assert.equal(typeof value.light, 'string', `${token} light`)
    assert.equal(typeof value.dark, 'string', `${token} dark`)
  }
  // 主畫面在真實介面上被疊了兩層（centerCol + 對話區 root），所以單層是 43%
  // ——合成 1-(1-0.43)² ≈ 0.675 ≈ 滑桿上的 68%。
  assert.equal(
    layer['--dsw-alias-bg-base'].light,
    'color-mix(in srgb, var(--dsw-static-neutral-bluish-00) 43%, transparent)',
  )
  assert.equal(
    layer['--dsw-alias-bg-base'].dark,
    'color-mix(in srgb, var(--dsw-static-neutral-bluish-950) 43%, transparent)',
  )
  assert.equal('--dsw-menu-backdrop-filter' in layer, false, '不再覆寫選單濾鏡')
  assert.equal('--dsw-mask-blur' in layer, false, '不再覆寫遮罩模糊')
})

check('設定文件抵達後套用 Host 的值（四個分區各自生效）', () => {
  setValue(scope, { opacityBase: 50, opacityOverlay: 90 })
  const layer = calls.tokens.at(-1).layer
  assert.equal(alphaOf(layer, '--dsw-alias-bg-base'), 29, '兩層合成 50% → 單層 29%')
  assert.equal(alphaOf(layer, '--dsw-alias-bg-overlay'), 90, '浮層單層＋delta 0＝滑桿值')
  // 選單材質的 delta 是 +14（浮層向來比群組目標更不透明），90% 時會夾到 100
  assert.equal(alphaOf(layer, '--dsw-menu-surface-fill'), 100, 'delta 讓它夾在上限')
})

check('滑桿數字＝合成後的不透明度（層數補償算得出來）', () => {
  setValue(scope, { opacityBase: 68 })
  const baseAlpha = alphaOf(calls.tokens.at(-1).layer, '--dsw-alias-bg-base')
  const baseComposite = 1 - Math.pow(1 - baseAlpha / 100, 2)
  assert.ok(Math.abs(baseComposite - 0.68) < 0.02, `主畫面合成 ${baseComposite.toFixed(3)} 應接近 0.68`)
  setValue(scope, { opacitySurface: 40 })
  assert.equal(
    alphaOf(calls.tokens.at(-1).layer, '--dsw-specific-input-major'),
    40,
    '單層卡片就是滑桿值',
  )
})

check('四個分區互不影響、各自夾限', () => {
  setValue(scope, { opacityBase: 68, opacitySidebar: 40, opacitySurface: 68, opacityOverlay: 72 })
  const sidebar = alphaOf(calls.tokens.at(-1).layer, '--dsw-specific-sidebar-fill')
  assert.ok(sidebar > 20 && sidebar < 40, `側欄單層 ${sidebar}%（層數 1.4，合成≈40%）`)
  assert.equal(alphaOf(calls.tokens.at(-1).layer, '--dsw-alias-bg-base'), 43, '改側欄不影響主畫面')
  setValue(scope, { opacitySurface: 100 })
  assert.equal(
    alphaOf(calls.tokens.at(-1).layer, '--dsw-alias-markdown-code-block-banner'),
    100,
    '夾在 100',
  )
  setValue(scope, { opacityBase: 0, opacitySurface: 0, opacitySidebar: 0, opacityOverlay: 0 })
  assert.equal(alphaOf(calls.tokens.at(-1).layer, '--dsw-alias-bg-base'), 0)
  assert.equal(alphaOf(calls.tokens.at(-1).layer, '--dsw-menu-surface-fill'), 0)
})

check('背景策略：auto（darwin）＝不鋪壁紙；瀏覽器＝鋪壁紙；none＝純透明', () => {
  setValue(scope, { backdrop: 'auto' })
  assert.equal(main.dom.root.attrs['data-dsh-glass-backdrop'], 'native', 'darwin 原生材質不需要壁紙')
  assert.equal(glass().textContent.includes('background-image'), false)

  delete main.dom.root.dataset.platform
  // 同一組設定不會重繪，所以順手改一個值逼它重算
  setValue(scope, { backdrop: 'auto', wallpaperStrength: 57 })
  assert.equal(main.dom.root.attrs['data-dsh-glass-backdrop'], 'wallpaper')
  assert.ok(glass().textContent.includes('radial-gradient'), '瀏覽器環境鋪內建壁紙')
  main.dom.root.dataset.platform = 'darwin'

  setValue(scope, { backdrop: 'none' })
  assert.equal(main.dom.root.attrs['data-dsh-glass-backdrop'], 'none')
  assert.equal(glass().textContent, '')
})

check('停用（enabled=false）→ 完全還原：屬性清空、CSS 清空、token 層釋放', () => {
  const layersBefore = calls.tokens.length
  const releasesBefore = calls.releases.length
  setValue(scope, { enabled: false })
  assert.equal(Object.hasOwn(main.dom.root.attrs, 'data-dsh-glass-backdrop'), false)
  assert.equal(glass().textContent, '')
  assert.equal(calls.tokens.length, layersBefore, '停用時不再推新的 token 層')
  assert.equal(calls.releases.length, releasesBefore + 1, '停用時要把舊的那一層釋放掉')
  setValue(scope, { enabled: true })
  assert.equal(main.dom.root.attrs['data-dsh-glass-backdrop'], 'wallpaper')
})

check('設定頁與外掛卡片的註冊形狀正確（id/order/label/key）', () => {
  const section = calls.slots.find((s) => s.key === 'settings.section').registration.definition
  const bundle = calls.slots.find((s) => s.key === 'plugins.bundle.config').registration.definition
  assert.equal(section.name, 'settings.section')
  assert.equal(section.id, 'appearance-glass')
  assert.equal(section.order, 5, '排在「通用設定」(0) 之後、「模型」(10) 之前')
  assert.equal(section.locale, 'appearanceGlass')
  assert.equal(typeof section.label, 'function', 'label 必須是 thunk，語言切換才會跟著換')
  assert.equal(section.label(), '[appearanceGlass]section.nav')
  assert.deepEqual(bundle, {
    name: 'plugins.bundle.config',
    key: 'dsh-appearance-glass',
    locale: 'appearanceGlass',
  })
})

check('locale：zh 是簡體、en 英文，鍵集合一致（DSH 內建 zh 就是簡體）', () => {
  assert.equal(calls.locales.length, 1)
  const { ns, dicts } = calls.locales[0]
  assert.equal(ns, 'appearanceGlass')
  assert.deepEqual(Object.keys(dicts.zh).sort(), Object.keys(dicts.en).sort())
  // 用字抽查：必須是簡體／官方用語，不能是繁體
  assert.equal(dicts.zh['section.nav'], '界面外观')
  assert.equal(dicts.zh['opacitySidebar'], '侧栏')
  assert.equal(dicts.zh['reset'], '恢复默认')
  assert.equal(dicts.zh['wallpaper.blobs'], '色块')
  assert.equal(dicts.en['section.nav'], 'Interface appearance')
  // 模式／液態玻璃相關的字串必須全部移除
  for (const key of ['mode', 'mode.off', 'mode.clear', 'mode.liquid', 'blur', 'saturate', 'glass.title']) {
    assert.equal(key in dicts.zh, false, `${key} 應該已移除`)
  }
  assert.equal('enabled' in dicts.zh, true)
})

check('locale：繁體中文走語言包（addLanguage + 逐語言字典），鍵集合與簡體一致', () => {
  assert.equal(calls.addedLanguages.length, 1)
  assert.deepEqual(calls.addedLanguages[0], { id: 'zh-Hant', label: '繁體中文', fallback: 'zh' })
  const pack = calls.languages.find((entry) => entry.id === 'zh-Hant')
  assert.ok(pack !== undefined, '必須註冊 zh-Hant 的字典')
  assert.equal(pack.ns, 'appearanceGlass')
  assert.equal(pack.dict['section.nav'], '介面外觀')
  assert.equal(pack.dict['opacitySidebar'], '側欄')
  assert.equal(pack.dict['reset'], '恢復預設')
  assert.equal(pack.dict['wallpaper.blobs'], '色斑')
  assert.deepEqual(
    Object.keys(pack.dict).sort(),
    Object.keys(calls.locales[0].dicts.en).sort(),
    '三個語言的鍵集合必須完全相同（少一個 key 就會在切換語言時顯示 key）',
  )
})

check('設定頁：標題列（啟用＋恢復預設）＋ 三個區塊，沒有模式方塊', () => {
  setValue(scope, { enabled: true })
  const nodes = nodesOf('settings.section')
  assert.equal(nodes[0].props.className, 'dsg-page', '專屬頁要有根節點')
  assert.equal(byClass(nodes, 'dsg-row').length, 1, '只有標題列用官方 .row 形狀')
  assert.equal(byClass(nodes, 'dsg-title').length, 1)
  assert.equal(byClass(nodes, 'dsg-switchLabel').length, 1, '標題列有「啟用」標籤')
  assert.equal(nodes.filter((node) => node.type === 'switch').length, 1, '官方 Switch 元件')
  assert.equal(byClass(nodes, 'dsg-reset').length, 2, '恢復預設 + 不透明度區的「同步」')
  assert.equal(byClass(nodes, 'dsg-cube').length, 0, '模式方塊已移除')
  assert.equal(byClass(nodes, 'dsg-field').length, 3, '介面不透明度 / 透視背景 / 內建壁紙')
  assert.equal(byClass(nodes, 'dsg-fieldHead').length, 1)
  // 4 根不透明度 + 壁紙的四列（色斑／底色／強度／配色）都用同一種列形狀
  assert.equal(byClass(nodes, 'dsg-line').length, 8, '四個分區 + 壁紙四列')
  assert.equal(byClass(nodes, 'dsg-sliderChip').length, 5, '四根滑桿 + 壁紙強度')
  assert.equal(byClass(nodes, 'dsg-selector').length, 1)
  assert.equal(byClass(nodes, 'dsg-colorPill').length, 4, '三個色斑 + 底色')
  assert.equal(byClass(nodes, 'dsg-auto').length, 1)
  assert.equal(byClass(nodes, 'dsg-presetCard').length, 5)
})

check('內建壁紙：四列都對齊同一個標籤欄，且每列只有一個控制項', () => {
  setValue(scope, { enabled: true, backdrop: 'wallpaper' })
  const nodes = nodesOf('settings.section')
  // 壁紙區的最後四列（前三列是四根不透明度滑桿…）
  const lines = byClass(nodes, 'dsg-line')
  const labels = lines.map(
    (line) => line.props.children.find((child) => child.props?.className === 'dsg-lineLabel')?.props.children,
  )
  assert.deepEqual(labels.slice(4), ['wallpaper.blobs', 'wallpaper.base', 'wallpaper.strength', 'wallpaper.presets'], '壁紙四列：色斑／底色／強度／配色')
  // 每一列 = 標籤 + 一個控制項（不再把三個東西擠在同一列）
  for (const line of lines) {
    const kids = line.props.children.filter((child) => child !== null && child !== undefined)
    assert.ok(kids.length <= 2, '一列最多一個控制項')
    assert.equal(kids[0].props.className, 'dsg-lineLabel')
  }
})

check('壁紙顏色控制：色點 pill 內含可點整顆的透明原生 input', () => {
  const pills = byClass(nodesOf('settings.section'), 'dsg-colorPill')
  assert.equal(pills.length, 4, '三個色斑 + 底色')
  for (const pill of pills) {
    const [dot, hex, input] = pill.props.children
    assert.equal(dot.props.className, 'dsg-colorDot')
    assert.match(dot.props.style.background, /^#[0-9a-f]{6}$/i)
    assert.equal(hex.props.className, 'dsg-colorHex')
    // 測試把 t() 換成 key，所以底色 pill 的顯示值是 key（真的語言檔會是「跟隨深淺色」）
    assert.match(hex.props.children, /^(#[0-9A-F]{6}|wallpaper\.baseAuto)$/)
    assert.equal(input.props.type, 'color', '原生色盤仍是真正的輸入')
    assert.equal(input.props.className, 'dsg-colorInput', '透明覆蓋層，外觀由 pill 決定')
    assert.equal(typeof input.props['aria-label'], 'string', '要給螢幕閱讀器的名稱')
  }
  assert.equal(
    pills[3].props.children[1].props.children,
    'wallpaper.baseAuto',
    '底色是 auto 時 pill 顯示「跟隨深淺色」而不是假 hex',
  )
})

check('配色預設：出廠狀態不圈任何一組；選了才圈', () => {
  setValue(scope, { wallpaperA: 'auto', wallpaperB: 'auto', wallpaperC: 'auto', wallpaperBase: 'auto' })
  const cards = byClass(nodesOf('settings.section'), 'dsg-presetCard')
  assert.equal(cards.length, 5)
  assert.equal(
    cards.filter((card) => card.props['aria-pressed'] === true).length,
    0,
    'auto（出廠配色）不等於任何固定預設',
  )
  setValue(scope, {
    wallpaperA: '#7ee0c0',
    wallpaperB: '#6aa9ff',
    wallpaperC: '#b388ff',
    wallpaperBase: '#0b1020',
  })
  const ringed = byClass(nodesOf('settings.section'), 'dsg-presetCard').filter(
    (card) => card.props['aria-pressed'] === true,
  )
  assert.equal(ringed.length, 1, '只有命中那一組被圈')
  assert.equal(ringed[0].props.title, 'preset.aurora')
  // 大小寫不敏感
  setValue(scope, {
    wallpaperA: '#7EE0C0',
    wallpaperB: '#6AA9FF',
    wallpaperC: '#B388FF',
    wallpaperBase: '#0B1020',
  })
  assert.equal(
    byClass(nodesOf('settings.section'), 'dsg-presetCard').filter(
      (card) => card.props['aria-pressed'] === true,
    ).length,
    1,
  )
  setValue(scope)
})

check('預覽 mock：側欄／主面板都是兩層、卡片一層（與真實疊層一致）', () => {
  const nodes = nodesOf('settings.section')
  assert.equal(byClass(nodes, 'dsg-preview').length, 1)
  assert.equal(byClass(nodes, 'dsg-previewSide').length, 1)
  assert.equal(byClass(nodes, 'dsg-previewSideFill').length, 1, '側欄第二層')
  assert.equal(byClass(nodes, 'dsg-previewMain').length, 1)
  assert.equal(byClass(nodes, 'dsg-previewInner').length, 1, '主畫面第二層')
  assert.equal(byClass(nodes, 'dsg-previewCard').length, 1)
  assert.equal(byClass(nodes, 'dsg-previewMenu').length, 1)
  assert.equal(byClass(nodes, 'dsg-previewNav').length, 1, '側欄有一個選取中的導覽項')
  assert.equal(
    nodes.filter((node) => String(node.props.className ?? '').includes('dsg-previewBar')).length,
    2,
    '兩條細列（不是骨架屏）',
  )
  const image = byClass(nodes, 'dsg-preview')[0].props.style.backgroundImage
  assert.equal(image.split('radial-gradient').length - 1, 3, '三個色斑')
  assert.equal(image.includes('linear-gradient'), true, '一條底色漸層')
})

check('外掛頁卡片與設定頁共用同一份面板（只差最外層 class）', () => {
  const page = nodesOf('settings.section')
  const card = nodesOf('plugins.bundle.config')
  assert.equal(page[0].props.className, 'dsg-page')
  assert.equal(card[0].props.className, 'dsg-card')
  const shape = (nodes) => nodes.map((node) => `${node.type}.${node.props.className ?? ''}`).join('|')
  assert.equal(shape(card.slice(1)), shape(page.slice(1)), '除了最外層 class，元素序列必須一致')
})

check('壁紙顏色真的進了 CSS：三色變數 + 強度 + 底色', () => {
  setValue(scope, {
    wallpaperA: '#ff0000',
    wallpaperB: '#00ff00',
    wallpaperC: '#0000ff',
    wallpaperBase: 'auto',
    wallpaperStrength: 40,
  })
  const css = glass().textContent
  assert.ok(css.includes('--dsh-wall-a:#ff0000;'), '色斑 1 進了 CSS')
  assert.ok(css.includes('--dsh-wall-b:#00ff00;'))
  assert.ok(css.includes('--dsh-wall-c:#0000ff;'))
  assert.ok(css.includes('color-mix(in srgb, var(--dsh-wall-a) 40%, transparent)'), '強度用進去了')
  assert.ok(css.includes('color-mix(in srgb, var(--dsh-wall-b) 34%, transparent)'), '第二顆自動弱一點')
  assert.ok(css.includes('--dsh-wall-base:#e9f0ff;'), 'auto 底色 → 淺色用淡藍')
  assert.ok(
    css.includes(
      ':has(body[data-ds-dark-theme]){--dsh-wall-a:#ff0000;--dsh-wall-b:#00ff00;--dsh-wall-c:#0000ff;--dsh-wall-base:#0b0f1c}',
    ),
    '深色規則要同時覆寫四色',
  )
})

check('自訂底色：淺色與深色都改用同一個顏色', () => {
  setValue(scope, { backdrop: 'wallpaper', wallpaperBase: '#123456' })
  const css = glass().textContent
  assert.ok(css.includes('--dsh-wall-base:#123456;'))
  assert.ok(css.includes('--dsh-wall-base:#123456}'), '深色規則也用同一個自訂底色')
  assert.equal(css.includes('#0b0f1c'), false, '自訂底色時不該再出現預設深色')
})

check('壞值 fail-open：非法 hex / 越界強度一律回退到預設', () => {
  setValue(scope, {
    backdrop: 'wallpaper',
    wallpaperA: 'red',
    wallpaperB: '#GGGGGG',
    wallpaperC: 42,
    wallpaperBase: 'chartreuse',
    wallpaperStrength: 999,
  })
  const css = glass().textContent
  assert.ok(css.includes('--dsh-wall-a:#94c4ff;'), '非法 hex 回退')
  assert.ok(css.includes('--dsh-wall-b:#ffa6d6;'))
  assert.ok(css.includes('--dsh-wall-c:#967aff;'))
  assert.ok(css.includes('--dsh-wall-base:#e9f0ff;'), '非法底色回退成 auto')
  assert.ok(css.includes('color-mix(in srgb, var(--dsh-wall-a) 100%, transparent)'), '強度夾到上限')
})

check('宿主只服務舊欄位時：沒被服務的控制項停用並說明要重啟', () => {
  scope.push({
    status: 'ready',
    writable: true,
    revision: 9,
    // 舊世代（液態玻璃時代）的投影：沒有 enabled、沒有壁紙欄位
    value: { opacityBase: 68, opacitySidebar: 68, blur: 34, saturate: 180, backdrop: 'wallpaper' },
  })
  const nodes = nodesOf('plugins.bundle.config')
  const disabledChips = byClass(nodes, 'dsg-sliderChip').filter(
    (chip) => chip.props.children[0].props.disabled === true,
  )
  // 未服務：opacitySurface / opacityOverlay / wallpaperStrength → 三個控制項停用
  assert.equal(disabledChips.length, 3, '沒被服務的控制項要停用')
  assert.equal(
    byClass(nodes, 'dsg-colorPill').every(
      (node) => node.props.children.find((child) => child.props?.type === 'color')?.props.disabled === true,
    ),
    true,
    '壁紙色點全部停用',
  )
  assert.equal(byClass(nodes, 'dsg-desc')[0].props.children, 'fields.needsRestart', '標題列要說明重啟')
  setValue(scope)
})

check('CSS 用的是官方數值（selector 36px、標題 14px/22、說明 12px/18）', () => {
  const injected = ui().textContent
  assert.ok(
    injected.includes(
      '.dsg-selector{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);height:36px',
    ),
  )
  assert.ok(
    injected.includes(
      '.dsg-title{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
    ),
  )
  assert.ok(
    injected.includes(
      '.dsg-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
    ),
  )
  assert.ok(
    injected.includes(
      '.dsg-rowText{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px}',
    ),
  )
  assert.ok(injected.includes('.dsg-value{text-align:right;font-variant-numeric:tabular-nums;min-width:40px'))
  assert.ok(
    injected.includes('.dsg-control{display:inline-flex;align-items:center;gap:8px;flex:none}'),
    '控制項不可被壓縮',
  )
  assert.ok(injected.includes('.dsg-cardControl{display:flex;flex-wrap:wrap;align-items:center;gap:8px}'))
  assert.ok(
    injected.includes('.dsg-page>:last-child,.dsg-card>:last-child{border-bottom:none}'),
    '最後一塊不留分隔線',
  )
  assert.ok(injected.includes('.dsg-fieldHead{display:flex;align-items:center;justify-content:space-between'))
  assert.ok(injected.includes('.dsg-lineLabel{flex:none;width:84px'))
  assert.equal(injected.includes('.dsg-cube'), false, '模式方塊樣式必須已移除')
  assert.equal(injected.includes('.dsg-sliderLabel'), false)
  // 壁紙區的新樣式：顏色 pill 疊一個透明的原生 input、預設卡是 44px 方塊
  assert.ok(injected.includes('.dsg-colorPill{position:relative;display:inline-flex'))
  assert.ok(injected.includes('.dsg-colorInput{position:absolute;inset:0;width:100%;height:100%'))
  assert.ok(injected.includes('.dsg-presetFill{width:44px;height:44px'))
  assert.ok(injected.includes('.dsg-presetCard[aria-pressed=true] .dsg-presetFill{box-shadow:0 0 0 2px'))
  assert.equal(injected.includes('.dsg-swatch'), false, '原生色票樣式必須已移除')
  assert.equal(injected.includes('.dsg-presets{'), false)
})

check('控件樣式真的被注入，而且停用時仍然保留（設定頁還要能用）', () => {
  assert.ok(ui().textContent.includes('.dsg-selector{'), '設定頁的 CSS 必須進到 <head>')
  assert.equal(main.dom.head.appended[0], ui(), '控件樣式是第一個被掛上的 <style>')
  assert.equal(main.dom.head.appended[1], glass(), '壁紙層是第二個')
  setValue(scope, { enabled: false })
  assert.equal(glass().textContent, '')
  assert.ok(ui().textContent.includes('.dsg-title{'), '停用時設定頁仍要有樣式')
  setValue(scope, { enabled: true })
})

/** ── 互動（都走引擎，不模擬 DOM 事件） ───────────────────────────────── */
await checkAsync('啟用開關：切成 false 會寫入 enabled 並立刻收掉效果', async () => {
  setValue(scope, { enabled: true })
  const switchNode = nodesOf('settings.section').find((node) => node.type === 'switch')
  assert.equal(switchNode.props.checked, true)
  assert.equal(switchNode.props.disabled, false)
  switchNode.props.onChange(false)
  await tick()
  assert.equal(scope.state.value.enabled, false)
  assert.equal(Object.hasOwn(main.dom.root.attrs, 'data-dsh-glass-backdrop'), false, '停用後屬性清掉')
  assert.ok(calls.releases.length > 0, '停用後 token 層被釋放')
  setValue(scope, { enabled: true })
})

await checkAsync('「同步」：一次原子 mutate 把主畫面的值套到其他三項', async () => {
  setValue(scope, { opacityBase: 40, opacitySidebar: 68, opacitySurface: 68, opacityOverlay: 72 })
  scope.mutations.length = 0
  const sync = nodesOf('settings.section').find((node) => node.props.title === 'opacity.syncHint')
  assert.ok(sync !== undefined, '同步按鈕要在不透明度區的標題列')
  sync.props.onClick()
  await tick()
  assert.equal(scope.mutations.length, 1, '一次原子寫入')
  assert.deepEqual(
    scope.mutations[0].map((op) => [op.op, op.path[0], op.value]),
    [
      ['set', 'opacitySidebar', 40],
      ['set', 'opacitySurface', 40],
      ['set', 'opacityOverlay', 40],
    ],
  )
})

await checkAsync('配色預設：一次原子 mutate 寫入四個壁紙欄位', async () => {
  scope.mutations.length = 0
  const presets = byClass(nodesOf('settings.section'), 'dsg-presetCard')
  assert.equal(presets.length, 5)
  presets[1].props.onClick()
  await tick()
  assert.equal(scope.mutations.length, 1)
  assert.equal(scope.mutations[0][0].value, '#5ec8ff', '深海的主色')
  assert.ok(glass().textContent.includes('--dsh-wall-a:#5ec8ff;'))
})

await checkAsync('恢復預設：一次原子 mutate unset 全部欄位', async () => {
  setValue(scope, { wallpaperA: '#5ec8ff' })
  scope.mutations.length = 0
  byClass(nodesOf('settings.section'), 'dsg-reset')[0].props.onClick()
  await tick()
  assert.equal(scope.mutations.length, 1, '一次原子寫入，不是逐欄位')
  const ops = scope.mutations[0]
  assert.equal(ops.length, 11, '十一個欄位一次清掉')
  assert.ok(ops.every((op) => op.op === 'unset'))
  setValue(scope)
})

check('卸載時移除 style 與 <html> 標記', () => {
  const effect = calls.effects.find((e) => e.label === 'appearance-glass: stylesheet')
  assert.equal(typeof effect.disposer, 'function')
  effect.disposer()
  assert.equal(ui().removed, true)
  assert.equal(glass().removed, true)
  assert.equal(Object.hasOwn(main.dom.root.attrs, 'data-dsh-glass-backdrop'), false)
})

/** ── 側欄導覽圖標補丁（DSH 沒有 icon 欄位可宣告） ───────────────────────── */
class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback
    this.observed = []
    this.disconnected = false
    FakeMutationObserver.instances.push(this)
  }
  observe(target, options) {
    this.observed.push({ target, options })
  }
  disconnect() {
    this.disconnected = true
  }
}
FakeMutationObserver.instances = []
globalThis.MutationObserver = FakeMutationObserver

check('側欄導覽圖標：只換自己那一列，別人與原樣都保留', () => {
  main.dom.body.navVisible = true
  FakeMutationObserver.instances.length = 0
  const second = makeCtx()
  main.mod.apply(second.ctx)
  const [hant, simp, english, other] = main.dom.body.navButtons
  for (const [name, mine] of [['繁中', hant], ['簡中', simp], ['英文', english]]) {
    assert.equal(mine.svg.attrs['data-dsh-ag-glyph'], '1', `${name}那一格要被標記`)
    assert.ok(mine.svg.innerHTML.includes('rx="3.2"'), `${name} 換成視窗 glyph`)
  }
  assert.equal(other.svg.attrs['data-dsh-ag-glyph'], undefined, '「通用设置」不動')
  assert.equal(other.svg.innerHTML, '<path d="M0 0" class="gear"/>')
  const observer = FakeMutationObserver.instances.at(-1)
  assert.equal(observer.observed[0].options.childList, true)
  assert.equal(observer.observed[0].options.subtree, undefined)
  const effect = second.calls.effects.find((e) => e.label === 'appearance-glass: sidebar glyph')
  assert.equal(typeof effect.disposer, 'function')
  effect.disposer()
  for (const mine of [hant, simp, english]) {
    assert.equal(mine.svg.innerHTML, '<path d="M0 0" class="gear"/>', '原樣還原')
    assert.equal(mine.svg.attrs['data-dsh-ag-glyph'], undefined, '標記要清掉')
  }
  assert.equal(observer.disconnected, true)
})

check('側欄圖標：面板後開（portal 新子樹）時由 MutationObserver 補上', () => {
  FakeMutationObserver.instances.length = 0
  const third = makeCtx()
  main.mod.apply(third.ctx)
  const observer = FakeMutationObserver.instances.at(-1)
  const fresh = {
    nodeType: 1,
    svg: {
      innerHTML: '<path d="M0 0" class="gear"/>',
      attrs: {},
      getAttribute(k) {
        return this.attrs[k] ?? null
      },
      setAttribute(k, v) {
        this.attrs[k] = v
      },
      removeAttribute(k) {
        delete this.attrs[k]
      },
    },
    textContent: 'Interface appearance',
  }
  fresh.querySelector = (tag) => (String(tag).toLowerCase() === 'svg' ? fresh.svg : null)
  observer.callback([
    { addedNodes: [{ nodeType: 1, querySelectorAll: (sel) => (sel === 'button' ? [fresh] : []) }] },
  ])
  assert.equal(fresh.svg.attrs['data-dsh-ag-glyph'], '1', '英文標籤也要認得')
  const effect = third.calls.effects.find((e) => e.label === 'appearance-glass: sidebar glyph')
  effect.disposer()
  assert.equal(fresh.svg.innerHTML, '<path d="M0 0" class="gear"/>')
})

check('側欄圖標：結構不符時 fail-open（不拋錯、不動別人的圖標）', () => {
  const fourth = makeCtx()
  main.dom.body.navVisible = false
  const before = main.dom.body.navButtons.map((button) => button.svg.innerHTML)
  assert.doesNotThrow(() => main.mod.apply(fourth.ctx))
  assert.deepEqual(main.dom.body.navButtons.map((button) => button.svg.innerHTML), before)
})

/** ── 案例 2：primitives 取不到 → 必須 fail-open ───────────────────────── */
const fallback = await loadPlugin({ primitives: false, platform: 'darwin', tag: 'fallback' })
const fallbackCtx = makeCtx()

check('primitives 缺失：apply 仍成功，控制項退化成原生 select／文字按鈕', () => {
  fallback.mod.apply(fallbackCtx.ctx)
  assert.equal(fallbackCtx.calls.slots.length, 2)
  const t = (key) => key
  const nodes = flatten(
    fallbackCtx.calls.slots.find((s) => s.key === 'settings.section').registration.component({ t }),
  )
  assert.equal(nodes.filter((node) => node.type === 'select').length, 1, '背景退化成原生 select')
  assert.equal(byClass(nodes, 'dsg-selector').length, 1, '外觀仍是同一個 pill class')
  assert.equal(nodes.filter((node) => node.type === 'switch').length, 0, '沒有官方 Switch')
  assert.equal(byClass(nodes, 'dsg-auto').length, 2, '啟用開關退化成文字按鈕（+ 底色「跟隨深淺色」）')
  assert.equal(byClass(nodes, 'dsg-sliderChip').length, 5, '數值控制不受影響')
  assert.equal(byClass(nodes, 'dsg-colorPill').length, 4, '壁紙色點不受影響')
  assert.equal(byClass(nodes, 'dsg-presetCard').length, 5, '配色預設不受影響')
})

console.log(`\n${passed} checks passed`)
