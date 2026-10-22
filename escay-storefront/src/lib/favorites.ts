/**
 * Guest browser favorites (localStorage).
 * Logged-in customers: server wishlist is source of truth; localStorage is a
 * cache that syncs on login via FavoritesProvider / LoginPanel.
 */
export const FAVORITE_ADDED_EVENT = "escay:favorite-added"

const FAVORITES_KEY = "escay_favorites"

export type FavoriteProduct = {
  id: string
  handle: string
  title: string
  price?: number | null
  image?: string | null
  /** Preferred cart variant when known (category color card / PDP selection). */
  variantId?: string | null
}

export type FavoriteAddedPayload = {
  title?: string
  image?: string | null
  price?: number | null
}

export function readFavorites(): FavoriteProduct[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeFavorites(items: FavoriteProduct[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event("escay:favorites"))
}

export function isFavorite(productId: string) {
  return readFavorites().some((f) => f.id === productId)
}

export function toggleFavoriteLocal(product: FavoriteProduct) {
  const current = readFavorites()
  const exists = current.some((f) => f.id === product.id)
  const next = exists
    ? current.filter((f) => f.id !== product.id)
    : [...current, product]
  writeFavorites(next)

  if (!exists) {
    window.dispatchEvent(
      new CustomEvent<FavoriteAddedPayload>(FAVORITE_ADDED_EVENT, {
        detail: {
          title: product.title,
          image: product.image,
          price: product.price,
        },
      })
    )
  }

  return !exists
}

/** @deprecated Prefer toggleFavorite from FavoritesProvider when available. */
export function toggleFavorite(product: FavoriteProduct) {
  return toggleFavoriteLocal(product)
}

export function toWishlistInput(product: FavoriteProduct) {
  return {
    product_id: product.id,
    handle: product.handle,
    title: product.title,
    thumbnail: product.image ?? null,
    price: product.price ?? null,
  }
}
