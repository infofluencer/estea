"use server"

import { revalidatePath } from "next/cache"
import {
  CART_FIELDS,
  clearCartIdCookie,
  createCart,
  getCart,
  getCartId,
  setCartIdCookie,
  transferCartToCustomer,
} from "./cart"
import { countCartItems } from "./cart-events"
import { getAuthToken } from "./auth/session"
import { sdk } from "./medusa"
import { isVariantInStock } from "./stock"

export type CartActionResult =
  | { ok: true; cart: NonNullable<Awaited<ReturnType<typeof getCart>>> }
  | { ok: false; message: string }

function medusaErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; body?: { message?: unknown } }
    const bodyMessage = record.body?.message
    if (typeof bodyMessage === "string" && bodyMessage.trim()) return bodyMessage
    const message = record.message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}

function refreshCartViews() {
  // Cart badge updates client-side via CART_COUNT_EVENT — avoid full layout
  // revalidation here; it can crash the current page on server-action errors.
  revalidatePath("/sepet")
}

/**
 * Ensure a cart exists in the browser session cookie.
 * If the customer is logged in, bind the cart to their account.
 */
export async function ensureCartAction() {
  const existing = await getCart()
  if (existing) {
    const token = await getAuthToken()
    if (token) {
      await transferCartToCustomer(token)
      return (await getCart()) || existing
    }
    return existing
  }

  const cart = await createCart()
  await setCartIdCookie(cart.id)

  const token = await getAuthToken()
  if (token) {
    await transferCartToCustomer(token)
  }

  refreshCartViews()
  return (await getCart()) || cart
}

/** Resolve an in-stock variant for a product handle (favorites quick-add). */
export async function resolveVariantForHandle(
  handle: string,
  preferredVariantId?: string | null
): Promise<string | null> {
  const trimmed = handle.trim()
  if (!trimmed) return null

  const { products } = await sdk.store.product.list({
    handle: trimmed,
    limit: 1,
    fields:
      "+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder",
  })
  const product = products[0]
  const variants = product?.variants || []
  if (!variants.length) return null

  if (preferredVariantId) {
    const preferred = variants.find((v) => v.id === preferredVariantId)
    if (preferred && isVariantInStock(preferred)) return preferred.id
  }

  const inStock = variants.find((v) => isVariantInStock(v))
  return inStock?.id ?? variants[0]?.id ?? null
}

export async function addFavoriteToCartAction(
  handle: string,
  preferredVariantId?: string | null
): Promise<CartActionResult> {
  const variantId = await resolveVariantForHandle(handle, preferredVariantId)
  if (!variantId) {
    return { ok: false, message: "Bu ürün sepete eklenemedi." }
  }
  return addToCartAction(variantId)
}

export async function addToCartAction(
  variantId: string,
  quantity = 1
): Promise<CartActionResult> {
  const trimmedVariantId = variantId.trim()
  if (!trimmedVariantId) {
    return { ok: false, message: "Ürün varyantı bulunamadı." }
  }

  try {
    let cart = await getCart()
    if (!cart) {
      cart = await createCart()
      await setCartIdCookie(cart.id)
      const token = await getAuthToken()
      if (token) {
        await transferCartToCustomer(token)
        cart = (await getCart()) || cart
      }
    } else {
      const token = await getAuthToken()
      if (token) {
        await transferCartToCustomer(token)
        cart = (await getCart()) || cart
      }
    }

    if (!cart?.id) {
      return { ok: false, message: "Sepet oluşturulamadı." }
    }

    const token = await getAuthToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined

    const { cart: updated } = await sdk.store.cart.createLineItem(
      cart.id,
      {
        variant_id: trimmedVariantId,
        quantity,
      },
      { fields: CART_FIELDS },
      headers
    )

    if (!updated?.id) {
      return { ok: false, message: "Sepete eklenemedi." }
    }

    await setCartIdCookie(updated.id)
    refreshCartViews()
    return { ok: true, cart: updated }
  } catch (error) {
    console.error("[escay-storefront] addToCartAction failed:", error)

    const message = medusaErrorMessage(
      error,
      "Sepete eklenirken bir hata oluştu. Lütfen tekrar deneyin."
    )

    // If cart got completed (e.g. after checkout flow interrupted), Medusa
    // rejects adding new line-items. Recover by clearing cart cookie and
    // creating a fresh cart once.
    if (/already completed/i.test(message) || /completed/i.test(message)) {
      try {
        await clearCartIdCookie()

        const newCart = await ensureCartAction()
        if (!newCart?.id) {
          return { ok: false, message: "Sepet oluşturulamadı." }
        }

        const token = await getAuthToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined

        const { cart: updated } = await sdk.store.cart.createLineItem(
          newCart.id,
          { variant_id: trimmedVariantId, quantity },
          { fields: CART_FIELDS },
          headers
        )

        if (!updated?.id) {
          return { ok: false, message: "Sepete eklenemedi." }
        }

        await setCartIdCookie(updated.id)
        refreshCartViews()
        return { ok: true, cart: updated }
      } catch {
        // fall through to the original error below
      }
    }

    return { ok: false, message }
  }
}

export async function updateLineItemAction(lineId: string, quantity: number) {
  const cartId = await getCartId()
  if (!cartId) return 0

  const token = await getAuthToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined

  if (quantity <= 0) {
    await sdk.store.cart.deleteLineItem(cartId, lineId, {}, headers)
  } else {
    await sdk.store.cart.updateLineItem(
      cartId,
      lineId,
      { quantity },
      {},
      headers
    )
  }
  refreshCartViews()
  return countCartItems(await getCart())
}

export async function removeLineItemAction(lineId: string) {
  const cartId = await getCartId()
  if (!cartId) return 0

  const token = await getAuthToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined

  await sdk.store.cart.deleteLineItem(cartId, lineId, {}, headers)
  refreshCartViews()
  return countCartItems(await getCart())
}

/** Optional: drop cart cookie (e.g. after completed order). */
export async function clearCartSessionAction() {
  await clearCartIdCookie()
  refreshCartViews()
}
