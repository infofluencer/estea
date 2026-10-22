import { assert, assertStatus, section } from "../_helpers/assert"
import type { StagingEnv } from "../_helpers/env"
import { uniqueEmail } from "../_helpers/env"
import {
  asNumber,
  asRecord,
  bodyMessage,
  storeFetch,
} from "../_helpers/http"
import type { CatalogContext } from "./catalog"

export type CartContext = {
  cartId: string
  email: string
  total: number
  itemTotal: number
  shippingTotal: number
  shippingOptionId: string
}

export async function runCartSuite(
  env: StagingEnv,
  catalog: CatalogContext
): Promise<CartContext | null> {
  section("3. Sepet akışı")

  const email = uniqueEmail("cart")

  const created = await storeFetch(env, `/store/carts`, {
    method: "POST",
    body: JSON.stringify({
      region_id: catalog.regionId,
      email,
    }),
  })
  assertStatus("Cart oluştur", created.status, [200, 201])
  const cartId = String(asRecord(asRecord(created.body).cart).id || "")
  assert("Cart id", Boolean(cartId), cartId || bodyMessage(created.body))
  if (!cartId) return null

  const withItem = await storeFetch(env, `/store/carts/${cartId}/line-items`, {
    method: "POST",
    body: JSON.stringify({
      variant_id: catalog.variantId,
      quantity: 1,
    }),
  })
  assertStatus("Line item ekle", withItem.status, [200, 201])
  const items =
    (asRecord(asRecord(withItem.body).cart).items as unknown[]) || []
  assert("Line item sepette", items.length >= 1, `items=${items.length}`)

  const address = {
    first_name: "Staging",
    last_name: "Smoke",
    address_1: "Test Cad. No:1",
    city: "İstanbul",
    country_code: "tr",
    postal_code: "34000",
    phone: "05551112233",
    province: "İstanbul",
    // Medusa fulfill workflow order.email taşımaz —
    // delivery_address.metadata.email yedeği (carrier provider okur).
    metadata: { district: "Şişli", email },
  }

  const updated = await storeFetch(env, `/store/carts/${cartId}`, {
    method: "POST",
    body: JSON.stringify({
      email,
      shipping_address: address,
      billing_address: address,
    }),
  })
  assertStatus("Shipping address", updated.status, 200)

  const opts = await storeFetch(
    env,
    `/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`
  )
  assertStatus("Shipping options", opts.status, 200)
  const options =
    (asRecord(opts.body).shipping_options as Record<string, unknown>[]) || []
  assert("Kargo seçeneği var", options.length > 0, `count=${options.length}`)
  const shippingOptionId = String(options[0]?.id || "")
  if (!shippingOptionId) return null

  const shipped = await storeFetch(
    env,
    `/store/carts/${cartId}/shipping-methods`,
    {
      method: "POST",
      body: JSON.stringify({ option_id: shippingOptionId }),
    }
  )
  assertStatus("Shipping method ekle", shipped.status, [200, 201])

  const cartBody = asRecord(asRecord(shipped.body).cart)
  const total = asNumber(cartBody.total)
  const itemTotal = asNumber(cartBody.item_total ?? cartBody.item_subtotal)
  const shippingTotal = asNumber(cartBody.shipping_total)

  assert(
    "Fiyat major-unit (total > 0)",
    total > 0,
    `total=${total} item=${itemTotal} ship=${shippingTotal}`
  )
  assert(
    "Ürün tutarı mantıklı (≈ katalog fiyatı)",
    itemTotal > 0 && Math.abs(itemTotal - catalog.unitPrice) < catalog.unitPrice * 0.5 + 1,
    `itemTotal=${itemTotal} catalogPrice=${catalog.unitPrice}`
  )
  // Sanity: major-unit TRY — 1 kuruş değil, 1000+ TL ürünler için total << 1e6
  assert(
    "Major-unit (kuruş değil)",
    total < 1_000_000,
    `total=${total} (kuruş olsaydı çok büyük olurdu)`
  )

  return {
    cartId,
    email,
    total,
    itemTotal,
    shippingTotal,
    shippingOptionId,
  }
}
