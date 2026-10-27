import { cookies } from "next/headers"
import { authHeaders } from "./auth/session"
import { cookieSecureFlag } from "./cookie-secure"
import { sdk, storeCartCreateParams } from "./medusa"

export const CART_COOKIE = "_escay_cart_id"

/** Guest + logged-in cart id cookie — 14 days (browser session persistence). */
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 14

export const CART_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: cookieSecureFlag(),
  maxAge: CART_COOKIE_MAX_AGE,
}

export async function getCartId() {
  const jar = await cookies()
  return jar.get(CART_COOKIE)?.value || null
}

export async function setCartIdCookie(cartId: string) {
  const jar = await cookies()
  jar.set(CART_COOKIE, cartId, CART_COOKIE_OPTIONS)
}

export async function clearCartIdCookie() {
  const jar = await cookies()
  jar.delete(CART_COOKIE)
}

export const CART_FIELDS =
  "+items,+items.thumbnail,+items.variant_id,+items.variant.sku,*items.variant,*items.product,*items.variant.options,+discount_total,+item_subtotal,+item_total,+original_item_total,+subtotal,+total,*promotions"

/**
 * Retrieve cart by cookie id.
 * Passes auth when logged in so customer-owned carts still resolve after transfer.
 */
export async function getCart() {
  const existingId = await getCartId()
  if (!existingId) return null

  try {
    const headers = await authHeaders()
    const { cart } = await sdk.store.cart.retrieve(
      existingId,
      { fields: CART_FIELDS },
      headers
    )
    return cart
  } catch {
    return null
  }
}

export async function createCart() {
  const { cart } = await sdk.store.cart.create({
    ...storeCartCreateParams(),
  })
  return cart
}

/**
 * Attach the current cookie cart to the logged-in customer (Medusa transfer).
 * No-op if guest or no cart cookie.
 */
export async function transferCartToCustomer(token: string) {
  const cartId = await getCartId()
  if (!cartId) return { ok: true as const, transferred: false }

  try {
    const { cart } = await sdk.store.cart.transferCart(cartId, undefined, {
      Authorization: `Bearer ${token}`,
    })
    if (cart?.id) await setCartIdCookie(cart.id)
    return { ok: true as const, transferred: true }
  } catch {
    return { ok: false as const, transferred: false }
  }
}
