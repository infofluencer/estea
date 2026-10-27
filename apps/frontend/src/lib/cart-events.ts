import { analyticsItemFromCart, trackAddToCart } from "@/lib/analytics"

export const CART_ADDED_EVENT = "escay:cart-added"
export const CART_COUNT_EVENT = "escay:cart-count"

export type CartAddedPayload = {
  title?: string
  image?: string | null
  price?: number | null
}

/** Analytics (GA4 add_to_cart / Pixel AddToCart) için eklenen satırı bulmaya yarar. */
export type CartAddedSource = {
  cart?: Parameters<typeof analyticsItemFromCart>[0]
  variantId?: string | null
  handle?: string | null
}

export function countCartItems(
  cart: { items?: { quantity?: number }[] } | null | undefined
) {
  return (cart?.items ?? []).reduce((sum, item) => sum + (item.quantity || 0), 0)
}

export function notifyCartAdded(
  payload: CartAddedPayload = {},
  source: CartAddedSource = {}
) {
  if (typeof window === "undefined") return
  const item = analyticsItemFromCart(source.cart, source)
  if (item) trackAddToCart(item)
  window.dispatchEvent(
    new CustomEvent<CartAddedPayload>(CART_ADDED_EVENT, { detail: payload })
  )
}

export function notifyCartCount(count: number) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<{ count: number }>(CART_COUNT_EVENT, { detail: { count } })
  )
}
