import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { autoFulfillPaidOrder } from "../../../../../../lib/auto-fulfill-order"
import { recordOpsEvent } from "../../../../../../lib/ops-events"
import { cancelOpenFulfillmentStrict } from "../../../../../../lib/reship-fulfillment"

/**
 * POST /admin/orders/:id/fulfillment/reship — açık gönderiyi firmada iptal et
 * (reddederse DUR), Medusa kaydını iptal et, yeni gönderi aç.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const orderId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "fulfillments.id", "fulfillments.canceled_at"],
    filters: { id: orderId },
  })
  const order = data?.[0] as { fulfillments?: { id: string; canceled_at?: unknown }[] } | undefined
  if (!order) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Sipariş bulunamadı")
  const active = (order.fulfillments || []).find((f) => !f.canceled_at)

  let carrierCancel: string = "none"
  if (active) {
    try {
      ;({ carrierCancel } = await cancelOpenFulfillmentStrict(req.scope, { orderId, fulfillmentId: active.id }))
    } catch (error) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, error instanceof Error ? error.message : String(error))
    }
  }
  const result = await autoFulfillPaidOrder(req.scope, orderId, { manual: true })
  if (!result.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, result.message)
  await recordOpsEvent(req.scope, {
    kind: "shipment.created",
    level: "info",
    title: "Gönderi yeniden açıldı",
    detail: active ? `Önceki kayıt iptal edildi (firma: ${carrierCancel}).` : null,
    orderId,
    data: { fulfillment_id: result.fulfillmentId, by: req.auth_context?.actor_id || null },
  })
  res.json({ ...result, carrierCancel })
}
