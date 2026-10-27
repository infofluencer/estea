import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { WISHLIST_MODULE } from "../../../../../../modules/wishlist"
import type WishlistModuleService from "../../../../../../modules/wishlist/service"

type SyncBody = {
  items: {
    product_id: string
    handle: string
    title: string
    thumbnail?: string | null
    price?: number | null
  }[]
}

function mapItem(item: {
  id: string
  product_id: string
  product_handle: string
  product_title: string
  product_thumbnail?: string | null
  product_price?: number | null
  created_at?: Date | string
}) {
  return {
    id: item.id,
    product_id: item.product_id,
    handle: item.product_handle,
    title: item.product_title,
    thumbnail: item.product_thumbnail ?? null,
    price: item.product_price ?? null,
    created_at: item.created_at,
  }
}

/**
 * Merge guest localStorage favorites into the authenticated customer's wishlist.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<SyncBody>,
  res: MedusaResponse
) => {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Unauthorized")
  }

  const items = Array.isArray(req.validatedBody?.items)
    ? req.validatedBody.items
    : []

  const wishlist: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
  const merged = await wishlist.syncForCustomer(
    customerId,
    items.map((item) => ({
      product_id: item.product_id,
      product_handle: item.handle,
      product_title: item.title,
      product_thumbnail: item.thumbnail ?? null,
      product_price: item.price ?? null,
    }))
  )

  res.status(200).json({ items: merged.map(mapItem) })
}
