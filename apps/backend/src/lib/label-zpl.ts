/**
 * Kargo etiketi ZPL olarak (DHL eCommerce): etiket yazıcıya doğrudan, tam boyutta basılır.
 *
 * DHL etiketi 203 dpi ZPL gelir (≈10,4 × 12 cm, 10×10 rulo). PDF'e çevirip 10×15 sayfaya
 * sığdırmak barkodu ~%62 küçültüyordu; DHL aktarma merkezindeki konveyör okuması için barkod
 * kalitesini şart koşuyor. Bu yüzden ZPL olduğu gibi, birden çok sipariş tek dosyada
 * (her etiket kendi ^XA…^XZ bloğu) indirilir ve Zebra uyumlu yazıcıya "raw" basılır.
 * Kurulum: docs/DHL-APIZONE.md → "Etiket baskısı (ZPL)".
 *
 * `DHL_LABEL_PDF=labelary` açıkça yazılırsa eski yol (Labelary ile PDF) kullanılır.
 */
import type { LabelOrder } from "./order-packing-label"

/** ZPL etiketi PDF'e çevrilsin mi (yalnız açık tercih; alıcı bilgisi Labelary'ye gider)? */
export function zplLabelsAsPdf(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.DHL_LABEL_PDF ?? "").trim().toLowerCase() === "labelary"
}

/** Bu sipariş etiketi ZPL dosyasıyla mı basılır? */
export function printsAsZpl(order: LabelOrder, env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(order.carrierLabelZpl) && !order.carrierLabelUrl && !zplLabelsAsPdf(env)
}

export type ZplBundle = {
  /** Tüm etiketler art arda; boşsa ZPL'li sipariş yok. */
  zpl: string
  /** ZPL'e giren sipariş id'leri ("etiket yazdırıldı" işareti bunlara). */
  includedIds: string[]
  /** PDF ile basılacaklar: firmanın PDF etiketi olanlar ya da gönderisi olmayanlar (hazırlık fişi). */
  pdfIds: string[]
  /** Gönderi var ama etiket yok (bekliyor / kayıp) — adlarıyla. */
  skipped: string[]
}

function displayName(order: LabelOrder): string {
  return order.shipment?.orderNumber || `#${order.displayId || order.id}`
}

/** Saf: sipariş etiketlerini ZPL dosyası / PDF / atlanan olarak ayırır. */
export function buildZplBundle(labels: LabelOrder[], env: Record<string, string | undefined> = process.env): ZplBundle {
  const blocks: string[] = []
  const includedIds: string[] = []
  const pdfIds: string[] = []
  const skipped: string[] = []
  for (const order of labels) {
    if (printsAsZpl(order, env)) {
      blocks.push(order.carrierLabelZpl.trim())
      includedIds.push(order.id)
    } else if (order.shipment && !order.carrierLabelUrl && !order.carrierLabelZpl) {
      skipped.push(displayName(order))
      pdfIds.push(order.id)
    } else {
      pdfIds.push(order.id)
    }
  }
  return { zpl: blocks.length ? `${blocks.join("\r\n")}\r\n` : "", includedIds, pdfIds, skipped }
}

/** İndirilen dosyanın adı: dhl-etiket-20261111-1745.zpl (Türkiye saati). */
export function zplFileName(now: Date = new Date()): string {
  const tr = new Date(now.getTime() + 3 * 3_600_000).toISOString()
  return `dhl-etiket-${tr.slice(0, 10).replace(/-/g, "")}-${tr.slice(11, 16).replace(":", "")}.zpl`
}
