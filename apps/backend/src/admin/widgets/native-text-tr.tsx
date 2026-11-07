import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"

/**
 * Medusa'nın çeviri dosyasından geçmeyen, koda gömülü İngilizce metinleri
 * Türkçeye çevirir (i18n/json/tr.json bunlara ulaşamaz):
 *   - kenar çubuğu "Drafts" (draft-order eklentisi)
 *   - sipariş ödeme satırı: "Captured/Pending/Canceled", ham sağlayıcı kimliği
 *   - gönderi sağlayıcısı "Manual"
 *   - "06 Nov, 2026, 23:48:38" gibi İngilizce ay adlı tarihler
 * Yalnız metnin tamamı eşleşirse değiştirir; görünür bir şey çizmez.
 */
const EXACT: Record<string, string> = {
  Drafts: "Taslak siparişler",
  Captured: "Tahsil edildi",
  Pending: "Bekliyor",
  Canceled: "İptal edildi",
  Manual: "Elle",
  pp_paytr_paytr: "PayTR",
  pp_system_default: "Sistem",
  pp_havale_havale: "Havale",
}

const MONTHS: Record<string, string> = {
  Jan: "Oca", Feb: "Şub", Mar: "Mar", Apr: "Nis", May: "May", Jun: "Haz",
  Jul: "Tem", Aug: "Ağu", Sep: "Eyl", Oct: "Eki", Nov: "Kas", Dec: "Ara",
}
const EN_DATE = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec), (\d{4})(.*)$/

function translate(text: string): string | null {
  const trimmed = text.trim()
  if (EXACT[trimmed]) return text.replace(trimmed, EXACT[trimmed])
  const m = EN_DATE.exec(trimmed)
  if (m) return `${m[1]} ${MONTHS[m[2]]} ${m[3]}${m[4]}`
  return null
}

function fix(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const next = node.nodeValue ? translate(node.nodeValue) : null
    if (next != null && next !== node.nodeValue) node.nodeValue = next
  }
}

let observer: MutationObserver | null = null
let mounted = 0
let frame: number | null = null

function schedule() {
  if (frame !== null) return
  frame = window.requestAnimationFrame(() => {
    frame = null
    fix(document.body)
  })
}

const NativeTextTr = () => {
  useEffect(() => {
    mounted++
    if (!observer) {
      fix(document.body)
      observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    }
    return () => {
      mounted--
      if (mounted === 0 && observer) {
        observer.disconnect()
        observer = null
      }
    }
  }, [])
  return null
}

export const config = defineWidgetConfig({
  zone: [
    "order.list.before",
    "order.details.before",
    "product.list.before",
    "product.details.before",
    "customer.list.before",
    "customer.details.before",
    "inventory_item.list.before",
    "inventory_item.details.before",
    "promotion.list.before",
    "price_list.list.before",
  ],
})

export default NativeTextTr
