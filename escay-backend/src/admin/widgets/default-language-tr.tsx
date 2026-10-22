import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

/**
 * Admin paneli varsayılan olarak Türkçe açılır.
 *
 * Medusa dili tarayıcı başına cookie/localStorage `lng` ile tutar ve seçim
 * yoksa İngilizceye düşer (fallbackLng "en"; ilk açılışta "en" kaydedilir).
 * Bu widget her tarayıcıda yalnızca BİR KEZ Türkçeye geçirir; sonradan
 * Profil → Dil'den yapılan seçim korunur. Görünür bir şey çizmez.
 */
const APPLIED_KEY = "escay_admin_default_lng_applied"

const DefaultLanguageTr = () => {
  const { i18n } = useTranslation()

  useEffect(() => {
    try {
      if (localStorage.getItem(APPLIED_KEY)) return
      localStorage.setItem(APPLIED_KEY, "tr")
    } catch {
      return
    }
    if (i18n.language !== "tr") {
      void i18n.changeLanguage("tr")
    }
  }, [i18n])

  return null
}

export const config = defineWidgetConfig({
  // Giriş ekranı + giriş sonrası ilk açılan listeler (oturumu açık kalanlar için)
  zone: [
    "login.before",
    "order.list.before",
    "product.list.before",
    "customer.list.before",
  ],
})

export default DefaultLanguageTr
