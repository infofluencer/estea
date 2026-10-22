import { cookies } from "next/headers"
import {
  LAST_ORDER_COOKIE_MAX_AGE,
  LAST_ORDER_COOKIE_OPTIONS,
} from "./auth/constants"

/**
 * Line items saved at cart.complete so we can rebuild a cart after PayTR fail /
 * abandon. Medusa completes the cart on complete — the old cart id is unusable.
 */
export const PENDING_CHECKOUT_COOKIE = "_escay_pending_checkout"

export type PendingCheckoutItem = {
  variant_id: string
  quantity: number
}

export const PENDING_CHECKOUT_COOKIE_OPTIONS = {
  ...LAST_ORDER_COOKIE_OPTIONS,
  maxAge: LAST_ORDER_COOKIE_MAX_AGE,
}

export async function setPendingCheckoutItems(items: PendingCheckoutItem[]) {
  const cleaned = items
    .filter((i) => i.variant_id && i.quantity > 0)
    .map((i) => ({
      variant_id: i.variant_id,
      quantity: Math.min(99, Math.floor(i.quantity)),
    }))
  if (!cleaned.length) return

  const jar = await cookies()
  jar.set(
    PENDING_CHECKOUT_COOKIE,
    JSON.stringify(cleaned),
    PENDING_CHECKOUT_COOKIE_OPTIONS
  )
}

export async function getPendingCheckoutItems(): Promise<
  PendingCheckoutItem[] | null
> {
  const jar = await cookies()
  const raw = jar.get(PENDING_CHECKOUT_COOKIE)?.value
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const items: PendingCheckoutItem[] = []
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue
      const variantId = (row as { variant_id?: unknown }).variant_id
      const quantity = (row as { quantity?: unknown }).quantity
      if (typeof variantId !== "string" || !variantId.trim()) continue
      const qty = typeof quantity === "number" ? quantity : Number(quantity)
      if (!Number.isFinite(qty) || qty < 1) continue
      items.push({ variant_id: variantId.trim(), quantity: Math.min(99, Math.floor(qty)) })
    }
    return items.length ? items : null
  } catch {
    return null
  }
}

export async function clearPendingCheckoutItems() {
  const jar = await cookies()
  jar.delete(PENDING_CHECKOUT_COOKIE)
}
