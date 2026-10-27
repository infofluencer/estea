import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getCarrierFor } from "../../modules/carrier/registry"
import { readFulfillmentData, type FulfillmentAction } from "../../modules/carrier/types"
import { applyCarrierAction, patchFulfillmentData } from "../carrier-actions"
import { errorText, recordOpsEvent } from "../ops-events"

type Row = {
  id: string
  created_at?: string | Date | null
  shipped_at?: string | Date | null
  delivered_at?: string | Date | null
  canceled_at?: string | Date | null
  data?: Record<string, unknown> | null
}

/** Son N gün içinde açılmış, teslim edilmemiş, firmada kaydı olan gönderiler. */
export async function listTrackTargets(container: MedusaContainer, lookbackDays = 30): Promise<Row[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
  const { data } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "created_at", "shipped_at", "delivered_at", "canceled_at", "data"],
    filters: { created_at: { $gte: since } },
    pagination: { take: 500, order: { created_at: "DESC" } },
  })
  return (data as Row[]).filter((f) => !f.canceled_at && !f.delivered_at && readFulfillmentData(f.data).shipment_ref)
}

/**
 * Polling: adaptör `getStatus` sunuyorsa açık gönderileri sorar ve aksiyonu uygular.
 * Webhook ile birlikte çalışabilir — `applyCarrierAction` yarışı yutar.
 */
export async function trackOpenShipments(container: MedusaContainer): Promise<{ checked: number; changed: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const targets = await listTrackTargets(container)
  let checked = 0
  let changed = 0
  for (const f of targets) {
    const adapter = getCarrierFor(f.data)
    if (!adapter?.getStatus) continue
    checked++
    try {
      const status = await adapter.getStatus(f.data || {})
      const prev = readFulfillmentData(f.data)
      if (prev.status_code !== status.code) {
        await patchFulfillmentData(container, f.id, {
          status_code: status.code,
          status: status.description,
          status_at: new Date().toISOString(),
        })
        changed++
      }
      const action: FulfillmentAction = status.action
      if (action === "shipped" && f.shipped_at) continue
      if (action !== "none") {
        const res = await applyCarrierAction(container, { fulfillmentId: f.id, action, source: `${adapter.code} yoklaması` })
        if (!res.ok) {
          await recordOpsEvent(container, {
            kind: "shipment.poll",
            level: "error",
            title: `Kargo durumu işlenemedi: ${prev.order_reference || f.id} · ${status.code}`,
            detail: res.message,
            data: { fulfillment_id: f.id, status },
            oncePerTitle: true,
          })
        }
      }
    } catch (error) {
      logger.warn(`[track-shipments] ${adapter.code} ${f.id} sorgulanamadı: ${errorText(error)}`)
    }
  }
  return { checked, changed }
}
