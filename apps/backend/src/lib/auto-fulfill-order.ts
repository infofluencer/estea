import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { autoFulfillOnPayment, configuredCarrierCode, isCarrierConfigured } from "../modules/carrier/registry"
import { hasCarrierShipment } from "../modules/carrier/types"
import { resolveDefaultStockLocationId } from "./default-stock-location"

/** Ödeme id → sipariş id (payment → collection → order). */
export async function findOrderIdForPayment(
  container: MedusaContainer,
  paymentId: string
): Promise<string | null> {
  if (!paymentId) return null
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: payments } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection_id"],
    filters: { id: paymentId },
  })
  const collectionId = (payments?.[0] as { payment_collection_id?: string } | undefined)?.payment_collection_id
  if (!collectionId) return null
  const { data: links } = await query.graph({
    entity: "order_payment_collection",
    fields: ["order_id", "payment_collection_id"],
    filters: { payment_collection_id: collectionId },
  })
  return (links?.[0] as { order_id?: string } | undefined)?.order_id || null
}

type OrderForFulfill = {
  id: string
  status?: string | null
  email?: string | null
  metadata?: Record<string, unknown> | null
  items?: { id: string; quantity?: number; detail?: { quantity?: number | string | null; fulfilled_quantity?: number | string | null } | null }[] | null
  fulfillments?: { id: string; canceled_at?: string | Date | null; data?: Record<string, unknown> | null; provider_id?: string | null }[] | null
  shipping_methods?: { shipping_option_id?: string | null }[] | null
}

function asQty(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return Number(value) || 0
}

/**
 * Ödeme capture sonrası kalan kalemler için Medusa fulfillment açar.
 * Shipping option provider'ı `carrier_carrier` ise adaptör gönderi/etiket üretir;
 * `manual_manual` ise yalnızca kayıt açılır (admin takip no girer).
 *
 * Atlanır: SHIPPING_AUTO_FULFILL kapalı (manual modda varsayılan), sipariş iptal,
 * kalan adet 0 veya aktif bir gönderi zaten var.
 */
export async function autoFulfillPaidOrder(
  container: MedusaContainer,
  orderId: string,
  opts: {
    /** Admin "yeniden dene" — otomatik açma kapalı olsa da çalışır. */
    manual?: boolean
    /** Yalnız bu kalemler (değişimde eklenen yeni ürün) → mevcut gönderi olsa da yeni gönderi açılır. */
    items?: { id: string; quantity: number }[]
    /** Fulfillment metadata'sına eklenir (ör. escay_exchange_return_id). */
    metadata?: Record<string, unknown>
  } = {}
): Promise<{ ok: true; fulfillmentId?: string; skipped?: string } | { ok: false; message: string }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!opts.manual && !autoFulfillOnPayment()) {
    return { ok: true, skipped: "SHIPPING_AUTO_FULFILL disabled (manual carrier)" }
  }
  const code = configuredCarrierCode()
  if (code && !isCarrierConfigured()) {
    return { ok: false, message: `SHIPPING_CARRIER="${code}" için adaptör yok` }
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "email",
      "metadata",
      "items.id",
      "items.quantity",
      // Adet order_item (detail) tablosunda — yalnız items.quantity istenirse boş döner (ders #6).
      "items.detail.quantity",
      "items.detail.fulfilled_quantity",
      "fulfillments.id",
      "fulfillments.canceled_at",
      "fulfillments.provider_id",
      "fulfillments.data",
      "shipping_methods.shipping_option_id",
    ],
    filters: { id: orderId },
  })
  const order = data?.[0] as OrderForFulfill | undefined
  if (!order?.id) return { ok: false, message: `Order not found: ${orderId}` }
  if (order.status === "canceled") return { ok: true, skipped: "order canceled" }

  // Fulfill workflow provider'a order.email vermez → metadata yedeği (provider okur).
  const recipientEmail = String(order.email || "").trim()
  const orderModule = container.resolve(Modules.ORDER) as {
    updateOrders: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }
  if (recipientEmail && order.metadata?.email !== recipientEmail) {
    try {
      await orderModule.updateOrders(orderId, { metadata: { ...(order.metadata || {}), email: recipientEmail } })
    } catch (e) {
      logger.warn(`[auto-fulfill] order.metadata.email yazılamadı order=${orderId}: ${String(e)}`)
    }
  }

  const existing = (order.fulfillments || []).find((f) => !f.canceled_at)
  if (existing && !opts.items) {
    return {
      ok: true,
      skipped: hasCarrierShipment(existing.data) ? "carrier shipment already exists" : "fulfillment already exists",
      fulfillmentId: existing.id,
    }
  }

  const items = opts.items
    ? opts.items.filter((i) => i.quantity > 0)
    : (order.items || [])
        .map((item) => {
          const qty = asQty(item.detail?.quantity ?? item.quantity)
          const fulfilled = asQty(item.detail?.fulfilled_quantity)
          return { id: item.id, quantity: Math.max(0, qty - fulfilled) }
        })
        .filter((i) => i.quantity > 0)
  if (!items.length) return { ok: true, skipped: "nothing left to fulfill" }

  const shippingOptionId = order.shipping_methods?.[0]?.shipping_option_id || undefined
  let locationId: string | undefined
  try {
    locationId = await resolveDefaultStockLocationId(container)
  } catch {
    locationId = undefined
  }
  if (!locationId) return { ok: false, message: "No stock location for auto-fulfill" }

  logger.info(`[auto-fulfill] Creating fulfillment — order=${orderId} items=${items.length}`)
  const { result } = await createOrderFulfillmentWorkflow(container).run({
    input: {
      order_id: orderId,
      items,
      location_id: locationId,
      ...(shippingOptionId ? { shipping_option_id: shippingOptionId } : {}),
      metadata: { ...(opts.metadata || {}), ...(recipientEmail ? { email: recipientEmail } : {}) },
      // Fulfillment açılışı bildirimsiz; "Kargoya verildi"/"Teslim edildi" olayları bildirimli (mail oradan).
      no_notification: true,
    },
  })
  const fulfillmentId =
    (result as { id?: string } | undefined)?.id ||
    (Array.isArray(result) ? (result[0] as { id?: string })?.id : undefined)
  logger.info(`[auto-fulfill] Done — order=${orderId} fulfillment=${fulfillmentId || "?"}`)
  return { ok: true, fulfillmentId }
}
