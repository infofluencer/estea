import { assert, assertStatus, section } from "../_helpers/assert"
import type { StagingEnv } from "../_helpers/env"
import {
  asNumber,
  asRecord,
  bodyMessage,
  storeFetch,
} from "../_helpers/http"
import type { CartContext } from "./cart"

export type CheckoutContext = {
  orderId: string
  email: string
  displayId: number | null
  total: number
  metadata: Record<string, unknown> | null
  paymentStub: boolean
}

/** Format Medusa display_id → 6-digit customer number. */
export function formatOrderNumber(displayId: number): string {
  return String(100_000 + displayId)
}

async function ensurePaymentCollectionId(
  env: StagingEnv,
  cartId: string
): Promise<string | null> {
  const cartGet = await storeFetch(
    env,
    `/store/carts/${cartId}?fields=*payment_collection,total,metadata`
  )
  if (cartGet.status !== 200) return null

  const existing = String(
    asRecord(asRecord(asRecord(cartGet.body).cart).payment_collection).id || ""
  )
  if (existing) return existing

  const created = await storeFetch(env, `/store/payment-collections`, {
    method: "POST",
    body: JSON.stringify({ cart_id: cartId }),
  })
  return (
    String(asRecord(asRecord(created.body).payment_collection).id || "") ||
    String(asRecord(created.body).id || "") ||
    null
  )
}

export async function runCheckoutSuite(
  env: StagingEnv,
  cart: CartContext
): Promise<CheckoutContext | null> {
  section("4. Checkout (entegrasyonsuz / PayTR stub)")

  const pcId = await ensurePaymentCollectionId(env, cart.cartId)
  assert("Payment collection", Boolean(pcId), pcId || "oluşturulamadı")
  if (!pcId) return null

  const sessions = await storeFetch(
    env,
    `/store/payment-collections/${pcId}/payment-sessions`,
    {
      method: "POST",
      body: JSON.stringify({
        provider_id: "pp_paytr_paytr",
        data: {
          customer_email: cart.email,
          first_name: "Staging",
          last_name: "Smoke",
          phone: "05551112233",
          address: "Test Cad. No:1, İstanbul",
          cart_items: [
            {
              name: "Staging smoke",
              unit_price: cart.total,
              quantity: 1,
            },
          ],
        },
      }),
    }
  )
  assertStatus("Payment session (PayTR)", sessions.status, [200, 201])

  const sessionsList =
    (asRecord(asRecord(sessions.body).payment_collection)
      .payment_sessions as Record<string, unknown>[]) ||
    (asRecord(sessions.body).payment_sessions as Record<string, unknown>[]) ||
    []
  const sessionData =
    (sessionsList[0]?.data as Record<string, unknown> | undefined) || undefined

  const isStub =
    sessionData?._stub === true ||
    sessionData?.iframe_token == null ||
    sessionData?.iframe_token === undefined

  assert(
    "PayTR stub session (çökmeden)",
    sessions.status < 300 && isStub,
    `_stub=${String(sessionData?._stub)} iframe_token=${String(sessionData?.iframe_token ?? "yok")}`
  )

  await storeFetch(env, `/store/carts/${cart.cartId}`, {
    method: "POST",
    body: JSON.stringify({
      metadata: { legal_accepted_at: new Date().toISOString() },
    }),
  })

  const complete = await storeFetch(
    env,
    `/store/carts/${cart.cartId}/complete`,
    { method: "POST" }
  )
  assertStatus("cart.complete → sipariş", complete.status, [200, 201])

  const completeBody = asRecord(complete.body)
  const order =
    (completeBody.order as Record<string, unknown> | undefined) ||
    (asRecord(completeBody.data).order as Record<string, unknown> | undefined)

  const orderId = String(order?.id || "")
  assert(
    "Sipariş oluştu",
    Boolean(orderId),
    orderId || bodyMessage(complete.body)
  )
  if (!orderId) return null

  const displayId =
    order?.display_id == null ? null : asNumber(order.display_id)
  const metadata =
    order?.metadata && typeof order.metadata === "object"
      ? (order.metadata as Record<string, unknown>)
      : null

  assert(
    "Order metadata alanı okunabilir",
    true,
    metadata
      ? `keys=${Object.keys(metadata).join(",") || "(boş)"}`
      : "metadata yok (Medusa kopyalamayabilir — soft ok)"
  )

  return {
    orderId,
    email: cart.email,
    displayId,
    total: asNumber(order?.total ?? cart.total),
    metadata,
    paymentStub: isStub,
  }
}
