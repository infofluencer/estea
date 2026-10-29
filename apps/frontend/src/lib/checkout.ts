import { getCartId } from "./cart"
import { sdk } from "./medusa"
import { authHeaders } from "./auth/session"

export { AUTH_COOKIE, LAST_ORDER_EMAIL_COOKIE } from "./auth/constants"
export { authHeaders } from "./auth/session"
export { getLoggedInCustomer } from "./auth/customer"

/** Checkout cart fields: line items, totals, addresses, shipping. */
export const CHECKOUT_CART_FIELDS =
  "+items,+items.thumbnail,+items.variant_id,+items.variant.sku,*items.variant,*items.product,*items.variant.options,*shipping_address,*billing_address,*shipping_methods,*payment_collection,+metadata,+discount_total,+item_subtotal,+item_total,+original_item_total,+subtotal,+total,+shipping_total,*promotions"

export async function getCheckoutCart() {
  const cartId = await getCartId()
  if (!cartId) return null

  try {
    const headers = await authHeaders()
    const { cart } = await sdk.store.cart.retrieve(
      cartId,
      { fields: CHECKOUT_CART_FIELDS },
      headers
    )
    return cart
  } catch {
    return null
  }
}
