import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { issueSalesInvoiceForOrder } from "../../../../../../lib/bizimhesap-invoice"

/**
 * Admin: POST /admin/orders/:id/bizimhesap-invoice/retry
 * Faturayı yeniden gönder (created ise skip).
 * Belirsiz kayıt (pending/unknown) yalnız `confirm_not_in_bizimhesap: true` ile gider:
 * admin panelde kaydın olmadığını görmüştür.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const orderId = req.params.id
  if (!orderId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Order id required")
  }
  const body = (req.body || {}) as { confirm_not_in_bizimhesap?: unknown }

  try {
    const result = await issueSalesInvoiceForOrder(req.scope, orderId, {
      confirmedNotInBizimhesap: body.confirm_not_in_bizimhesap === true,
    })
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
