import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getBankTransferOrderState } from "../../../../../lib/bank-transfer-confirm"

/**
 * Admin: GET /admin/orders/:id/bank-transfer — havale ödeme durumu (widget).
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  res.status(200).json(await getBankTransferOrderState(req.scope, req.params.id))
}
