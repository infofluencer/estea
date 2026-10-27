"use server"

import { sdk } from "../medusa"
import { errMessage } from "./errors"
import { authHeaders } from "./session"
import type { ActionResult } from "./actions"

export type WishlistItemView = {
  id: string
  product_id: string
  handle: string
  title: string
  thumbnail: string | null
  price: number | null
}

export type WishlistProductInput = {
  product_id: string
  handle: string
  title: string
  thumbnail?: string | null
  price?: number | null
}

async function requireAuthHeaders() {
  const headers = await authHeaders()
  if (!headers) throw new Error("Oturum gerekli.")
  return headers
}

function mapFavorite(item: WishlistItemView) {
  return {
    id: item.product_id,
    handle: item.handle,
    title: item.title,
    price: item.price,
    image: item.thumbnail,
  }
}

export async function listWishlistAction(): Promise<
  | { ok: true; items: ReturnType<typeof mapFavorite>[] }
  | { ok: false; message: string; unauthenticated?: boolean }
> {
  try {
    const headers = await authHeaders()
    if (!headers) {
      return { ok: false, unauthenticated: true, message: "Oturum yok." }
    }
    const result = await sdk.client.fetch<{ items: WishlistItemView[] }>(
      "/store/customers/me/wishlist",
      { method: "GET", headers }
    )
    return {
      ok: true,
      items: (result.items || []).map(mapFavorite),
    }
  } catch (e) {
    return { ok: false, message: errMessage(e, "Favoriler alınamadı.") }
  }
}

export async function addWishlistAction(
  input: WishlistProductInput
): Promise<ActionResult & { items?: ReturnType<typeof mapFavorite>[] }> {
  try {
    const headers = await requireAuthHeaders()
    await sdk.client.fetch("/store/customers/me/wishlist", {
      method: "POST",
      body: {
        product_id: input.product_id,
        handle: input.handle,
        title: input.title,
        thumbnail: input.thumbnail ?? null,
        price:
          typeof input.price === "number" ? Math.round(input.price) : null,
      },
      headers,
    })
    const listed = await listWishlistAction()
    return listed.ok
      ? { ok: true, items: listed.items }
      : { ok: true }
  } catch (e) {
    return { ok: false, message: errMessage(e, "Favoriye eklenemedi.") }
  }
}

export async function removeWishlistAction(
  productId: string
): Promise<ActionResult & { items?: ReturnType<typeof mapFavorite>[] }> {
  try {
    const headers = await requireAuthHeaders()
    await sdk.client.fetch(
      `/store/customers/me/wishlist/${encodeURIComponent(productId)}`,
      { method: "DELETE", headers }
    )
    const listed = await listWishlistAction()
    return listed.ok
      ? { ok: true, items: listed.items }
      : { ok: true }
  } catch (e) {
    return { ok: false, message: errMessage(e, "Favoriden çıkarılamadı.") }
  }
}

export async function syncWishlistAction(
  items: WishlistProductInput[]
): Promise<
  | { ok: true; items: ReturnType<typeof mapFavorite>[] }
  | { ok: false; message: string; unauthenticated?: boolean }
> {
  try {
    const headers = await authHeaders()
    if (!headers) {
      return { ok: false, unauthenticated: true, message: "Oturum yok." }
    }
    const result = await sdk.client.fetch<{ items: WishlistItemView[] }>(
      "/store/customers/me/wishlist/sync",
      {
        method: "POST",
        body: {
          items: items.slice(0, 100).map((item) => ({
            product_id: item.product_id,
            handle: item.handle,
            title: item.title,
            thumbnail: item.thumbnail ?? null,
            price:
              typeof item.price === "number" ? Math.round(item.price) : null,
          })),
        },
        headers,
      }
    )
    return {
      ok: true,
      items: (result.items || []).map(mapFavorite),
    }
  } catch (e) {
    return { ok: false, message: errMessage(e, "Favoriler senkronize edilemedi.") }
  }
}
