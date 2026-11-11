import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { toLabelOrder } from "../../../../lib/order-packing-label"
import {
  loadLabelOrders,
  markLabelsPrinted,
  MAX_LABEL_ORDERS,
  parseOrderIds,
  sendLabelsPdf,
  sendLabelsZpl,
  wantsSlip,
  wantsZpl,
} from "../_orders"

/**
 * GET /admin/escay-labels/orders?ids=order_1,order_2[&slip=1][&format=zpl]
 *
 * `format=zpl`: ZPL etiketli (DHL) siparişlerin etiketleri tek .zpl dosyası (lib/label-zpl.ts);
 * PDF'te bu siparişler yalnız fiş olarak (slip=1) yer alır.
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

  const labels = orders.map((o) => toLabelOrder(o))
  if (wantsZpl(req.query.format)) {
    return sendLabelsZpl(req, res, labels, (ids) => markLabelsPrinted(req, orders, ids))
  }
  return sendLabelsPdf(req, res, labels, wantsSlip(req.query.slip), (ids) => markLabelsPrinted(req, orders, ids))
}
