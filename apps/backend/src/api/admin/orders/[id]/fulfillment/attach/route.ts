import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { attachExternalShipment } from "../../../../../../lib/shipping/attach-external-shipment"

type Body = {
  shipment_ref?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  carrier?: string | null
  mark_shipped?: boolean
  mark_delivered?: boolean
  force?: boolean
}

/**
 * POST /admin/orders/:id/fulfillment/attach
 * Şubede elle açılmış gönderiyi siparişe bağla (firmaya yeni kayıt açmaz).
 * { shipment_ref?, tracking_number?, tracking_url?, carrier?, mark_shipped?, mark_delivered?, force? }
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const body = (req.validatedBody || req.body || {}) as Body
  const result = await attachExternalShipment(req.scope, {
    orderId: req.params.id,
    shipmentRef: body.shipment_ref,
    trackingNumber: body.tracking_number,
    trackingUrl: body.tracking_url,
    carrier: body.carrier,
    markShipped: Boolean(body.mark_shipped),
    markDelivered: Boolean(body.mark_delivered),
    force: Boolean(body.force),
    actorId: req.auth_context?.actor_id || null,
    source: "admin",
  })
  if (!result.ok) return res.status(result.status).json({ message: result.message })
  res.json(result)
}
