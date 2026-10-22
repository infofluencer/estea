import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { resolveDefaultStockLocationId } from "./default-stock-location"
import { patchFulfillmentData } from "./carrier-actions"
import { MANUAL_PROVIDER_ID } from "../modules/carrier/types"
import {
  nextOrderStatusAction,
  resolveOrderTimeline,
} from "@escay/shared/order-timeline"

/** Admin elle durum ilerletme aksiyonları. */
export type OrderStatusAction = "prepare" | "ship" | "deliver"

type FulfillmentRow = {
  id: string
  shipped_at?: string | Date | null
  delivered_at?: string | Date | null
  canceled_at?: string | Date | null
  items?:
    | {
        line_item_id?: string | null
        quantity?: number | string | null
      }[]
    | null
  labels?:
    | {
        tracking_number?: string | null
        tracking_url?: string | null
        label_url?: string | null
      }[]
    | null
  data?: Record<string, unknown> | null
}

type OrderRow = {
  id: string
  status?: string | null
  metadata?: Record<string, unknown> | null
  payment_collections?:
    | {
        status?: string | null
      }[]
    | null
  items?:
    | {
        id: string
        quantity?: number | string | null
        detail?: {
          quantity?: number | string | null
          fulfilled_quantity?: number | string | null
        } | null
      }[]
    | null
  fulfillments?: FulfillmentRow[] | null
  shipping_methods?:
    | { shipping_option_id?: string | null }[]
    | null
}

function asQty(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return Number(value) || 0
}

async function loadOrder(
  container: MedusaContainer,
  orderId: string
): Promise<OrderRow | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "metadata",
      "items.id",
      "items.quantity",
      // Sipariş kalemi adedi order_item'da (detail) durur; yalnız "items.quantity"
      // istenirse Medusa adedi boş döner ve toplamlar 0 hesaplanır.
      "items.detail.quantity",
      "items.detail.fulfilled_quantity",
      "payment_collections.status",
      "shipping_methods.shipping_option_id",
      "fulfillments.id",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.canceled_at",
      "fulfillments.items.line_item_id",
      "fulfillments.items.quantity",
      "fulfillments.labels.tracking_number",
      "fulfillments.labels.tracking_url",
      "fulfillments.labels.label_url",
      "fulfillments.data",
    ],
    filters: { id: orderId },
  })
  return (data?.[0] as OrderRow | undefined) || null
}

function activeFulfillments(order: OrderRow) {
  return (order.fulfillments || []).filter((f) => !f.canceled_at)
}

async function withManualShipping<T>(
  container: MedusaContainer,
  orderId: string,
  fn: (soId?: string) => Promise<T>
): Promise<T> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["shipping_methods.shipping_option_id"],
    filters: { id: orderId },
  })
  const soId = (
    orders?.[0] as { shipping_methods?: { shipping_option_id?: string }[] }
  )?.shipping_methods?.[0]?.shipping_option_id

  const fulMod = container.resolve(Modules.FULFILLMENT) as {
    updateShippingOptions: (
      id: string,
      data: Record<string, unknown>
    ) => Promise<unknown>
    retrieveShippingOption: (id: string) => Promise<{ provider_id?: string }>
  }

  let prev: string | undefined
  if (soId) {
    const before = await fulMod.retrieveShippingOption(soId)
    prev = before.provider_id
    if (prev && prev !== MANUAL_PROVIDER_ID) {
      await fulMod.updateShippingOptions(soId, { provider_id: MANUAL_PROVIDER_ID })
    }
  }
  try {
    return await fn(soId)
  } finally {
    if (soId && prev && prev !== MANUAL_PROVIDER_ID) {
      await fulMod.updateShippingOptions(soId, { provider_id: prev })
    }
  }
}

async function createPreparedFulfillment(
  container: MedusaContainer,
  order: OrderRow
): Promise<string> {
  const locationId = await resolveDefaultStockLocationId(container)
  if (!locationId) {
    throw new Error("Stok lokasyonu bulunamadı")
  }

  const items = (order.items || [])
    .map((item) => {
      const qty = asQty(item.detail?.quantity ?? item.quantity)
      const fulfilled = asQty(item.detail?.fulfilled_quantity)
      const remaining = Math.max(0, qty - fulfilled)
      return { id: item.id, quantity: remaining }
    })
    .filter((i) => i.quantity > 0)

  if (!items.length) {
    const existing = activeFulfillments(order)[0]
    if (existing?.id) return existing.id
    throw new Error("Hazırlanacak ürün kalmadı")
  }

  return withManualShipping(container, order.id, async (soId) => {
    const { result } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: order.id,
        items,
        location_id: locationId,
        ...(soId ? { shipping_option_id: soId } : {}),
        no_notification: true,
      },
    })
    const fulfillmentId =
      (result as { id?: string } | undefined)?.id ||
      (Array.isArray(result) ? (result[0] as { id?: string })?.id : undefined)
    if (!fulfillmentId) throw new Error("Fulfillment oluşturulamadı")
    return fulfillmentId
  })
}

async function loadFulfillmentData(
  container: MedusaContainer,
  fulfillmentId: string
): Promise<Record<string, unknown>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "fulfillment", fields: ["id", "data"], filters: { id: fulfillmentId } })
  return ((data?.[0] as { data?: Record<string, unknown> | null } | undefined)?.data || {}) as Record<string, unknown>
}

