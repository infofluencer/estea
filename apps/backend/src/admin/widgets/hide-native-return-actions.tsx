import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"

/**
 * Sipariş sayfasında Medusa'nın kendi iade / değişim / talep / düzenleme /
 * gönderi / para iadesi butonlarını gizler. Bunlar Es Çay akışını (PayTR,
 * Paraşüt, kargo, stok, mailler) atlar; işlemler sağdaki Es Çay kutularından
 * yapılır (İade, Değişim, Sipariş durumu, Kargo).
 *
 * Link butonları CSS ile (menüler portalda açıldığı için küresel stil); yalnız
 * tıklama işleyicisi olan "Ödeme al / Ödendi işaretle" menüsü başlıkla bulunup
 * gizlenir. Şeritte başka buton kalmazsa şerit de gizlenir.
 */
const HIDDEN_HREF = ["/returns", "/exchanges", "/claims", "/edits", "/fulfillment", "/refund", "/receive"]

const CSS = `
${HIDDEN_HREF.map((h) => `a[href*="/orders/"][href$="${h}"], a[href*="/orders/"][href*="${h}?"]`).join(",\n")} { display: none !important; }
div.rounded-b-xl.justify-end:has(> a[href$="/receive"], > a[href$="/refund"]):not(:has(> :not(a[href$="/receive"]):not(a[href$="/refund"]))) {
  display: none !important;
}
`

/** Başlığı verilen Medusa kartının sağ üst "…" menü düğmesi (Özet, Ödeme). */
const MENU_HEADINGS = ["Özet", "Summary", "Ödeme", "Payment", "Ödemeler", "Payments"]

function hideCardMenus() {
  for (const h of document.querySelectorAll<HTMLElement>("h2")) {
    if (!MENU_HEADINGS.includes(h.textContent?.trim() || "")) continue
    const header = h.parentElement
    if (!header) continue
    for (const btn of header.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')) {
      btn.style.display = "none"
    }
  }
}

const HideNativeReturnActions = () => {
  useEffect(() => {
    hideCardMenus()
    const observer = new MutationObserver(() => hideCardMenus())
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return <style>{CSS}</style>
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default HideNativeReturnActions
