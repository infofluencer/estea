import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { confirmBankTransferPayment } from "../../../../../../lib/bank-transfer-confirm"

/**
 * Admin: POST /admin/orders/:id/bank-transfer/confirm
 * Havale/EFT hesaba geçti → ödemeyi onayla (capture). İdempotent.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  try {
    const state = await confirmBankTransferPayment(
      req.scope,
      req.params.id,
      req.auth_context?.actor_id
    )
    res.status(200).json(state)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message)
  }
}
