import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { toLabelOrder } from "../../../../lib/order-packing-label"
import {
  loadLabelOrders,
  markLabelsPrinted,
  MAX_LABEL_ORDERS,
  parseOrderIds,
  sendLabelsPdf,
  wantsSlip,
} from "../_orders"

/**
 * GET /admin/escay-labels/orders?ids=order_1,order_2[&slip=1]
 *
 * Etiket PDF'i (10×15 cm): kargo firmasının etiketi olduğu gibi (ekleme yok);
 * `slip=1` ise altında sipariş fişi. Gönderi yoksa hazırlık fişi. Etiketi
 * basılan siparişlere `metadata.label_printed_at` yazılır. Toplu baskı
 * için birden çok id verilebilir.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const ids = parseOrderIds(req.query.ids)
  if (!ids.length) {
    return res.status(400).json({ message: "En az bir sipariş seçin (ids)." })
  }
  if (ids.length > MAX_LABEL_ORDERS) {
    return res
      .status(400)
      .json({ message: `Tek seferde en fazla ${MAX_LABEL_ORDERS} sipariş yazdırılabilir.` })
  }

  const orders = await loadLabelOrders(req, ids)
  if (!orders.length) {
    return res.status(404).json({ message: "Sipariş bulunamadı." })
  }

  return sendLabelsPdf(req, res, orders.map((o) => toLabelOrder(o)), wantsSlip(req.query.slip), (ids) =>
    markLabelsPrinted(req, orders, ids)
  )
}
