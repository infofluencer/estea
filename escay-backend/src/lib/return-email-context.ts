import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { formatOrderNumber } from "@escay/shared/order-number"
import type { ReturnEmailLine } from "../emails/return-notifications"

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return Number(value) || 0
}

export type ReturnEmailContext = {
  returnId: string
  orderId: string
  orderDisplayId: string
  email: string
  customerName: string | null
  customerNote: string | null
  source: string | null
  currencyCode: string
  items: ReturnEmailLine[]
  /** Ürün bazlı kabulde kabul edilmeyen kalemler (metadata.escay_acceptance) */
  notAccepted: ReturnEmailLine[]
  notAcceptedReason: string | null
}

/** Return + order + reason etiketleri — mail şablonları için. */
export async function loadReturnEmailContext(
  scope: MedusaContainer,
  returnId: string
): Promise<ReturnEmailContext | null> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: returns } = await query.graph({
    entity: "return",
    fields: [
      "id",
      "order_id",
      "metadata",
      "items.item_id",
      "items.quantity",
      "items.received_quantity",
      "items.reason_id",
    ],
    filters: { id: returnId },
  })

  const ret = returns?.[0] as
    | {
        id: string
        order_id: string
        metadata?: Record<string, unknown> | null
        items?: {
          item_id?: string | null
          quantity?: number | null
          received_quantity?: number | null
          reason_id?: string | null
        }[]
      }
    | undefined

  if (!ret?.id || !ret.order_id) return null

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "display_id",
      "custom_display_id",
      "currency_code",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "items.id",
      "items.title",
      "items.variant_title",
      "items.product_title",
    ],
    filters: { id: ret.order_id },
  })

  const order = orders?.[0] as
    | {
        id: string
        email?: string | null
        display_id?: number | string | null
        custom_display_id?: string | null
        currency_code?: string | null
        shipping_address?: {
          first_name?: string | null
          last_name?: string | null
        } | null
        items?: {
          id?: string
          title?: string | null
          variant_title?: string | null
          product_title?: string | null
        }[]
      }
    | undefined

  if (!order?.id) return null

  const reasonIds = [
    ...new Set(
      (ret.items || [])
        .map((i) => i.reason_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const reasonLabelById: Record<string, string> = {}
  if (reasonIds.length) {
    const { data: reasons } = await query.graph({
      entity: "return_reason",
      fields: ["id", "label", "value"],
      filters: { id: reasonIds },
    })
    for (const r of reasons || []) {
      const row = r as { id?: string; label?: string | null; value?: string | null }
      if (row.id) {
        reasonLabelById[row.id] = row.label || row.value || row.id
      }
    }
  }

  const orderItemById = new Map(
    (order.items || []).filter((i) => i.id).map((i) => [i.id as string, i])
  )

  const items: ReturnEmailLine[] = (ret.items || [])
    .map((ri) => {
      const qty =
        asNumber(ri.received_quantity) > 0
          ? asNumber(ri.received_quantity)
          : asNumber(ri.quantity)
      if (qty <= 0 || !ri.item_id) return null
      const line = orderItemById.get(ri.item_id)
      return {
        title: line?.title || line?.product_title || "Ürün",
        quantity: qty,
        variantLabel:
          line?.variant_title && line.variant_title !== "Default"
            ? line.variant_title
            : null,
        reasonLabel: ri.reason_id
          ? reasonLabelById[ri.reason_id] || null
          : null,
      }
    })
    .filter(Boolean) as ReturnEmailLine[]

  const meta = ret.metadata || {}
  const customerNote =
    typeof meta.customer_note === "string" && meta.customer_note.trim()
      ? meta.customer_note.trim()
      : null
  const source =
    typeof meta.source === "string" ? meta.source : null

  const acceptance = meta.escay_acceptance as
    | { reason?: string | null; items?: { item_id: string; rejected?: number }[] }
    | null
    | undefined
  const notAccepted: ReturnEmailLine[] = (acceptance?.items || [])
    .filter((i) => asNumber(i.rejected) > 0)
    .map((i) => {
      const line = orderItemById.get(i.item_id)
      return {
        title: line?.title || line?.product_title || "Ürün",
        quantity: asNumber(i.rejected),
        variantLabel: line?.variant_title && line.variant_title !== "Default" ? line.variant_title : null,
      }
    })

  const name = [
    order.shipping_address?.first_name,
    order.shipping_address?.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  return {
    returnId: ret.id,
    orderId: order.id,
    orderDisplayId:
      formatOrderNumber(order.display_id) ||
      String(order.custom_display_id ?? order.display_id ?? order.id),
    email: (order.email || "").trim(),
    customerName: name || null,
    customerNote,
    source,
    currencyCode: (order.currency_code || "try").toUpperCase(),
    items,
    notAccepted,
    notAcceptedReason: notAccepted.length ? acceptance?.reason?.trim() || null : null,
  }
}
