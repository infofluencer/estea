import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { issueSalesInvoiceForOrder } from "../../../../../../lib/parasut-invoice"

/**
 * Admin: POST /admin/orders/:id/parasut-invoice/retry
 * Faturayı yeniden kes (idempotent — issued ise skip).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const orderId = req.params.id
  if (!orderId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Order id required")
  }

  try {
    const result = await issueSalesInvoiceForOrder(req.scope, orderId)
    res.status(200).json({
      ok: result.ok,
      skipped: result.skipped || false,
      meta: result.meta,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, message)
  }
}