/** Elle girilen takip no/linkini normalize data + labels[]'a yazar (carrier: manual). */
async function attachTracking(
  container: MedusaContainer,
  fulfillmentId: string,
  trackingNumber?: string | null,
  trackingUrl?: string | null
) {
  const number = (trackingNumber || "").trim()
  const url = (trackingUrl || "").trim()
  if (!number && !url) return
  const current = await loadFulfillmentData(container, fulfillmentId)
  await patchFulfillmentData(
    container,
    fulfillmentId,
    {
      ...(number ? { tracking_number: number } : {}),
      ...(url ? { tracking_url: url } : {}),
      // Firma adaptörü açmadıysa kayıt elle kargodur; adaptör verisi ezilmez.
      ...(current.carrier ? {} : { carrier: "manual" }),
    },
    [{ tracking_number: number, tracking_url: url, label_url: "" }]
  )
}

async function shipFulfillment(
  container: MedusaContainer,
  order: OrderRow,
  fulfillmentId: string,
  trackingNumber?: string | null,
  trackingUrl?: string | null,
  noNotification = false
) {
  const fulfillment = activeFulfillments(order).find((f) => f.id === fulfillmentId)
  if (fulfillment?.shipped_at) {
    await attachTracking(container, fulfillmentId, trackingNumber, trackingUrl)
    return
  }

  const seen = new Set<string>()
  const shipmentItems: { id: string; quantity: number }[] = []
  for (const row of fulfillment?.items || []) {
    const lineId = row.line_item_id ? String(row.line_item_id) : ""
    if (!lineId || seen.has(lineId)) continue
    seen.add(lineId)
    shipmentItems.push({
      id: lineId,
      quantity: Math.max(1, asQty(row.quantity)),
    })
  }

  if (!shipmentItems.length) {
    // Fallback: ship all order items
    for (const item of order.items || []) {
      shipmentItems.push({
        id: item.id,
        quantity: Math.max(1, asQty(item.quantity)),
      })
    }
  }

  if (!shipmentItems.length) {
    throw new Error("Kargolanacak kalem yok")
  }

  const number = (trackingNumber || "").trim()
  const url = (trackingUrl || "").trim()
  const labels =
    number || url
      ? [
          {
            tracking_number: number,
            tracking_url: url,
            label_url: "",
          },
        ]
      : []

  await createOrderShipmentWorkflow(container).run({
    input: {
      order_id: order.id,
      fulfillment_id: fulfillmentId,
      items: shipmentItems,
      labels,
      no_notification: noNotification,
    },
  })

  if (number || url) {
    await attachTracking(container, fulfillmentId, number, url)
  }
}

/**
 * Admin: advance customer-facing order timeline via Medusa fulfill/ship/deliver.
 */
export async function advanceOrderStatus(
  container: MedusaContainer,
  input: {
    orderId: string
    action: OrderStatusAction
    tracking_number?: string | null
    tracking_url?: string | null
    /** Kargoya verildi / teslim edildi maili gönderilmez (geçmişe dönük düzeltme). */
    no_notification?: boolean
  }
): Promise<{
  ok: true
  action: OrderStatusAction
  fulfillmentId?: string
  timeline: ReturnType<typeof resolveOrderTimeline>
}> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  let order = await loadOrder(container, input.orderId)
  if (!order?.id) {
    throw new Error(`Sipariş bulunamadı: ${input.orderId}`)
  }
  if ((order.status || "").toLowerCase() === "canceled") {
    throw new Error("İptal edilmiş sipariş ilerletilemez")
  }

  const suggested = nextOrderStatusAction(order)
  // Allow explicit action even if already past (idempotent) — but reject going backwards meaningfully
  const action = input.action

  logger.info(
    `[order-status] order=${order.id} action=${action} suggested=${suggested || "none"}`
  )

  let fulfillmentId = activeFulfillments(order)[0]?.id
  const noNotification = input.no_notification === true

  if (action === "prepare") {
    if (!fulfillmentId) {
      fulfillmentId = await createPreparedFulfillment(container, order)
    }
    // Etiket basılmadan "Hazırlandı" yalnız bu elle işaretle gelir.
    const orderModule = container.resolve(Modules.ORDER) as {
      updateOrders: (id: string, data: Record<string, unknown>) => Promise<unknown>
    }
    await orderModule.updateOrders(order.id, {
      metadata: { prepared_at: new Date().toISOString() },
    })
  } else if (action === "ship") {
    if (!fulfillmentId) {
      fulfillmentId = await createPreparedFulfillment(container, order)
      order = (await loadOrder(container, order.id))!
    }
    await shipFulfillment(
      container,
      order,
      fulfillmentId,
      input.tracking_number,
      input.tracking_url,
      noNotification
    )
  } else if (action === "deliver") {
    if (!fulfillmentId) {
      fulfillmentId = await createPreparedFulfillment(container, order)
      order = (await loadOrder(container, order.id))!
    }
    const ful = activeFulfillments(order).find((f) => f.id === fulfillmentId)
    if (!ful?.shipped_at) {
      await shipFulfillment(
        container,
        order,
        fulfillmentId,
        input.tracking_number,
        input.tracking_url,
        noNotification
      )
      order = (await loadOrder(container, order.id))!
    } else if (input.tracking_number || input.tracking_url) {
      await attachTracking(
        container,
        fulfillmentId,
        input.tracking_number,
        input.tracking_url
      )
    }

    const afterShip = activeFulfillments(order).find((f) => f.id === fulfillmentId)
    if (!afterShip?.delivered_at) {
      await markOrderFulfillmentAsDeliveredWorkflow(container).run({
        input: {
          orderId: order.id,
          fulfillmentId,
          no_notification: noNotification,
        },
      })
    }
  } else {
    throw new Error(`Geçersiz aksiyon: ${action}`)
  }

  const refreshed = await loadOrder(container, order.id)
  return {
    ok: true,
    action,
    fulfillmentId,
    timeline: resolveOrderTimeline(refreshed || order),
  }
}
