import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { WISHLIST_MODULE } from "../../../../../modules/wishlist"
import type WishlistModuleService from "../../../../../modules/wishlist/service"

function requireCustomerId(req: AuthenticatedMedusaRequest) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Unauthorized")
  }
  return customerId
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

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = requireCustomerId(req)
  const wishlist: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
  const items = await wishlist.listByCustomer(customerId)
  res.status(200).json({ items: items.map(mapItem) })
}

type AddBody = {
  product_id: string
  handle: string
  title: string
  thumbnail?: string | null
  price?: number | null
}

export const POST = async (
  req: AuthenticatedMedusaRequest<AddBody>,
  res: MedusaResponse
) => {
  const customerId = requireCustomerId(req)
  const body = req.validatedBody
  const wishlist: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)

  const item = await wishlist.addForCustomer(customerId, {
    product_id: body.product_id,
    product_handle: body.handle,
    product_title: body.title,
    product_thumbnail: body.thumbnail ?? null,
    product_price: body.price ?? null,
  })

  res.status(200).json({ item: mapItem(item) })
}
