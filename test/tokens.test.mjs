/**
 * dsh-appearance-glass — token 對照測試
 * ==========================================================
 * 執行：`node test/tokens.test.mjs`
 *
 * 為什麼要有這支測試：這個外掛的效果**完全靠覆寫官方 token**，而打錯一個字
 * （`--dsw-alias-bg-base` vs `--dsw-alias-bg-layer-1`）不會報錯，只會安靜地
 * 沒有效果。所以這裡直接打開 **本機正在跑的 DSH app bundle**
 * （`app.asar`，用 Node 自己解析 asar 標頭，不需要外部工具），把官方
 * ui-theme 的 CSS 撈出來，核對：
 *   1. 本外掛覆寫的每一個 token 都真的存在；
 *   2. 本外掛引用的每一個 `--dsw-static-*` 色票都真的存在；
 *   3. 沒有任何 token 被寫成裸字串（theme 服務會直接拒絕非 {light,dark} 的值）。
 *
 * 找不到 app bundle 時會印出提示並以 code 0 結束（不讓 CI 因環境而紅）。
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`  ok ${name}`)
}

/** 從 app.asar 直接讀一個檔（asar = 16 byte 標頭 + JSON 目錄 + 串接的檔案內容）。 */
function readFromAsar(asarPath, target) {
  const handle = readFileSync(asarPath)
  // 標頭四個 uint32：[0]=4、[1]=header pickle 大小、[2]=JSON 大小欄位本身、
  // [3]=JSON 字串長度；檔案內容從 8 + [1] 開始，目錄裡的 offset 相對於該點。
  const headerSize = handle.readUInt32LE(4)
  const jsonSize = handle.readUInt32LE(12)
  const header = JSON.parse(handle.subarray(16, 16 + jsonSize).toString('utf8'))
  const base = 8 + headerSize
  let node = header
  for (const part of target.split('/')) {
    node = node.files?.[part]
    if (node === undefined) return undefined
  }
  if (node.offset === undefined || node.size === undefined) return undefined
  const offset = Number(node.offset)
  return handle.subarray(base + offset, base + offset + node.size).toString('utf8')
}

/** 官方 CSS 的三個來源：ui-theme 的 token 表、welcome.css、shell CSS。 */
function collectOfficialCss() {
  const asar = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'
  const chunks = []
  if (existsSync(asar)) {
    for (const target of [
      'dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js',
      'dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html',
    ]) {
      const text = readFromAsar(asar, target)
      if (text !== undefined) chunks.push(text)
    }
  }
  const extracted = '/tmp/dshasar/dsh/node_modules/@deepseek-ai'
  if (chunks.length === 0 && existsSync(extracted)) {
    chunks.push(readFileSync(join(extracted, 'dsh-client-ui-theme/lib/client.js'), 'utf8'))
    chunks.push(readFileSync(join(extracted, 'lib/welcome/welcome.css'), 'utf8'))
  }
  return chunks.join('\n')
}

const official = collectOfficialCss()
if (official.length === 0) {
  console.log('找不到 DSH app bundle（app.asar）也找不到解開的副本 —— 跳過 token 對照。')
  process.exit(0)
}

const defined = new Set([...official.matchAll(/--dsw-[a-z0-9-]+(?=\s*:)/g)].map((match) => match[0]))
const mine = readFileSync(join(root, 'client', 'client.js'), 'utf8')

console.log(`dsh-appearance-glass · token 對照（官方定義 ${defined.size} 個 token）`)

check('官方 token 表讀得到（>200 個）', () => {
  assert.ok(defined.size > 200, `只讀到 ${defined.size} 個 token，來源可能不對`)
})

check('本外掛覆寫的每個 token 都存在', () => {
  const overridden = [...new Set([...mine.matchAll(/'(--dsw-[a-z0-9-]+)'/g)].map((match) => match[1]))]
  assert.ok(overridden.length >= 20, `只找到 ${overridden.length} 個 token`)
  const missing = overridden.filter((token) => !defined.has(token))
  assert.deepEqual(missing, [], `官方 CSS 沒有這些 token：${missing.join(', ')}`)
  console.log(`     （核對 ${overridden.length} 個：${overridden.slice(0, 6).join(', ')} …）`)
})

check('引用的每個 --dsw-static-* 色票都存在', () => {
  const statics = [
    ...new Set(
      [...mine.matchAll(/'((?:neutral|deepseek)(?:-bluish)?-[0-9]+)'/g)].map((match) => `--dsw-static-${match[1]}`),
    ),
  ]
  assert.ok(statics.length >= 10, `只找到 ${statics.length} 個色票`)
  const missing = statics.filter((token) => !defined.has(token))
  assert.deepEqual(missing, [], `官方 CSS 沒有這些色票：${missing.join(', ')}`)
})

check('token 值是 { light, dark } 字串（不是裸字串，否則 theme 服務會拒收）', () => {
  // 從原始碼抓 STATIC_SURFACES / RGB_SURFACES 兩張表，確認每一列都是
  // [token, light, dark, delta, group]（group ＝ 它吃哪一根分區滑桿）。
  const groups = new Set(['opacityBase', 'opacitySidebar', 'opacitySurface', 'opacityOverlay'])
  const arrays = [...mine.matchAll(/const (STATIC_SURFACES|RGB_SURFACES) = \[([\s\S]*?)\n    \]/g)]
  assert.equal(arrays.length, 2, '兩張 token 表都要找到')
  const seen = new Map()
  for (const [, name, body] of arrays) {
    const rows = [...body.matchAll(/\[([^\]]+)\]/g)].map((match) =>
      match[1].split(',').map((part) => part.trim()),
    )
    assert.ok(rows.length > 0, `${name} 不該是空的`)
    for (const row of rows) {
      assert.equal(
        row.length,
        5,
        `${name} 的每一列必須是 [token, light, dark, delta, group]：${row.join(' | ')}`,
      )
      assert.match(row[0], /^'--dsw-[a-z0-9-]+'$/, `${name} 的 token 名要用引號包住`)
      assert.match(row[3], /^-?\d+$/, `${name} 的 delta 必須是整數：${row[3]}`)
      const group = row[4].replace(/'/g, '')
      assert.ok(groups.has(group), `${name} 的分區必須是四者之一：${group}`)
      seen.set(group, (seen.get(group) ?? 0) + 1)
    }
    console.log(`     （${name}: ${rows.length} 列）`)
  }
  // 四個分區都必須有成員，否則某根滑桿會是空的
  assert.deepEqual([...seen.keys()].sort(), ['opacityBase', 'opacityOverlay', 'opacitySidebar', 'opacitySurface'])
  console.log(`     （分區分佈：${[...seen].map(([g, n]) => `${g}=${n}`).join(' ')}）`)
})

console.log(`\n${passed} checks passed`)
