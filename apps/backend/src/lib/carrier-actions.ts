import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { getCarrierFor } from "../modules/carrier/registry"
import {
  mergeFulfillmentData,
  readFulfillmentData,
  type FulfillmentAction,
  type LabelRow,
} from "../modules/carrier/types"
import { recordOpsEvent } from "./ops-events"

export type FulfillmentRow = {
  id: string
  shipped_at?: string | Date | null
  delivered_at?: string | Date | null
  canceled_at?: string | Date | null
  items?: { line_item_id?: string | null; quantity?: number | string | null }[] | null
  labels?: { tracking_number?: string | null; tracking_url?: string | null; label_url?: string | null }[] | null
  data?: Record<string, unknown> | null
}

function asQty(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return Number(value) || 0
}

export async function findOrderIdForFulfillment(
  container: MedusaContainer,
  fulfillmentId: string
): Promise<string | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order_fulfillment",
    fields: ["order_id", "fulfillment_id"],
    filters: { fulfillment_id: fulfillmentId },
  })
  return (data?.[0] as { order_id?: string } | undefined)?.order_id || null
}

export async function loadFulfillment(
  container: MedusaContainer,
  fulfillmentId: string
): Promise<FulfillmentRow | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id",
      "shipped_at",
      "delivered_at",
      "canceled_at",
      "items.line_item_id",
      "items.quantity",
      "labels.tracking_number",
      "labels.tracking_url",
      "labels.label_url",
      "data",
    ],
    filters: { id: fulfillmentId },
  })
  return (data?.[0] as FulfillmentRow | undefined) || null
}

/** Sevkiyat etiket satırları: labels[] varsa o, yoksa normalize data'dan tek satır. */
export function buildShipmentLabels(fulfillment: FulfillmentRow): LabelRow[] {
  const fromLabels = (fulfillment.labels || [])
    .filter((l) => l.tracking_number || l.tracking_url || l.label_url)
    .map((l) => ({
      tracking_number: l.tracking_number || "",
      tracking_url: l.tracking_url || "",
      label_url: l.label_url || "",
    }))
  if (fromLabels.length) return fromLabels

  const d = readFulfillmentData(fulfillment.data)
  const trackingNumber = d.tracking_number || d.barcode || d.shipment_ref || ""
  const trackingUrl =
    d.tracking_url ||
    (trackingNumber ? getCarrierFor(fulfillment.data)?.trackingUrl(trackingNumber) ?? "" : "")
  const labelUrl = d.label_url || ""
  if (!trackingNumber && !trackingUrl && !labelUrl) return []
  return [{ tracking_number: trackingNumber, tracking_url: trackingUrl, label_url: labelUrl }]
}

/**
 * Medusa ikinci sevkiyat/teslimi "Fulfillment with id … already shipped|delivered"
 * ile reddeder. Webhook + polling aynı anda gelirse kaybeden bu hatayı alır —
 * çift işlem olmadığının kanıtıdır.
 */
export function isAlreadyDone(error: unknown, what: "shipped" | "delivered"): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "")
  return new RegExp(`already\\s+${what}`, "i").test(message)
}

/** Takip bilgisini fulfillment.data (normalize) + labels[]'a yazar. */
export async function patchFulfillmentData(
  container: MedusaContainer,
  fulfillmentId: string,
  patch: Record<string, unknown>,
  labels?: LabelRow[]
): Promise<void> {
  const fulSvc = container.resolve(Modules.FULFILLMENT) as {
    updateFulfillment: (id: string, data: Record<string, unknown>) => Promise<unknown>
    retrieveFulfillment?: (id: string, config?: Record<string, unknown>) => Promise<{ data?: Record<string, unknown> | null }>
  }
  let prev: Record<string, unknown> = {}
  try {
    if (typeof fulSvc.retrieveFulfillment === "function") {
      const row = await fulSvc.retrieveFulfillment(fulfillmentId, { select: ["id", "data"] })
      prev = (row?.data || {}) as Record<string, unknown>
    }
  } catch {
    prev = {}
  }
  await fulSvc.updateFulfillment(fulfillmentId, {
    data: mergeFulfillmentData(prev, patch),
    ...(labels?.length ? { labels } : {}),
  })
}

