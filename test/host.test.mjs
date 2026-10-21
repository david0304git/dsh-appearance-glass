/**
 * dsh-appearance-glass — Host 半的離線測試
 * ==========================================================
 * 執行：`node test/host.test.mjs`
 *
 * 這個測試刻意用 **DSH 真正在跑的那一份 `@deepseek-ai/schemastery`**（優先從
 * 已解開的 app bundle 取，其次是安裝後 profile 裡的解析結果）來驗證 Config：
 *   * 每個欄位都是 volatile（否則 settings 服務會直接拒絕寫入）；
 *   * default 與 DEFAULTS 一致（瀏覽器半的開機值必須跟 Host 相同）；
 *   * 列舉／數值範圍真的會擋掉非法值；
 *   * `toJSON()` 的形狀與官方 ui-theme 的 schema 同型（settings 只投影 volatile
 *     欄位，形狀不同就等於沒有表單）。
 * 最後再跑一次 `apply(ctx)`，確認它只做一件正確的事：以 `auto:false` 認領設定
 * 命名空間。
 *
 * 為了讓這支測試能 import 到真的 schemastery，會把 plugin/index.mjs 複製成
 * test/.host-under-test.mjs 並改寫那一行 import（測完即刪）。
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`  ok ${name}`)
}

/** ── 找出真正的 schemastery ─────────────────────────────────────────────── */
const candidates = [
  process.env.DSH_SCHEMASTERY,
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar.unpacked/../../app.asar',
  '/tmp/dshasar/dsh/node_modules/@deepseek-ai/schemastery/lib/index.mjs',
].filter((value) => typeof value === 'string' && value.endsWith('.mjs') && existsSync(value))

let Schema
let schemaOrigin
for (const candidate of candidates) {
  try {
    Schema = (await import(pathToFileURL(candidate).href)).default
    schemaOrigin = candidate
    break
  } catch {
    /* 換下一個候選 */
  }
}
if (Schema === undefined) {
  try {
    Schema = (await import('@deepseek-ai/schemastery')).default
    schemaOrigin = '@deepseek-ai/schemastery'
  } catch {
    console.error('找不到 @deepseek-ai/schemastery；請先安裝外掛或設 DSH_SCHEMASTERY=<lib/index.mjs>')
    process.exit(2)
  }
}
console.log(`dsh-appearance-glass · host half（schemastery: ${schemaOrigin}）`)

/** ── 改寫 import 後載入 Host 半 ─────────────────────────────────────────── */
const tempPath = join(here, '.host-under-test.mjs')
const source = readFileSync(join(root, 'plugin', 'index.mjs'), 'utf8')
const rewritten = source.replace(
  /from '@deepseek-ai\/schemastery'/,
  `from ${JSON.stringify(pathToFileURL(schemaOrigin).href)}`,
)
assert.notEqual(rewritten, source, 'plugin/index.mjs 必須 import @deepseek-ai/schemastery')
writeFileSync(tempPath, rewritten)

let host
try {
  host = await import(pathToFileURL(tempPath).href)
} finally {
  rmSync(tempPath, { force: true })
}

