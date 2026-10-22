import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  advanceOrderStatus,
  type OrderStatusAction,
} from "../../../../../lib/order-status"

type Body = {
  action?: OrderStatusAction
  tracking_number?: string | null
  tracking_url?: string | null
  /** false → kargo / teslim maili gönderilmez. */
  notify?: boolean
}

/**
 * Admin: POST /admin/orders/:id/escay-status
 *
 * Advances customer-facing timeline via Medusa fulfill / ship / deliver.
 * Body: { action: "prepare" | "ship" | "deliver", tracking_number?, tracking_url?, notify? }
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const orderId = req.params.id
  if (!orderId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Order id required")
  }

  const body = (req.validatedBody || req.body || {}) as Body
  const action = body.action
  if (action !== "prepare" && action !== "ship" && action !== "deliver") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'action must be "prepare" | "ship" | "deliver"')
  }

  try {
    const result = await advanceOrderStatus(req.scope, {
      orderId,
      action,
      tracking_number: body.tracking_number,
      tracking_url: body.tracking_url,
      no_notification: body.notify === false,
    })
    res.status(200).json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new MedusaError(MedusaError.Types.INVALID_DATA, message)
  }
}
