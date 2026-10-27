import { test } from "@playwright/test"
import { stagingBackendUrl, uniqueEmail } from "./env"

const ORDER_NUMBER_BASE = 100_000

export type PlacedGuestOrder = {
  id: string
  email: string
  displayId?: number
  sixDigit?: string
  itemId?: string
}

type StoreHeaders = {
  "content-type": string
  "x-publishable-api-key": string
}

function storeHeaders(): StoreHeaders | null {
  const backend = stagingBackendUrl()
  const pk =
    process.env.STAGING_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    ""
  if (!backend || !pk) return null
  return {
    "content-type": "application/json",
    "x-publishable-api-key": pk,
  }
}

export function requireStoreApi(): { backend: string; headers: StoreHeaders } {
  const backend = stagingBackendUrl()
  const headers = storeHeaders()
  if (!backend || !headers) {
    test.skip(true, "STAGING_BACKEND_URL + publishable key gerekli")
    return {
      backend: "",
      headers: { "content-type": "", "x-publishable-api-key": "" },
    }
  }
  return { backend, headers }
}

async function fetchJson(
  url: string,
  init: RequestInit & { headers: StoreHeaders },
  attempts = 4
): Promise<{ status: number; body: unknown }> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(25_000),
      })
      const body = await res.json().catch(() => ({}))
      return { status: res.status, body }
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 800 * (i + 1)))
    }
  }
  throw new Error(
    `fetch failed after ${attempts} attempts: ${url} — ${String(lastErr)}`
  )
}

async function resolveRegionId(
  backend: string,
  headers: StoreHeaders
): Promise<string> {
  const { status, body } = await fetchJson(`${backend}/store/regions?limit=5`, {
    headers,
  })
  if (status >= 400) {
    throw new Error(`regions ${status}: ${JSON.stringify(body).slice(0, 200)}`)
  }
  const regionJson = body as { regions?: { id: string }[] }
  const regionId =
    process.env.STAGING_REGION_ID ||
    process.env.NEXT_PUBLIC_MEDUSA_REGION_ID ||
    regionJson.regions?.[0]?.id
  if (!regionId) throw new Error("No region")
  return regionId
}

async function resolveInStockVariant(
  backend: string,
  headers: StoreHeaders,
  regionId: string
): Promise<string> {
  const { status, body } = await fetchJson(
    `${backend}/store/products?limit=50&region_id=${regionId}&country_code=tr&fields=*variants,+variants.inventory_quantity,+variants.manage_inventory`,
    { headers }
  )
  if (status >= 400) {
    throw new Error(`products ${status}: ${JSON.stringify(body).slice(0, 200)}`)
  }
  const prodJson = body as {
    products?: {
      variants?: {
        id: string
        inventory_quantity?: number | null
        manage_inventory?: boolean | null
      }[]
    }[]
  }
  for (const p of prodJson.products || []) {
    for (const v of p.variants || []) {
      if (v.manage_inventory === false) return v.id
      const q = v.inventory_quantity
      if (typeof q === "number" && q > 0) return v.id
    }
  }
  throw new Error("No in-stock variant (limit=50 scanned)")
}

async function assertLookup(
  backend: string,
  headers: StoreHeaders,
  queryId: string,
  email: string,
  expectedOrderId?: string
) {
  const want = expectedOrderId || queryId
  let lastStatus = 0
  let lastBody: unknown = {}
  for (let i = 0; i < 5; i++) {
    const { status, body } = await fetchJson(`${backend}/store/orders/lookup`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: queryId, email }),
    })
    lastStatus = status
    lastBody = body
    const order = (body as { order?: { id?: string } }).order
    if (status === 200 && order?.id === want) return
    if (status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)))
      continue
    }
    break
  }
  throw new Error(
    `post-place lookup failed query=${queryId} want=${want} status=${lastStatus} body=${JSON.stringify(lastBody).slice(0, 200)}`
  )
}

/**
 * Guest stub checkout via Store API (PayTR mock / no iframe).
 * Isolated with *@escay.test emails.
 */