check('匯出 name / Config / apply 與三組常數', () => {
  assert.equal(host.name, 'dsh-appearance-glass')
  assert.equal(typeof host.apply, 'function')
  assert.equal(typeof host.Config, 'function' || typeof host.Config === 'object')
  // 1.1 起沒有「模式」：液態玻璃與原生選項都已移除
  assert.equal('MODES' in host, false, 'MODES 必須已移除')
  assert.equal('blur' in host.DEFAULTS, false, 'blur 必須已移除')
  assert.equal('saturate' in host.DEFAULTS, false, 'saturate 必須已移除')
  assert.deepEqual(host.OPACITY_GROUPS, [
    'opacityBase',
    'opacitySidebar',
    'opacitySurface',
    'opacityOverlay',
  ])
  assert.deepEqual(host.BACKDROPS, ['auto', 'wallpaper', 'none'])
  assert.deepEqual(host.DEFAULTS, {
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
  // 顏色欄位一律 'auto' | '#rrggbb'：'auto' 表示沿用出廠壁紙（且跟隨深淺色）。
  assert.deepEqual(host.WALLPAPER_DEFAULTS, {
    wallpaperA: 'auto',
    wallpaperB: 'auto',
    wallpaperC: 'auto',
    wallpaperBase: 'auto',
    wallpaperStrength: 58,
  })
})

check('十一個欄位都在，而且全部是 volatile', () => {
  const json = host.Config.toJSON()
  const dict = json.refs[String(json.uid)].dict
  const fields = Object.keys(dict)
  assert.deepEqual(fields.sort(), [
    'backdrop',
    'enabled',
    'opacityBase',
    'opacityOverlay',
    'opacitySidebar',
    'opacitySurface',
    'wallpaperA',
    'wallpaperB',
    'wallpaperBase',
    'wallpaperC',
    'wallpaperStrength',
  ])
  for (const [field, ref] of Object.entries(dict)) {
    assert.equal(json.refs[String(ref)].meta.volatile, true, `${field} 必須是 volatile`)
  }
})

check('default 與 Host/Client 兩邊一致', () => {
  const json = host.Config.toJSON()
  const dict = json.refs[String(json.uid)].dict
  const defaults = {}
  for (const [field, ref] of Object.entries(dict)) {
    const node = json.refs[String(ref)]
    defaults[field] = node.meta.default
  }
  assert.deepEqual(defaults, host.DEFAULTS)
})

check('合法值通過、非法值被擋下', () => {
  assert.doesNotThrow(() => host.Config({ enabled: true, opacityBase: 68, backdrop: 'auto' }))
  assert.doesNotThrow(() => host.Config({ enabled: false, opacityBase: 20 }))
  // 舊設定檔可能還留著液態玻璃時代的鍵（mode / blur / saturate）：
  // schemastery 對未知鍵是放行的，所以升級後不會讓整個 row 載入失敗。
  assert.doesNotThrow(() => host.Config({ mode: 'liquid', blur: 34, saturate: 180 }))
  assert.throws(() => host.Config({ enabled: 'yes' }), /expected/)
  assert.throws(() => host.Config({ opacityBase: 500 }), /expected/)
  assert.throws(() => host.Config({ opacityOverlay: -1 }), /expected/)
  assert.doesNotThrow(() => host.Config({ opacityBase: 0 }), '0 是合法的（完全透明）')
  // 舊版欄位 `opacity` 已移除：schemastery 對未知鍵是放行的（實測），
  // 所以舊設定檔不會因此讓 row 載入失敗。
  assert.doesNotThrow(() => host.Config({ opacity: 40 }))
  assert.throws(() => host.Config({ backdrop: 'photo' }), /expected/)
  assert.throws(() => host.Config({ wallpaperStrength: 5 }), /expected/)
  assert.throws(() => host.Config({ wallpaperStrength: 400 }), /expected/)
  // 顏色刻意不加 pattern：壞值由瀏覽器半回退，而不是讓整條 row 載入失敗。
  assert.doesNotThrow(() => host.Config({ wallpaperA: 'not-a-color' }))
})

check('apply() 只做一件事：以 auto:false 認領設定命名空間', () => {
  const calls = { inject: [], configure: [], effects: [] }
  const fiber = { fake: 'fiber' }
  const ctx = {
    fiber,
    inject(services, callback) {
      calls.inject.push(services)
      callback({
        effect(run) {
          calls.effects.push(run())
        },
        settings: {
          configure(presentation, owner) {
            calls.configure.push({ presentation, owner })
            return () => {}
          },
        },
      })
    },
  }
  host.apply(ctx)
  assert.deepEqual(calls.inject, [['settings']])
  assert.equal(calls.configure.length, 1)
  assert.deepEqual(calls.configure[0].presentation, { auto: false })
  assert.equal(calls.configure[0].owner, fiber)
  assert.equal(calls.effects.length, 1)
  assert.equal(typeof calls.effects[0], 'function')
})

check('Host 的 Config 欄位 == 瀏覽器半的 FIELDS（防兩邊漂移）', () => {
  // 這是最容易出錯的地方：Host 加了欄位、瀏覽器半忘了加（或反之），
  // 症狀是「滑桿存在但寫不進去」或「設定推進去了但畫面沒反應」。
  const client = readFileSync(join(root, 'client', 'client.js'), 'utf8')
  const block = /const FIELDS = \[([\s\S]*?)\]/.exec(client)
  assert.ok(block !== null, '找不到 client 的 FIELDS')
  const clientFields = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
  const hostFields = Object.keys(host.Config({})).sort()
  assert.deepEqual(clientFields, hostFields)
  assert.deepEqual(clientFields, Object.keys(host.DEFAULTS).sort())
})

check('沒有 settings 服務時完全惰性（不拋錯）', () => {
  const ctx = {
    fiber: {},
    inject() {
      /* 服務不存在＝不回呼 */
    },
  }
  assert.doesNotThrow(() => host.apply(ctx))
})

console.log(`\n${passed} checks passed`)
