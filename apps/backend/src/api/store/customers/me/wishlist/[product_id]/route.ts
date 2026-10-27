import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { WISHLIST_MODULE } from "../../../../../../modules/wishlist"
import type WishlistModuleService from "../../../../../../modules/wishlist/service"

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Unauthorized")
  }

  const productId = req.params.product_id?.trim()
  if (!productId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "product_id gerekli.")
  }

  const wishlist: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
  await wishlist.removeForCustomer(customerId, productId)
  res.status(200).json({ id: productId, deleted: true })
}
