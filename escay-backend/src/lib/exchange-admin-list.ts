import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "@medusajs/framework/mikro-orm/knex"

import {
  exchangeDisplayState,
  readExchange,
  type ExchangeDisplayState,
  type ExchangeItem,
} from "./exchange-plan"
import { isReturnRejected } from "./return-rejection"
import { readFulfillmentData } from "../modules/carrier/types"

/** Admin "Değişimler" sayfası: iadelerdeki değişimler (en yeni önce). */

export type AdminExchangeRow = {
  /** Etiket / işlem anahtarı: iade id (`ret_…`) */
  key: string
  kind: "medusa"
  state: ExchangeDisplayState
  requested_at: string
  order_id: string
  order_label: string
  order_link: string
  customer: string
  email: string
  source: string | null
  items: { quantity: number; title: string; from: string | null; to: string | null }[]
  /** Yeni ürünün gönderisi */
  shipment: { carrier: string | null; tracking_number: string | null; label_url: string | null } | null
  label_printed_at: string | null
  return_code: string | null
  error: string | null
  return_id: string | null
}

const MAX_RETURNS = 500

type Dict = Record<string, unknown>

function items(list: ExchangeItem[]) {
  return list.map((i) => ({ quantity: i.quantity, title: i.title, from: i.from_variant, to: i.to_variant }))
}

export async function listMedusaExchanges(container: MedusaContainer): Promise<AdminExchangeRow[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: returns } = await query.graph({
    entity: "return",
    fields: ["id", "status", "created_at", "order_id", "metadata"],
    pagination: { take: MAX_RETURNS, order: { created_at: "DESC" } },
  })
  const rows = (returns as { id: string; status?: string | null; created_at?: string; order_id?: string; metadata?: Dict | null }[]).filter(
    (r) => readExchange(r.metadata)
  )
  if (!rows.length) return []

  const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))] as string[]
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "fulfillments.id",
      "fulfillments.canceled_at",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.data",
      "fulfillments.labels.tracking_number",
      "fulfillments.labels.label_url",
    ],
    filters: { id: orderIds },
  })
  const orderById = new Map((orders as Dict[]).map((o) => [String(o.id), o]))

  return rows.map((r) => {
    const ex = readExchange(r.metadata)!
    const order = (r.order_id && orderById.get(r.order_id)) || {}
    const addr = (order.shipping_address || {}) as Dict
    const fulfillments = (order.fulfillments || []) as Dict[]
    const f = ex.fulfillment_id ? fulfillments.find((x) => x.id === ex.fulfillment_id) : undefined
    const fData = readFulfillmentData(f?.data as Dict | undefined)
    const fLabel = ((f?.labels as Dict[] | undefined) || [])[0] || {}
    const meta = r.metadata || {}
    return {
      key: r.id,
      kind: "medusa",
      state: exchangeDisplayState({
        exchange: ex,
        returnReceived: r.status === "received" || r.status === "partially_received",
        returnRejected: isReturnRejected(meta),
        returnCanceled: r.status === "canceled",
        shipment: f
          ? { shipped: Boolean(f.shipped_at), delivered: Boolean(f.delivered_at), canceled: Boolean(f.canceled_at) }
          : null,
      }),
      requested_at: ex.requested_at || String(r.created_at || ""),
      order_id: String(r.order_id || ""),
      order_label: `#${order.display_id ?? String(r.order_id || "").slice(-6)}`,
      order_link: `/orders/${r.order_id}`,
      customer: [addr.first_name, addr.last_name].filter(Boolean).join(" ") || String(order.email || ""),
      email: String(order.email || ""),
      source: ex.source || null,
      items: items(ex.items),
      shipment: f
        ? {
            carrier: fData.carrier_name || fData.carrier || null,
            tracking_number: (fLabel.tracking_number as string) || fData.tracking_number || null,
            label_url: fData.label_url || (fLabel.label_url as string) || null,
          }
        : null,
      label_printed_at: ex.label_printed_at || null,
      return_code: typeof meta.return_code === "string" ? meta.return_code : null,
      error: ex.status === "failed" ? ex.error || "Gönderi açılamadı" : null,
      return_id: r.id,
    }
  })
}

export async function listAdminExchanges(container: MedusaContainer): Promise<AdminExchangeRow[]> {
  const medusa = await listMedusaExchanges(container)
  return medusa.sort((a, b) => (a.requested_at < b.requested_at ? 1 : -1))
}
