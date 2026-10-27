import { defineWidgetConfig } from "@medusajs/admin-sdk"

/**
 * Deploy sonrası "Failed to fetch dynamically imported module" hatasını önler.
 *
 * Her build sayfa parçalarına (assets/*-HASH.js) yeni adlar verir; deploy'dan
 * önce açılmış bir sekme eski adları ister, dosya artık yoktur ve sayfa
 * "Bir hata oluştu" ekranına düşer. Vite bu durumda `vite:preloadError`
 * yayar → sayfayı bir kez yeniden yükleyip yeni index.html'i alıyoruz.
 *
 * Dinleyici modül yüklenirken kurulur (widget modülleri admin açılışında
 * statik import edilir), bileşenin hangi bölgede çizildiğinden bağımsızdır.
 * Yenileme döngüsüne girmemek için 30 sn içinde en fazla bir kez yeniler;
 * ikinci hatada Vite'ın normal hata ekranı görünür.
 */
const RELOAD_KEY = "escay_admin_chunk_reload_at"
const MIN_INTERVAL_MS = 30_000

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    let last = 0
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    } catch {
      // yoksay
    }
    if (Date.now() - last < MIN_INTERVAL_MS) return
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    } catch {
      // yoksay
    }
    event.preventDefault()
    window.location.reload()
  })
}

const StaleChunkReload = () => null

export const config = defineWidgetConfig({
  zone: "login.before",
})

export default StaleChunkReload
