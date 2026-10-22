/**
 * Guest → member order linking smoke.
 *
 * Hits the running HTTP server (default http://localhost:9000) so the
 * confirm-route override is exercised, then checks GET /store/orders.
 *
 *   medusa exec ./src/scripts/smoke-link-guest-orders.ts
 *
 * Staging:
 *   MEDUSA_BACKEND_URL=http://127.0.0.1:9001 medusa exec ./src/scripts/smoke-link-guest-orders.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const BACKEND = (
  process.env.MEDUSA_BACKEND_URL ||
  process.env.STAGING_BACKEND_URL ||
  "http://127.0.0.1:9000"
).replace(/\/$/, "")

type AuthService = {
  requestAuthVerification: (data: {
    auth_identity_id: string
    entity_id: string
    entity_type: string
    code_provider: string
  }) => Promise<{ code?: string }>
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export default async function smokeLinkGuestOrders({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const apiKey = container.resolve(Modules.API_KEY)
  const auth = container.resolve(Modules.AUTH) as AuthService

  const keys = await apiKey.listApiKeys({ type: "publishable" })
  const pk = (keys[0]?.token as string | undefined) || ""
  if (!pk) throw new Error("No publishable API key")

  const storeHeaders = {
    "content-type": "application/json",
    "x-publishable-api-key": pk,
  }

  const email = `link-guest-${Date.now()}@escay.test`
  const otherEmail = `link-other-${Date.now()}@escay.test`
  const password = "IntegrationAuth2026!a"

  logger.info(`[smoke-link-guest] backend=${BACKEND} email=${email}`)

  const orderId = await placeGuestOrder(storeHeaders, email)
  const otherOrderId = await placeGuestOrder(storeHeaders, otherEmail)

  const { data: before } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "email"],
    filters: { id: orderId },
  })
  const guestCustomerId = (before?.[0] as { customer_id?: string })?.customer_id
  if (!guestCustomerId) throw new Error("Guest order has no customer_id")

  const register = await fetch(`${BACKEND}/auth/customer/emailpass/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const actorless = (await json<{ token?: string }>(register)).token
  if (!register.ok || !actorless) {
    throw new Error(`register failed ${register.status}`)
  }

  const created = await fetch(`${BACKEND}/store/customers`, {
    method: "POST",
    headers: { ...storeHeaders, Authorization: `Bearer ${actorless}` },
    body: JSON.stringify({
      email,
      first_name: "Guest",
      last_name: "Upgrade",
    }),
  })
  const registeredId = (await json<{ customer?: { id?: string } }>(created))
    .customer?.id
  if (!created.ok || !registeredId) {
    throw new Error(`create customer failed ${created.status}`)
  }
  if (registeredId === guestCustomerId) {
    throw new Error("Expected a second has_account customer")
  }

  const { data: afterRegister } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: orderId },
  })
  if (
    (afterRegister?.[0] as { customer_id?: string })?.customer_id !==
    guestCustomerId
  ) {
    throw new Error("Orders must stay on the guest until email verification")
  }

  const { data: identities } = await query.graph({
    entity: "provider_identity",
    fields: ["auth_identity_id"],
    filters: { entity_id: email, provider: "emailpass" },
  })
  const authIdentityId = identities?.[0]?.auth_identity_id as string | undefined
  if (!authIdentityId) throw new Error("No emailpass identity")

  const requested = await auth.requestAuthVerification({
    auth_identity_id: authIdentityId,
    entity_id: email,
    entity_type: "email",
    code_provider: "token",
  })
  if (!requested.code) throw new Error("No verification code")

  const confirm = await fetch(`${BACKEND}/auth/verification/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${actorless}`,
    },
    body: JSON.stringify({
      code: requested.code,
      code_provider: "token",
    }),
  })
  if (!confirm.ok) {
    throw new Error(
      `confirm failed ${confirm.status} ${await confirm.text()}`
    )
  }

  const { data: afterConfirm } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: orderId },
  })
  if (
    (afterConfirm?.[0] as { customer_id?: string })?.customer_id !==
    registeredId
  ) {
    throw new Error(
      `Expected order.customer_id=${registeredId} after email confirm`
    )
  }

  const { data: other } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: otherOrderId },
  })
  if (
    (other?.[0] as { customer_id?: string })?.customer_id === registeredId
  ) {
    throw new Error("Cross-email order was incorrectly linked")
  }

  const login = await fetch(`${BACKEND}/auth/customer/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const actor = (await json<{ token?: string; verification_required?: boolean }>(
    login
  )).token
  if (!login.ok || !actor) {
    throw new Error(`verified login failed ${login.status}`)
  }

  const listed = await fetch(`${BACKEND}/store/orders`, {
    headers: { ...storeHeaders, Authorization: `Bearer ${actor}` },
  })
  const orders = (await json<{ orders?: { id: string }[] }>(listed)).orders || []
  if (!orders.some((o) => o.id === orderId)) {
    throw new Error("Linked guest order missing from GET /store/orders")
  }
  if (orders.some((o) => o.id === otherOrderId)) {
    throw new Error("Other mailbox order leaked into siparişlerim")
  }

  const listedAgain = await fetch(`${BACKEND}/store/orders`, {
    headers: { ...storeHeaders, Authorization: `Bearer ${actor}` },
  })
  const again =
    (await json<{ orders?: { id: string }[] }>(listedAgain)).orders || []
  if (!again.some((o) => o.id === orderId)) {
    throw new Error("Idempotent re-list dropped the linked order")
  }

  logger.info(
    `[smoke-link-guest] OK linked order=${orderId} guest=${guestCustomerId} → registered=${registeredId}`
  )
}

async function placeGuestOrder(
  storeHeaders: Record<string, string>,
  email: string
): Promise<string> {
  const regions = await fetch(`${BACKEND}/store/regions?limit=1`, {
    headers: storeHeaders,
  })
  const regionId = (await json<{ regions?: { id: string }[] }>(regions))
    .regions?.[0]?.id
  if (!regionId) throw new Error("No region")

  const products = await fetch(
    `${BACKEND}/store/products?limit=12&region_id=${regionId}&country_code=tr&fields=*variants,+variants.inventory_quantity`,
    { headers: storeHeaders }
  )
  const variantId = (
    await json<{
      products?: {
        variants?: { id: string; inventory_quantity?: number | null }[]
      }[]
    }>(products)
  ).products
    ?.flatMap((p) => p.variants || [])
    .find((v) => (v.inventory_quantity ?? 1) > 0)?.id
  if (!variantId) throw new Error("No in-stock variant")

  const created = await fetch(`${BACKEND}/store/carts`, {
    method: "POST",
    headers: storeHeaders,
    body: JSON.stringify({ region_id: regionId, email }),
  })
  const cartId = (await json<{ cart?: { id: string } }>(created)).cart?.id
  if (!cartId) throw new Error("No cart")

  await fetch(`${BACKEND}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers: storeHeaders,
    body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
  })

  const addr = {
    first_name: "Guest",
    last_name: "Link",
    address_1: "Test Cad. No:1",
    city: "İstanbul",
    country_code: "tr",
    postal_code: "34000",
    phone: "05551112233",
    metadata: { district: "Şişli" },
  }
  await fetch(`${BACKEND}/store/carts/${cartId}`, {
    method: "POST",
    headers: storeHeaders,
    body: JSON.stringify({
      email,
      shipping_address: addr,
      billing_address: addr,
    }),
  })

  const opts = await fetch(
    `${BACKEND}/store/shipping-options?cart_id=${cartId}`,
    { headers: storeHeaders }
  )
  const optionId = (
    await json<{ shipping_options?: { id: string }[] }>(opts)
  ).shipping_options?.[0]?.id
  if (!optionId) throw new Error("No shipping option")
  await fetch(`${BACKEND}/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    headers: storeHeaders,
    body: JSON.stringify({ option_id: optionId }),
  })

  const cartPay = await fetch(
    `${BACKEND}/store/carts/${cartId}?fields=*payment_collection,total`,
    { headers: storeHeaders }
  )
  const cartPayJson = await json<{
    cart?: { payment_collection?: { id?: string }; total?: number }
  }>(cartPay)
  let pcId = cartPayJson.cart?.payment_collection?.id
  if (!pcId) {
    const pc = await fetch(`${BACKEND}/store/payment-collections`, {
      method: "POST",
      headers: storeHeaders,
      body: JSON.stringify({ cart_id: cartId }),
    })
    pcId = (await json<{ payment_collection?: { id: string } }>(pc))
      .payment_collection?.id
  }
  if (!pcId) throw new Error("No payment collection")

  await fetch(`${BACKEND}/store/payment-collections/${pcId}/payment-sessions`, {
    method: "POST",
    headers: storeHeaders,
    body: JSON.stringify({
      provider_id: "pp_paytr_paytr",
      data: {
        customer_email: email,
        cart_items: [
          {
            name: "Link",
            unit_price: cartPayJson.cart?.total || 100,
            quantity: 1,
          },
        ],
      },
    }),
  })

  const complete = await fetch(`${BACKEND}/store/carts/${cartId}/complete`, {
    method: "POST",
    headers: storeHeaders,
  })
  const completeJson = await json<{
    order?: { id?: string }
    type?: string
    message?: string
  }>(complete)
  const orderId = completeJson.order?.id
  if (!orderId) {
    throw new Error(
      `complete failed ${complete.status} ${completeJson.type || completeJson.message || ""}`
    )
  }
  return orderId
}
