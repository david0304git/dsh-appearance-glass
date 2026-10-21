/**
 * dsh-appearance-glass — Host 半（Node 側）
 * ==========================================================
 * 這個外掛真正「畫」的部份全部在瀏覽器半（client/client.js）；Host 半唯一的
 * 職責，是替外觀偏好開一個 **DSH 設定文件裡的作用域**，讓瀏覽器半能把
 * 「透明度 / 背景 / 壁紙顏色」持久化，並在設定頁上提供表單。
 *
 * 為什麼要這樣寫（DSH 0.2 的設定模型）
 * ------------------------------------
 *  * 一個 Loader row 的 **id 就是它的設定命名空間**：本檔所在的 bundle patch
 *    插入 `id: appearance-glass`，因此瀏覽器半用
 *    `ctx.configForms.get('appearance-glass')` 讀寫同一份資料。
 *  * 只有 **volatile 欄位**會被投影到設定文件、並且可以在不重新掛載外掛的
 *    情況下就地改寫（schemastery 3.18 的 `.volatile()`）。非 volatile 欄位
 *    的寫入會被 settings 服務直接拒絕（"Config field ... is not volatile"），
 *    所以下面每個欄位都必須是 volatile。
 *  * `settings.configure({ auto: false }, ctx.fiber)`：本外掛自己擁有 UI
 *    （設定側欄的「介面外觀」一頁 + 外掛頁的卡片），不需要 settings 服務
 *    另外產生一張自動表單，因此關掉 auto 頁面。
 *  * 沒裝 `settings` 服務的組合（例如純 CLI profile）不會執行上面的注入，
 *    外掛就維持完全惰性 —— 不會壞掉任何既有行為（fail-open）。
 *
 * 欄位語意（瀏覽器半據此套用；改動會即時生效、不需重啟）
 * ------------------------------------------------------
 *  這個外掛**只做透明度**：1.1 起移除「模式」與液態玻璃（模糊／飽和／高光／
 *  描邊／遮罩模糊），所以效果永遠是在「透明」上進行，沒有東西可選。
 *  enabled   總開關：false 時完全不動任何 token（等於暫時卸下外掛）
 *  opacityBase/Sidebar/Surface/Overlay
 *            介面四個分區的不透明度 0–100（%），數值是**合成後**的目標：
 *            主畫面（對話區底）／側欄／卡片與輸入框／選單與浮層。越低越透明。
 *  backdrop  auto = macOS/Windows 用原生視窗材質、其他環境自帶壁紙
 *            wallpaper = 一律鋪內建壁紙（瀏覽器裡也看得到顏色）
 *            none = 純透明，不鋪任何底
 *  wallpaperA/B/C、wallpaperBase、wallpaperStrength
 *            內建壁紙的三個色斑、底色（'auto' ＝跟隨深淺色）與強度
 */

import Schema from '@deepseek-ai/schemastery'

/** 外掛名稱（Cordis 慣例）。 */
export const name = 'dsh-appearance-glass'

/** 舊版 schemastery 沒有 `.volatile()`，此時退化成一般欄位（仍可用 cordis config 改）。 */
const volatile = (field) => (typeof field.volatile === 'function' ? field.volatile() : field)

/** 使用者可選的三種背景策略。 */
export const BACKDROPS = ['auto', 'wallpaper', 'none']
/**
 * 介面不透明度的四個分區（各自 0–100）。
 * 數值是**合成後**的目標：介面上同一塊背景常常被疊了 2～3 層
 * （例如 darwin 的 `.centerCol` 與對話區 root 都畫 `--dsw-alias-bg-base`），
 * 瀏覽器半會用各區的層數把它換算回單層 alpha，所以滑桿寫 20% 就真的是 20%。
 */
export const OPACITY_GROUPS = ['opacityBase', 'opacitySidebar', 'opacitySurface', 'opacityOverlay']
/**
 * 內建壁紙的預設值。顏色欄位一律是 `'auto' | '#rrggbb'`：`'auto'` 表示沿用出廠
 * 那張壁紙（且**跟隨深淺色**，淺色用亮一階的色斑、深色用沉一階的），
 * 使用者一旦選色就變成固定色。
 */
export const WALLPAPER_DEFAULTS = Object.freeze({
  wallpaperA: 'auto',
  wallpaperB: 'auto',
  wallpaperC: 'auto',
  wallpaperBase: 'auto',
  wallpaperStrength: 58,
})

/** 預設值同時是瀏覽器半在設定尚未載入前的開機值。 */
export const DEFAULTS = Object.freeze({
  enabled: true,
  opacityBase: 68,
  opacitySidebar: 68,
  opacitySurface: 68,
  opacityOverlay: 72,
  backdrop: 'auto',
  ...WALLPAPER_DEFAULTS,
})

/**
 * Runtime configuration schema（官方 cordis Config）。
 * 每個欄位都是 volatile：settings 服務只投影 volatile 欄位，也只有 volatile
 * 欄位可以在外掛執行中就地改寫（瀏覽器半的每一次拖動滑桿都是一次寫入）。
 *
 * 顏色刻意用寬鬆的 `Schema.string()`（`'auto'` 或 `#rrggbb`）：值由瀏覽器半的
 * <input type="color"> 產生，瀏覽器半另外做驗證與回退。若在這裡加 pattern，
 * 手改 cordis.patch.yml 打錯一個字就會讓整條 row 載入失敗 —— 對外觀外掛來說
 * 代價太高。
 * 同樣的理由，數字欄位也**不加 `.step()`**（schemastery 會翻成 JSON Schema 的
 * `multipleOf`）：`opacityBase: 68.5` 這種手寫值會直接讓 row 載入失敗。範圍由
 * min/max 守住，非整數由瀏覽器半 normalize() 四捨五入。
 */
export const Config = Schema.object({
  enabled: volatile(Schema.boolean().default(DEFAULTS.enabled)),
  opacityBase: volatile(Schema.number().min(0).max(100).default(DEFAULTS.opacityBase)),
  opacitySidebar: volatile(Schema.number().min(0).max(100).default(DEFAULTS.opacitySidebar)),
  opacitySurface: volatile(Schema.number().min(0).max(100).default(DEFAULTS.opacitySurface)),
  opacityOverlay: volatile(Schema.number().min(0).max(100).default(DEFAULTS.opacityOverlay)),
  backdrop: volatile(Schema.union([...BACKDROPS]).default(DEFAULTS.backdrop)),
  wallpaperA: volatile(Schema.string().default(DEFAULTS.wallpaperA)),
  wallpaperB: volatile(Schema.string().default(DEFAULTS.wallpaperB)),
  wallpaperC: volatile(Schema.string().default(DEFAULTS.wallpaperC)),
  wallpaperBase: volatile(Schema.string().default(DEFAULTS.wallpaperBase)),
  wallpaperStrength: volatile(
    Schema.number().min(10).max(100).default(DEFAULTS.wallpaperStrength),
  ),
})

/**
 * Host plugin body。
 * @param ctx - Host plugin context。
 */
export function apply(ctx) {
  ctx.inject(['settings'], (child) => {
    // `auto: false`：本外掛自己註冊設定 UI（settings.general.item 一列 +
    // plugins.bundle.config 卡片），不要 settings 服務再生成一張自動表單。
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
