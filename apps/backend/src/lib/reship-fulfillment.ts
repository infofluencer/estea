import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { getCarrierFor } from "../modules/carrier/registry"
import { hasCarrierShipment } from "../modules/carrier/types"
import { errorText } from "./ops-events"

type Row = { id: string; canceled_at?: unknown; shipped_at?: unknown; delivered_at?: unknown; data?: Record<string, unknown> | null }

/**
 * Açık (kargoya verilmemiş) kaydı firmada İPTAL eder — reddederse hiçbir şey
 * değişmez (throw) — sonra Medusa kaydını iptal eder. Yeni gönderi açmak
 * çağıranın işi (autoFulfillPaidOrder manual / shipExchange).
 */
export async function cancelOpenFulfillmentStrict(
  container: MedusaContainer,
  input: { orderId: string; fulfillmentId: string }
): Promise<{ canceled: boolean; carrierCancel: "canceled" | "none" }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "canceled_at", "shipped_at", "delivered_at", "data"],
    filters: { id: input.fulfillmentId },
  })
  const f = data?.[0] as Row | undefined
  if (!f || f.canceled_at) return { canceled: false, carrierCancel: "none" }
  if (f.shipped_at || f.delivered_at) throw new Error("Gönderi kargoya verilmiş — yeniden açılamaz.")

  let carrierCancel: "canceled" | "none" = "none"
  if (hasCarrierShipment(f.data)) {
    const adapter = getCarrierFor(f.data)
    if (!adapter) throw new Error(`Gönderiyi açan kargo adaptörü (${String(f.data?.carrier)}) kayıtlı değil.`)
    try {
      if (adapter.cancelShipmentStrict) await adapter.cancelShipmentStrict(f.data || {})
      else await adapter.cancelShipment(f.data || {})
      carrierCancel = "canceled"
    } catch (error) {
      throw new Error(`${adapter.name} gönderisi iptal edilemedi: ${errorText(error)}. Kayıt değişmedi.`)
    }
  }
  await cancelOrderFulfillmentWorkflow(container).run({
    input: { order_id: input.orderId, fulfillment_id: f.id, no_notification: true },
  })
  return { canceled: true, carrierCancel }
}
