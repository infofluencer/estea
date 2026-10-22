import { MedusaService } from "@medusajs/framework/utils"
import WishlistItem from "./models/wishlist-item"

export type WishlistItemInput = {
  product_id: string
  product_handle: string
  product_title: string
  product_thumbnail?: string | null
  product_price?: number | null
}

class WishlistModuleService extends MedusaService({
  WishlistItem,
}) {
  async listByCustomer(customerId: string) {
    return this.listWishlistItems(
      { customer_id: customerId },
      { order: { created_at: "DESC" } }
    )
  }

  async addForCustomer(customerId: string, input: WishlistItemInput) {
    const productId = input.product_id.trim()
    if (!productId) {
      throw new Error("product_id gerekli.")
    }

    const existing = await this.listWishlistItems({
      customer_id: customerId,
      product_id: productId,
    })
    if (existing[0]) {
      return existing[0]
    }

    return this.createWishlistItems({
      customer_id: customerId,
      product_id: productId,
      product_handle: input.product_handle.trim(),
      product_title: input.product_title.trim(),
      product_thumbnail: input.product_thumbnail ?? null,
      product_price:
        typeof input.product_price === "number" ? input.product_price : null,
    })
  }

  async removeForCustomer(customerId: string, productId: string) {
    const id = productId.trim()
    if (!id) return

    const existing = await this.listWishlistItems({
      customer_id: customerId,
      product_id: id,
    })
    if (!existing.length) return

    await this.deleteWishlistItems(existing.map((item) => item.id))
  }

  /**
   * Merge guest/local items into the customer's wishlist (idempotent by product_id).
   */
  async syncForCustomer(customerId: string, items: WishlistItemInput[]) {
    for (const item of items) {
      if (!item?.product_id) continue
      await this.addForCustomer(customerId, item)
    }
    return this.listByCustomer(customerId)
  }
}

export default WishlistModuleService
