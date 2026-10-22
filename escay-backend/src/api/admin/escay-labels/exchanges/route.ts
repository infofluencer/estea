import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { markExchangeLabelPrinted } from "../../../../lib/exchange"
import { readExchange } from "../../../../lib/exchange-plan"
import { toLabelOrder, type LabelOrder } from "../../../../lib/order-packing-label"
import { EXCHANGE_ORDER_NO_SUFFIX } from "../../../../modules/carrier/types"
import { LABEL_ORDER_FIELDS, MAX_LABEL_ORDERS, parseOrderIds, sendLabelsPdf, wantsSlip } from "../_orders"

type Dict = Record<string, unknown>

/** Fişte firmadaki referansla aynı: "ESC-65-D" (değişim gönderisi). */
function withExchangeNo(label: LabelOrder): LabelOrder {
  return label.shipment && !label.shipment.orderNumber.endsWith(EXCHANGE_ORDER_NO_SUFFIX)
    ? { ...label, shipment: { ...label.shipment, orderNumber: `${label.shipment.orderNumber}${EXCHANGE_ORDER_NO_SUFFIX}` } }
    : label
}

/**
 * GET /admin/escay-labels/exchanges?ids=ret_1,ret_2[&slip=1]
 *
 * Değişim gönderisinin etiketi (yalnız yeni ürün; fiş de yalnız yeni ürünü listeler).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const keys = parseOrderIds(req.query.ids)
  if (!keys.length) return res.status(400).json({ message: "En az bir değişim seçin (ids)." })
  if (keys.length > MAX_LABEL_ORDERS) {
    return res.status(400).json({ message: `Tek seferde en fazla ${MAX_LABEL_ORDERS} etiket yazdırılabilir.` })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const labels: LabelOrder[] = []
  const printedReturns: string[] = []

  const returnsById = new Map<string, { order_id: string; metadata?: Dict | null }>()
  const { data } = await query.graph({ entity: "return", fields: ["id", "order_id", "metadata"], filters: { id: keys } })
  for (const r of data as { id: string; order_id: string; metadata?: Dict | null }[]) returnsById.set(r.id, r)

  const orderIds = [...new Set([...returnsById.values()].map((r) => r.order_id))]
  const ordersById = new Map<string, Dict>()
  if (orderIds.length) {
    const { data: orders } = await query.graph({ entity: "order", fields: LABEL_ORDER_FIELDS, filters: { id: orderIds } })
    for (const o of orders as Dict[]) ordersById.set(String(o.id), o)
  }

  for (const key of keys) {
    const ret = returnsById.get(key)
    const order = ret && ordersById.get(ret.order_id)
    const ex = ret && readExchange(ret.metadata)
    if (!order || !ex) continue
    labels.push(withExchangeNo(toLabelOrder(order, { fulfillmentId: ex.fulfillment_id || "__none__", itemIds: ex.new_item_ids || [] })))
    if (ex.fulfillment_id) printedReturns.push(key)
  }
  if (!labels.length) return res.status(404).json({ message: "Değişim bulunamadı." })

  return sendLabelsPdf(req, res, labels, wantsSlip(req.query.slip), async (printedIds) => {
    const ok = new Set(printedIds)
    await markExchangeLabelPrinted(req.scope, printedReturns.filter((id) => ok.has(returnsById.get(id)!.order_id)))
  })
}
