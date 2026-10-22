import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { generateOrderContracts } from "../../../../../lib/order-contracts"

/**
 * Admin: POST /admin/orders/:id/contracts
 * Sözleşme PDF'leri yoksa üretir (sipariş anında üretilemediyse / eski sipariş).
 * Varsa dokunmaz — sözleşme ilk hâliyle kalır.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const orderId = req.params.id
  if (!orderId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Order id required")
  }

  const result = await generateOrderContracts(req.scope, orderId)
  if (!result.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, result.error)
  }
  res.status(200).json(result)
}