/**
 * Taşıyıcı durumunu Medusa order fulfillment'ına uygular (idempotent).
 * shipped → createOrderShipmentWorkflow → shipment.created → "Kargoya verildi" maili
 * delivered → (önce shipped) markOrderFulfillmentAsDelivered → delivery.created → "Teslim edildi" maili
 */
export async function applyCarrierAction(
  container: MedusaContainer,
  input: { fulfillmentId: string; action: FulfillmentAction; source?: string }
): Promise<{ ok: true; did?: string } | { ok: false; message: string }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { fulfillmentId, action } = input
  const source = input.source || "kargo"

  if (action === "failed" || action === "returned") {
    const problemOrderId = await findOrderIdForFulfillment(container, fulfillmentId)
    await recordOpsEvent(container, {
      kind: "shipment.problem",
      level: action === "failed" ? "error" : "warning",
      title: action === "failed" ? "Kargo firması gönderide hata bildirdi" : "Gönderi iade sürecine girdi",
      detail: `Durum: ${action} (${source}). Gönderiyi kargo firmasının panelinden kontrol edin.`,
      orderId: problemOrderId,
      data: { fulfillment_id: fulfillmentId, action },
      once: true,
    })
    return { ok: true, did: "none" }
  }

  if (action !== "shipped" && action !== "delivered") {
    return { ok: true, did: "none" }
  }

  const orderId = await findOrderIdForFulfillment(container, fulfillmentId)
  if (!orderId) return { ok: false, message: `No order linked to fulfillment ${fulfillmentId}` }

  let fulfillment = await loadFulfillment(container, fulfillmentId)
  if (!fulfillment) return { ok: false, message: `Fulfillment not found: ${fulfillmentId}` }

  if (!fulfillment.shipped_at) {
    // Benzersiz sipariş kalemleri; Medusa adedi fulfillment kalemlerinden yeniden hesaplar.
    const seen = new Set<string>()
    const shipmentItems: { id: string; quantity: number }[] = []
    for (const row of fulfillment.items || []) {
      const lineId = row.line_item_id ? String(row.line_item_id) : ""
      if (!lineId || seen.has(lineId)) continue
      seen.add(lineId)
      shipmentItems.push({ id: lineId, quantity: Math.max(1, asQty(row.quantity)) })
    }
    if (!shipmentItems.length) return { ok: false, message: "Fulfillment has no line items to ship" }

    const labels = buildShipmentLabels(fulfillment)
    logger.info(`[carrier-action] Shipping fulfillment=${fulfillmentId} order=${orderId} (${source})`)
    try {
      await createOrderShipmentWorkflow(container).run({
        input: { order_id: orderId, fulfillment_id: fulfillmentId, items: shipmentItems, labels },
      })
    } catch (error) {
      if (!isAlreadyDone(error, "shipped")) throw error
      logger.info(`[carrier-action] fulfillment=${fulfillmentId} başka bir kanal zaten kargoya vermiş — atlandı`)
    }
    fulfillment = await loadFulfillment(container, fulfillmentId)
    await recordOpsEvent(container, {
      kind: "shipment.shipped",
      level: "info",
      title: "Kargoya verildi (kurye teslim aldı)",
      detail: labels[0]?.tracking_number ? `Takip no: ${labels[0].tracking_number}` : null,
      orderId,
      once: true,
    })
  }

  if (action === "delivered") {
    if (fulfillment?.delivered_at) return { ok: true, did: "already_delivered" }
    logger.info(`[carrier-action] Delivering fulfillment=${fulfillmentId} order=${orderId} (${source})`)
    try {
      await markOrderFulfillmentAsDeliveredWorkflow(container).run({ input: { orderId, fulfillmentId } })
    } catch (error) {
      if (!isAlreadyDone(error, "delivered")) throw error
      logger.info(`[carrier-action] fulfillment=${fulfillmentId} başka bir kanal zaten teslim etmiş — atlandı`)
      return { ok: true, did: "already_delivered" }
    }
    await recordOpsEvent(container, { kind: "shipment.delivered", level: "info", title: "Teslim edildi", orderId, once: true })
    return { ok: true, did: "delivered" }
  }

  return { ok: true, did: "shipped" }
}
