import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { processReturnRefund } from "../../../../../lib/return-refund"

/**
 * Admin retry: POST /admin/returns/:id/refund
 *
 * Return "received" kaldıktan sonra PayTR fail olduysa tekrar dener.
 * Idempotent — success kaydı varsa tekrar PayTR çağrılmaz.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const returnId = req.params.id
  if (!returnId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Return id required")
  }

  const result = await processReturnRefund(req.scope, {
    return_id: returnId,
  })

  if (result.meta.status === "failed") {
    res.status(502).json({
      ok: false,
      return_id: returnId,
      paytr_refund: result.meta,
    })
    return
  }

  res.status(200).json({
    ok: result.ok,
    skipped: Boolean(result.skipped),
    return_id: returnId,
    paytr_refund: result.meta,
  })
}
