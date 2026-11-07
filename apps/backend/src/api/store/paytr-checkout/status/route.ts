import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { findPaytrCheckout } from "../../../../lib/paytr-checkout"

/**
 * GET /store/paytr-checkout/status?oid=&cart_id=
 * Ödeme sonuç sayfası sipariş oluştu mu diye sorar. Numara + sepet birlikte eşleşmeli;
 * sipariş ve e-posta yalnız sepet sahibine döner.
 *
 *   completed  sipariş oluştu
 *   processing bildirim bekleniyor ya da sipariş kurulmaya çalışılıyor (geç bildirim dahil)
 *   attention  para alındı ama sipariş otomatik açılmayacak (elle inceleme / panelden iade)
 *   unknown    kayıt yok ya da sepet uyuşmuyor
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const oid = String(req.query.oid || "").trim()
  const cartId = String(req.query.cart_id || "").trim()
  const checkout = oid && cartId ? await findPaytrCheckout(req.scope, oid) : null
  if (!checkout || checkout.cart_id !== cartId) {
    res.status(200).json({ state: "unknown" })
    return
  }
  if (checkout.status === "completed" && checkout.order_id) {
    res.status(200).json({ state: "completed", order_id: checkout.order_id, email: checkout.email })
    return
  }
  if (checkout.status === "review" || checkout.status === "refunded") {
    res.status(200).json({ state: "attention" })
    return
  }
  res.status(200).json({ state: "processing" })
}
