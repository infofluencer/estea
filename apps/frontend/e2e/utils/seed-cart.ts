import type { Page } from "@playwright/test"
import { stagingBackendUrl, stagingFrontendUrl } from "./env"

const CART_COOKIE = "_escay_cart_id"

/**
 * Create a cart with 1 in-stock line via Store API and inject the httpOnly
 * cart cookie into the Playwright context.
 *
 * Needed when staging FE is HTTP + production NODE_ENV (Secure cookies are
 * dropped by the browser, so UI add-to-cart never persists).
 */
export async function seedGuestCartCookie(page: Page): Promise<{ cartId: string }> {
  const backend = stagingBackendUrl()
  const pk =
    process.env.STAGING_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    ""
  if (!backend || !pk) {
    throw new Error("seedGuestCartCookie: STAGING_BACKEND_URL + publishable key gerekli")
  }

  const headers = {
    "content-type": "application/json",
    "x-publishable-api-key": pk,
  }

  const regions = await fetch(`${backend}/store/regions?limit=1`, { headers })
  const regionJson = (await regions.json()) as { regions?: { id: string }[] }
  const regionId =
    process.env.STAGING_REGION_ID ||
    process.env.NEXT_PUBLIC_MEDUSA_REGION_ID ||
    regionJson.regions?.[0]?.id
  if (!regionId) throw new Error("seedGuestCartCookie: no region")

  const products = await fetch(
    `${backend}/store/products?limit=50&region_id=${regionId}&country_code=tr&fields=*variants,+variants.inventory_quantity,+variants.manage_inventory`,
    { headers, signal: AbortSignal.timeout(25_000) }
  )
  const prodJson = (await products.json()) as {
    products?: {
      variants?: {
        id: string
        inventory_quantity?: number | null
        manage_inventory?: boolean | null
      }[]
    }[]
  }
  let variantId = ""
  for (const p of prodJson.products || []) {
    for (const v of p.variants || []) {
      if (v.manage_inventory === false) {
        variantId = v.id
        break
      }
      if (typeof v.inventory_quantity === "number" && v.inventory_quantity > 0) {
        variantId = v.id
        break
      }
    }
    if (variantId) break
  }
  if (!variantId) throw new Error("seedGuestCartCookie: no in-stock variant")

  const cartRes = await fetch(`${backend}/store/carts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ region_id: regionId }),
  })
  const cartId = ((await cartRes.json()) as { cart?: { id: string } }).cart?.id
  if (!cartId) throw new Error("seedGuestCartCookie: cart create failed")

  const lineRes = await fetch(`${backend}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers,
    body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
  })
  if (!lineRes.ok) {
    throw new Error(`seedGuestCartCookie: line-item failed (${lineRes.status})`)
  }

  const fe = new URL(stagingFrontendUrl())
  await page.context().addCookies([
    {
      name: CART_COOKIE,
      value: cartId,
      domain: fe.hostname,
      path: "/",
      httpOnly: true,
      secure: fe.protocol === "https:",
      sameSite: "Lax",
    },
  ])

  return { cartId }
}
