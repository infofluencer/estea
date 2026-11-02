import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { readFulfillmentData } from "../../modules/carrier/types"
import { applyCarrierAction } from "../carrier-actions"
import { attachExternalShipment } from "./attach-external-shipment"
import { displayIdFromReference, findFulfillmentByCarrierRef } from "./open-fulfillments"

/**
 * Firma raporu (CSV) ile uzlaştırma — Mareen'de sonradan yazılmak zorunda kalınan araç.
 *
 * Her satır: sipariş referansı (ESC-65) ve/veya takip no / gönderi kimliği, isteğe
 * bağlı firma durumu (shipped | delivered). Varsayılan KURU ÇALIŞMA: yalnız ne
 * yapılacağını söyler. `apply` ile: eksik kimlik bağlanır, kargoya verildi / teslim
 * edildi işlenir (idempotent; zaten yapılmışsa dokunmaz).
 */

export type ReconcileRow = {
  order_reference?: string | null
  tracking_number?: string | null
  shipment_ref?: string | null
  status?: "shipped" | "delivered" | "" | null
}

export type ReconcileAction = "ok" | "attach" | "ship" | "deliver" | "not_found" | "conflict" | "canceled"

export type ReconcileResult = ReconcileRow & {
  action: ReconcileAction
  order_id: string | null
  order_display_id: string | null
  fulfillment_id: string | null
  message: string
  applied?: boolean
  error?: string
}

type OrderRow = {
  id: string
  display_id?: number | string | null
  status?: string | null
  fulfillments?: { id: string; canceled_at?: unknown; shipped_at?: unknown; delivered_at?: unknown; data?: Record<string, unknown> | null }[] | null
}

async function loadOrder(container: MedusaContainer, filters: Record<string, unknown>): Promise<OrderRow | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "status", "fulfillments.id", "fulfillments.canceled_at", "fulfillments.shipped_at", "fulfillments.delivered_at", "fulfillments.data"],
    filters,
  })
  return (data?.[0] as OrderRow | undefined) || null
}

export async function planReconcileRow(container: MedusaContainer, row: ReconcileRow): Promise<ReconcileResult> {
  const tracking = (row.tracking_number || "").trim()
  const ref = (row.shipment_ref || "").trim()
  const status = (row.status || "").trim().toLowerCase() as ReconcileRow["status"]
  const base = { ...row, tracking_number: tracking, shipment_ref: ref, status }

  let order: OrderRow | null = null
  let fulfillmentId: string | null = null

  const displayId = displayIdFromReference(row.order_reference)
  if (displayId) order = await loadOrder(container, { display_id: String(displayId) })

  if (!order && (ref || tracking)) {
    const found = await findFulfillmentByCarrierRef(container, { shipmentRef: ref || null, trackingNumbers: [tracking] })
    if (found?.orderId) {
      order = await loadOrder(container, { id: found.orderId })
      fulfillmentId = found.id
    }
  }

  if (!order) {
    return { ...base, action: "not_found", order_id: null, order_display_id: null, fulfillment_id: null, message: "Sipariş bulunamadı (referans ve takip no eşleşmedi)." }
  }
  const display = order.display_id != null ? String(order.display_id) : null
  const common = { order_id: order.id, order_display_id: display }

  if ((order.status || "").toLowerCase() === "canceled") {
    return { ...base, ...common, action: "canceled", fulfillment_id: null, message: "Sipariş iptal edilmiş; firma kaydını kontrol edin." }
  }

  const active = (order.fulfillments || []).find((f) => !f.canceled_at)
  fulfillmentId = active?.id || fulfillmentId
  const current = readFulfillmentData(active?.data)
  const incomingKey = ref || tracking

  if (active && current.shipment_ref && incomingKey && current.shipment_ref !== incomingKey && current.tracking_number !== incomingKey) {
    return {
      ...base,
      ...common,
      action: "conflict",
      fulfillment_id: active.id,
      message: `Kayıtta farklı gönderi kimliği var (ref ${current.shipment_ref}${current.tracking_number ? `, takip ${current.tracking_number}` : ""}).`,
    }
  }

  const needsAttach = Boolean(incomingKey) && (!active || !current.shipment_ref || (tracking && !current.tracking_number))
  if (needsAttach) {
    return {
      ...base,
      ...common,
      action: "attach",
      fulfillment_id: active?.id || null,
      message: active ? "Kayıt var, firma kimliği eksik → bağlanır." : "Kargo kaydı yok → kayıt açılır ve kimlik bağlanır.",
    }
  }

  if (status === "delivered" && !active?.delivered_at) {
    return { ...base, ...common, action: "deliver", fulfillment_id: active?.id || null, message: "Firma teslim edildi diyor, sistemde değil → teslim işlenir." }
  }
  if ((status === "shipped" || status === "delivered") && !active?.shipped_at) {
    return { ...base, ...common, action: "ship", fulfillment_id: active?.id || null, message: "Firma kargoya verildi diyor, sistemde değil → kargoya verildi işlenir." }
  }

  return { ...base, ...common, action: "ok", fulfillment_id: active?.id || null, message: "Tutarlı." }
}

export async function reconcileShipments(
  container: MedusaContainer,
  rows: ReconcileRow[],
  opts: { apply?: boolean; actorId?: string | null } = {}
): Promise<ReconcileResult[]> {
  const out: ReconcileResult[] = []
  for (const row of rows.slice(0, 500)) {
    let plan: ReconcileResult
    try {
      plan = await planReconcileRow(container, row)
    } catch (error) {
      out.push({ ...row, action: "not_found", order_id: null, order_display_id: null, fulfillment_id: null, message: "Satır işlenemedi.", error: error instanceof Error ? error.message : String(error) })
      continue
    }
    if (!opts.apply || !["attach", "ship", "deliver"].includes(plan.action) || !plan.order_id) {
      out.push(plan)
      continue
    }
    try {
      if (plan.action === "attach") {
        const res = await attachExternalShipment(container, {
          orderId: plan.order_id,
          shipmentRef: plan.shipment_ref,
          trackingNumber: plan.tracking_number,
          markShipped: plan.status === "shipped" || plan.status === "delivered",
          markDelivered: plan.status === "delivered",
          actorId: opts.actorId,
          source: "uzlaştırma",
        })
        if (!res.ok) throw new Error(res.message)
        out.push({ ...plan, fulfillment_id: res.fulfillmentId, applied: true })
      } else {
        if (!plan.fulfillment_id) throw new Error("Kargo kaydı yok.")
        const res = await applyCarrierAction(container, {
          fulfillmentId: plan.fulfillment_id,
          action: plan.action === "deliver" ? "delivered" : "shipped",
          source: "uzlaştırma",
        })
        if (!res.ok) throw new Error(res.message)
        out.push({ ...plan, applied: true })
      }
    } catch (error) {
      out.push({ ...plan, applied: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return out
}