export async function placeGuestOrderViaApi(
  emailPrefix = "guest"
): Promise<PlacedGuestOrder> {
  const fixtureId = process.env.STAGING_E2E_ORDER_ID?.trim()
  const fixtureEmail = process.env.STAGING_E2E_ORDER_EMAIL?.trim()
  if (fixtureId && fixtureEmail && emailPrefix === "track") {
    return { id: fixtureId, email: fixtureEmail }
  }

  const { backend, headers } = requireStoreApi()
  const email = uniqueEmail(emailPrefix)
  const regionId = await resolveRegionId(backend, headers)
  const variantId = await resolveInStockVariant(backend, headers, regionId)

  const cartCreated = await fetchJson(`${backend}/store/carts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ region_id: regionId, email }),
  })
  const cartId = (cartCreated.body as { cart?: { id: string } }).cart?.id
  if (!cartId || cartCreated.status >= 400) {
    throw new Error(
      `No cart status=${cartCreated.status} ${JSON.stringify(cartCreated.body).slice(0, 200)}`
    )
  }

  const line = await fetchJson(`${backend}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers,
    body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
  })
  if (line.status >= 400) {
    throw new Error(
      `line-item ${line.status} variant=${variantId}: ${JSON.stringify(line.body).slice(0, 240)}`
    )
  }

  const address = {
    first_name: "Guest",
    last_name: "E2E",
    address_1: "Test Cad. No:1",
    city: "İstanbul",
    country_code: "tr",
    postal_code: "34000",
    phone: "05551112233",
    metadata: { district: "Şişli" },
  }
  await fetchJson(`${backend}/store/carts/${cartId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      shipping_address: address,
      billing_address: address,
    }),
  })

  const opts = await fetchJson(
    `${backend}/store/shipping-options?cart_id=${cartId}`,
    { headers }
  )
  const optionId = (
    opts.body as { shipping_options?: { id: string }[] }
  ).shipping_options?.[0]?.id
  if (!optionId) throw new Error("No shipping")
  await fetchJson(`${backend}/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    headers,
    body: JSON.stringify({ option_id: optionId }),
  })

  const cartPay = await fetchJson(
    `${backend}/store/carts/${cartId}?fields=*payment_collection,total`,
    { headers }
  )
  const cartPayJson = cartPay.body as {
    cart?: { payment_collection?: { id?: string }; total?: number }
  }
  let pcId = cartPayJson.cart?.payment_collection?.id
  if (!pcId) {
    const pc = await fetchJson(`${backend}/store/payment-collections`, {
      method: "POST",
      headers,
      body: JSON.stringify({ cart_id: cartId }),
    })
    pcId = (pc.body as { payment_collection?: { id: string } })
      .payment_collection?.id
  }
  if (!pcId) throw new Error("No payment collection")

  await fetchJson(
    `${backend}/store/payment-collections/${pcId}/payment-sessions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider_id: "pp_paytr_paytr",
        data: {
          customer_email: email,
          cart_items: [
            {
              name: "E2E",
              unit_price: cartPayJson.cart?.total || 100,
              quantity: 1,
            },
          ],
        },
      }),
    }
  )

  const complete = await fetchJson(`${backend}/store/carts/${cartId}/complete`, {
    method: "POST",
    headers,
  })
  const completeBody = complete.body as {
    type?: string
    order?: {
      id: string
      email?: string | null
      display_id?: number
      items?: { id?: string }[]
    }
    message?: string
    error?: unknown
  }
  const order = completeBody.order
  if (complete.status >= 400 || !order?.id) {
    throw new Error(
      `Complete failed status=${complete.status} type=${completeBody.type} ${JSON.stringify(completeBody).slice(0, 300)}`
    )
  }

  // Ensure guest lookup will work before handing the fixture to UI tests.
  await assertLookup(backend, headers, order.id, email)

  let displayId =
    order.display_id != null ? Number(order.display_id) : undefined
  if (displayId == null || !Number.isFinite(displayId)) {
    const { body } = await fetchJson(`${backend}/store/orders/lookup`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: order.id, email }),
    })
    const looked = (body as { order?: { display_id?: number | string } }).order
    if (looked?.display_id != null) displayId = Number(looked.display_id)
  }

  const sixDigit =
    displayId != null && Number.isFinite(displayId)
      ? String(ORDER_NUMBER_BASE + displayId)
      : undefined

  return {
    id: order.id,
    email,
    displayId:
      displayId != null && Number.isFinite(displayId) ? displayId : undefined,
    sixDigit,
    itemId: order.items?.[0]?.id,
  }
}

export function formatSixDigit(displayId: number): string {
  return String(ORDER_NUMBER_BASE + displayId)
}
