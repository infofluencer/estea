import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { autoFulfillPaidOrder } from "../../../../../../lib/auto-fulfill-order"
import { recordOpsEvent } from "../../../../../../lib/ops-events"

/** POST /admin/orders/:id/fulfillment/retry — ödenmiş siparişte kargo kaydını (yeniden) aç. */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const orderId = req.params.id
  const result = await autoFulfillPaidOrder(req.scope, orderId, { manual: true })
  if (!result.ok) throw new MedusaError(MedusaError.Types.INVALID_DATA, result.message)
  if (!result.skipped) {
    await recordOpsEvent(req.scope, {
      kind: "shipment.created",
      level: "info",
      title: "Kargo gönderisi admin tarafından açıldı",
      orderId,
      data: { fulfillment_id: result.fulfillmentId, by: req.auth_context?.actor_id || null },
    })
  }
  res.json(result)
}
