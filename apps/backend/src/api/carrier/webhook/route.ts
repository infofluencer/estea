import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getConfiguredCarrier, listCarrierAdapters } from "../../../modules/carrier/registry"
import { readFulfillmentData, type CarrierWebhook } from "../../../modules/carrier/types"
import { applyCarrierAction, patchFulfillmentData } from "../../../lib/carrier-actions"
import { errorText, recordOpsEvent } from "../../../lib/ops-events"

/**
 * POST /carrier/webhook[?carrier=<kod>][&token=…]
 *
 * AUTH yok (firma sunucusu çağırır). Doğrulama adaptörün `parseWebhook`'unda
 * (CARRIER_WEBHOOK_SECRET / imza). Her zaman 200: firma tekrar denemesin;
 * işlenemeyen bildirimler Logs'a düşer.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const code = String((req.query as Record<string, unknown>).carrier ?? "").toLowerCase()
  const adapter =
    (code && listCarrierAdapters().find((a) => a.code === code)) || getConfiguredCarrier()
  if (!adapter?.parseWebhook) {
    return res.status(200).json({ ok: false, reason: "no carrier adapter" })
  }

  let parsed: CarrierWebhook | null = null
  try {
    parsed = adapter.parseWebhook({
      headers: req.headers as Record<string, string | string[] | undefined>,
      query: req.query as Record<string, unknown>,
      body: req.body,
      rawBody: (req as { rawBody?: string | Buffer }).rawBody,
    })
  } catch (error) {
    logger.warn(`[carrier-webhook] ${adapter.code} ayrıştırılamadı: ${errorText(error)}`)
  }
  if (!parsed) {
    await recordOpsEvent(req.scope, {
      kind: "shipment.webhook",
      level: "warning",
      title: `Kargo bildirimi reddedildi (${adapter.code}: imza/sır uyuşmadı veya tanınmadı) · ${new Date().toISOString().slice(0, 10)}`,
      oncePerTitle: true,
    })
    return res.status(200).json({ ok: false, reason: "rejected" })
  }

  const fulfillment = await findFulfillment(req, adapter.code, parsed)
  if (!fulfillment) {
    await recordOpsEvent(req.scope, {
      kind: "shipment.webhook",
      level: "warning",
      title: `Kargo bildirimi eşleşmedi: ${parsed.orderReference || parsed.shipmentRef}`,
      detail: parsed.summary || null,
      oncePerTitle: true,
    })
    return res.status(200).json({ ok: false, reason: "no fulfillment" })
  }

  try {
    await patchFulfillmentData(req.scope, fulfillment.id, parsed.patch, parsed.labels)
    await recordOpsEvent(req.scope, {
      kind: "shipment.webhook",
      level: "info",
      title: `Kargo bildirimi: ${parsed.orderReference || parsed.shipmentRef} · ${parsed.summary || parsed.action}`,
      orderId: fulfillment.orderId,
      data: { fulfillment_id: fulfillment.id, action: parsed.action },
      oncePerTitle: true,
    })
    if (parsed.action !== "none") {
      const result = await applyCarrierAction(req.scope, {
        fulfillmentId: fulfillment.id,
        action: parsed.action,
        source: `${adapter.code} webhook`,
      })
      if (!result.ok) {
        await recordOpsEvent(req.scope, {
          kind: "shipment.webhook",
          level: "error",
          title: `Kargo bildirimi işlenemedi: ${parsed.orderReference || parsed.shipmentRef} · ${parsed.summary || parsed.action}`,
          detail: result.message,
          orderId: fulfillment.orderId,
          oncePerTitle: true,
        })
      }
    }
  } catch (error) {
    await recordOpsEvent(req.scope, {
      kind: "shipment.webhook",
      level: "error",
      title: `Kargo bildirimi işlenemedi: ${parsed.orderReference || parsed.shipmentRef} · ${parsed.summary || parsed.action}`,
      detail: errorText(error),
      orderId: fulfillment.orderId,
      oncePerTitle: true,
    })
  }
  return res.status(200).json({ ok: true })
}

/** shipment_ref ile eşleşen aktif fulfillment (önce sipariş referansı, sonra son 500 kayıt). */
async function findFulfillment(
  req: MedusaRequest,
  carrierCode: string,
  parsed: CarrierWebhook
): Promise<{ id: string; orderId: string | null } | null> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const matches = (data: Record<string, unknown> | null | undefined) => {
    const d = readFulfillmentData(data)
    return d.carrier === carrierCode && d.shipment_ref === parsed.shipmentRef
  }

  const ref = (parsed.orderReference || "").trim()
  const displayId = ref ? Number(ref.replace(/[^0-9]/g, "")) : NaN
  if (Number.isFinite(displayId) && displayId > 0) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "fulfillments.id", "fulfillments.canceled_at", "fulfillments.data"],
      // Medusa query graph types display_id as string filter (bkz. store/orders/lookup)
      filters: { display_id: String(displayId) },
    })
    for (const o of orders as { id: string; fulfillments?: { id: string; canceled_at?: unknown; data?: Record<string, unknown> | null }[] }[]) {
      const f = (o.fulfillments || []).find((x) => !x.canceled_at && matches(x.data))
      if (f) return { id: f.id, orderId: o.id }
    }
  }

  const { data } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "canceled_at", "data"],
    pagination: { take: 500, order: { created_at: "DESC" } },
  })
  const f = (data as { id: string; canceled_at?: unknown; data?: Record<string, unknown> | null }[]).find(
    (x) => !x.canceled_at && matches(x.data)
  )
  if (!f) return null
  const { data: links } = await query.graph({
    entity: "order_fulfillment",
    fields: ["order_id", "fulfillment_id"],
    filters: { fulfillment_id: f.id },
  })
  return { id: f.id, orderId: (links?.[0] as { order_id?: string } | undefined)?.order_id || null }
}
