import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getConfiguredCarrier, listCarrierAdapters } from "../../../modules/carrier/registry"
import type { CarrierWebhook } from "../../../modules/carrier/types"
import { applyCarrierAction, patchFulfillmentData } from "../../../lib/carrier-actions"
import { errorText, recordOpsEvent } from "../../../lib/ops-events"
import { findFulfillmentByCarrierRef } from "../../../lib/shipping/open-fulfillments"

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
  // Mareen dersi: "son N kayıt" taraması eski gönderilerin teslim bildirimini kaçırır.
  // Sipariş referansı → etiket tablosu (takip no) → açık kayıtların sayfalı taraması.
  const found = await findFulfillmentByCarrierRef(req.scope, {
    carrierCode,
    shipmentRef: parsed.shipmentRef,
    trackingNumbers: [parsed.patch?.tracking_number as string | undefined, parsed.patch?.barcode as string | undefined],
    orderReference: parsed.orderReference,
  })
  return found ? { id: found.id, orderId: found.orderId } : null
}
