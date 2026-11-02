import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getCarrierFor, getConfiguredCarrier } from "../../modules/carrier/registry"
import { EXTERNAL_SHIPMENT_METADATA_KEY } from "../../modules/carrier/service"
import { hasCarrierShipment, readFulfillmentData, type LabelRow } from "../../modules/carrier/types"
import { autoFulfillPaidOrder } from "../auto-fulfill-order"
import { applyCarrierAction, patchFulfillmentData } from "../carrier-actions"
import { recordOpsEvent } from "../ops-events"
import { findFulfillmentByCarrierRef } from "./open-fulfillments"

/**
 * Şubede / firma panelinde elle açılmış gönderiyi siparişe bağlar.
 *
 * Mareen dersi: elle açılan gönderiler sisteme hiç düşmedi; paketler teslim edildi
 * ama sipariş açık kaldı. Bu araç firmaya YENİ kayıt açmaz: sipariş kaydına
 * taşıyıcı kimliğini (shipment_ref / takip no) yazar; sonrası webhook ve yoklama
 * ile normal gönderi gibi yürür.
 */

export type AttachExternalInput = {
  orderId: string
  shipmentRef?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  /** Adaptör kodu; boşsa yapılandırılmış adaptör, o da yoksa "manual". */
  carrier?: string | null
  /** Paket zaten kargoya verildi → "Kargoya verildi" (mail) de işlensin. */
  markShipped?: boolean
  /** Paket teslim edildi → kargoya verildi + teslim edildi işlensin. */
  markDelivered?: boolean
  /** Mevcut kayıtta farklı firma kimliği varsa üzerine yaz. */
  force?: boolean
  actorId?: string | null
  source?: string
}

export type AttachExternalResult =
  | { ok: true; fulfillmentId: string; created: boolean; did: "attached" | "already_attached" }
  | { ok: false; status: 400 | 404 | 409; message: string }

type OrderRow = {
  id: string
  status?: string | null
  fulfillments?: { id: string; canceled_at?: unknown; shipped_at?: unknown; delivered_at?: unknown; data?: Record<string, unknown> | null }[] | null
}

export async function attachExternalShipment(container: MedusaContainer, input: AttachExternalInput): Promise<AttachExternalResult> {
  const shipmentRef = (input.shipmentRef || "").trim()
  const trackingNumber = (input.trackingNumber || "").trim()
  if (!shipmentRef && !trackingNumber) {
    return { ok: false, status: 400, message: "Gönderi kimliği ya da takip numarası gerekli." }
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "fulfillments.id", "fulfillments.canceled_at", "fulfillments.shipped_at", "fulfillments.delivered_at", "fulfillments.data"],
    filters: { id: input.orderId },
  })
  const order = data?.[0] as OrderRow | undefined
  if (!order) return { ok: false, status: 404, message: "Sipariş bulunamadı." }
  if ((order.status || "").toLowerCase() === "canceled") {
    return { ok: false, status: 409, message: "Sipariş iptal edilmiş; iptal siparişe gönderi bağlanmaz." }
  }

  const requestedCode = (input.carrier || "").trim().toLowerCase()
  const adapter = (requestedCode ? getCarrierFor({ carrier: requestedCode }) : null) ?? getConfiguredCarrier()
  const carrierCode = requestedCode || adapter?.code || "manual"
  const carrierName = adapter && adapter.code === carrierCode ? adapter.name : requestedCode ? requestedCode : "Kargo"
  const trackingUrl =
    (input.trackingUrl || "").trim() || (trackingNumber && adapter && adapter.code === carrierCode ? adapter.trackingUrl(trackingNumber) : "")

  // Aynı gönderi başka bir siparişte mi? (Mareen: "aynı gönderi iki siparişte")
  const elsewhere = await findFulfillmentByCarrierRef(container, {
    carrierCode: carrierCode === "manual" ? null : carrierCode,
    shipmentRef: shipmentRef || null,
    trackingNumbers: [trackingNumber],
  })
  if (elsewhere && elsewhere.orderId && elsewhere.orderId !== order.id && !input.force) {
    return {
      ok: false,
      status: 409,
      message: `Bu gönderi kimliği başka bir siparişin kaydında (${elsewhere.orderId}). Yanlışsa o kaydı düzeltin ya da force ile üzerine yazın.`,
    }
  }

  const patch: Record<string, unknown> = {
    carrier: carrierCode,
    carrier_name: carrierName,
    shipment_ref: shipmentRef || trackingNumber,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    attached_externally: true,
    attached_at: new Date().toISOString(),
    attached_by: input.actorId || null,
  }
  const labels: LabelRow[] = trackingNumber ? [{ tracking_number: trackingNumber, tracking_url: trackingUrl, label_url: "" }] : []

  const active = (order.fulfillments || []).find((f) => !f.canceled_at)
  let fulfillmentId: string
  let created = false
  let did: "attached" | "already_attached" = "attached"

  if (active) {
    const current = readFulfillmentData(active.data)
    const sameRef = current.shipment_ref && current.shipment_ref === (shipmentRef || trackingNumber)
    if (hasCarrierShipment(active.data) && !sameRef && !input.force) {
      return {
        ok: false,
        status: 409,
        message: `Bu siparişin kaydında firmada açılmış başka bir gönderi var (ref ${current.shipment_ref}). Önce onu "Yeniden aç" ile iptal edin ya da force ile üzerine yazın.`,
      }
    }
    if (sameRef && current.tracking_number === trackingNumber) did = "already_attached"
    await patchFulfillmentData(container, active.id, patch, labels)
    fulfillmentId = active.id
  } else {
    const res = await autoFulfillPaidOrder(container, order.id, {
      manual: true,
      metadata: { [EXTERNAL_SHIPMENT_METADATA_KEY]: patch },
    })
    if (!res.ok) return { ok: false, status: 409, message: res.message }
    if (!res.fulfillmentId) return { ok: false, status: 409, message: `Kargo kaydı açılamadı: ${res.skipped || "bilinmeyen neden"}` }
    fulfillmentId = res.fulfillmentId
    created = true
  }

  if (did === "attached") {
    await recordOpsEvent(container, {
      kind: "shipment.attached",
      level: "info",
      title: `Dış gönderi bağlandı: ${shipmentRef || trackingNumber}${trackingNumber && shipmentRef ? ` · takip ${trackingNumber}` : ""}`,
      detail: created ? "Sipariş için yeni kargo kaydı açıldı (firmaya istek gitmedi)." : "Mevcut kargo kaydına yazıldı.",
      orderId: order.id,
      data: { fulfillment_id: fulfillmentId, carrier: carrierCode, by: input.actorId || null, source: input.source || "admin" },
    })
  }

  if (input.markDelivered || input.markShipped) {
    const r = await applyCarrierAction(container, {
      fulfillmentId,
      action: input.markDelivered ? "delivered" : "shipped",
      source: input.source || "dış gönderi bağlama",
    })
    if (!r.ok) return { ok: false, status: 409, message: r.message }
  }

  return { ok: true, fulfillmentId, created, did }
}
