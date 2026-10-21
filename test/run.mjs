#!/usr/bin/env node
/**
 * 一次跑完三支離線測試：node test/run.mjs
 * （各自也可以單獨跑；全部不連網路、不改任何檔案。）
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const suites = ['host.test.mjs', 'client.test.mjs', 'tokens.test.mjs']
let failed = 0

for (const suite of suites) {
  console.log(`\n──────── ${suite} ────────`)
  const result = spawnSync(process.execPath, [join(here, suite)], { stdio: 'inherit' })
  if (result.status !== 0) failed += 1
}

console.log(failed === 0 ? '\n全部測試通過 ✔' : `\n有 ${failed} 支測試失敗 ✘`)
process.exit(failed === 0 ? 0 : 1)
