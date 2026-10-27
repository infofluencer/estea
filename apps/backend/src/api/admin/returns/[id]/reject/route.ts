import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { rejectStoreReturn } from "../../../../../lib/return-rejection"

type RejectBody = {
  reason?: string | null
}

/**
 * Admin: POST /admin/returns/:id/reject
 *
 * Ürün geldi ama kabul edilmedi → refund yok, stok yok (cancel receive öncesi),
 * müşteriye escay.return_rejected maili.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const returnId = req.params.id
  if (!returnId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Return id required")
  }

  const body = (req.validatedBody || req.body || {}) as RejectBody
  const result = await rejectStoreReturn(req.scope, {
    return_id: returnId,
    reason: body.reason,
    rejected_by: req.auth_context?.actor_id || null,
  })

  res.status(200).json({
    ok: true,
    ...result,
  })
}
