/**
 * Create demo orders for a customer covering UI statuses:
 * pending | paid | preparing | shipped | delivered | canceled
 *
 * Requires local backend running (PAYTR_MOCK=1).
 *
 *   medusa exec ./src/scripts/seed-order-status-demos.ts \
 *     staging-e2e@escay.test 'StagingE2E2026!a'
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  cancelOrderWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import crypto from "crypto"
import { resolveDefaultStockLocationId } from "../lib/default-stock-location"

type StatusKey =
  | "pending"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "canceled"

const STATUSES: StatusKey[] = [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "canceled",
]

const BACKEND = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(
  /\/$/,
  ""
)

async function publishableKey(): Promise<string> {
  const fromEnv =
    process.env.STAGING_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim()
  if (fromEnv) return fromEnv

  // Query via docker psql is not available here — fetch from admin is heavy.
  // Fall back: read from process env set by caller.
  throw new Error(
    "STAGING_PUBLISHABLE_KEY or NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY gerekli"
  )
}

async function placeOrder(input: {
  email: string
  password: string
  pk: string
  label: string
}): Promise<{ orderId: string; itemId: string; displayId?: number }> {
  const { email, password, pk, label } = input
  const storeHeaders = {
    "content-type": "application/json",
    "x-publishable-api-key": pk,
  }

  const login = await fetch(`${BACKEND}/auth/customer/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const loginJson = (await login.json()) as { token?: string }
  if (!login.ok || !loginJson.token) {
    throw new Error(`Login failed for ${email}: ${login.status}`)
  }
  const auth = {
    ...storeHeaders,
    Authorization: `Bearer ${loginJson.token}`,
  }

  const regions = await fetch(`${BACKEND}/store/regions?limit=1`, {
    headers: storeHeaders,
  })
  const regionId = (
    (await regions.json()) as { regions?: { id: string }[] }
  ).regions?.[0]?.id
  if (!regionId) throw new Error("No region")

  const products = await fetch(
    `${BACKEND}/store/products?limit=10&region_id=${regionId}&country_code=tr&fields=*variants,+variants.inventory_quantity`,
    { headers: storeHeaders }
  )
  const prodJson = (await products.json()) as {
    products?: {
      variants?: { id: string; inventory_quantity?: number | null }[]
    }[]
  }
  let variantId = ""
  for (const p of prodJson.products || []) {
    for (const v of p.variants || []) {
      if (v.inventory_quantity == null || v.inventory_quantity > 0) {
        variantId = v.id
        break
      }
    }
    if (variantId) break
  }
  if (!variantId) throw new Error("No variant")

  const cartRes = await fetch(`${BACKEND}/store/carts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ region_id: regionId, email }),
  })
  const cartId = ((await cartRes.json()) as { cart?: { id: string } }).cart?.id
  if (!cartId) throw new Error("No cart")

  await fetch(`${BACKEND}/store/carts/${cartId}/customer`, {
    method: "POST",
    headers: auth,
    body: "{}",
  }).catch(() => undefined)

  await fetch(`${BACKEND}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
  })

  const address = {
    first_name: "Staging",
    last_name: label.slice(0, 12),
    address_1: `Demo ${label} Cad. No:1`,
    city: "İstanbul",
    country_code: "tr",
    postal_code: "34380",
    phone: "05551112233",
    metadata: { district: "Şişli", demo_status: label },
  }
  await fetch(`${BACKEND}/store/carts/${cartId}`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      email,
      shipping_address: address,
      billing_address: address,
    }),
  })

  const opts = await fetch(
    `${BACKEND}/store/shipping-options?cart_id=${cartId}`,
    { headers: auth }
  )
  const optionId = (
    (await opts.json()) as { shipping_options?: { id: string }[] }
  ).shipping_options?.[0]?.id
  if (!optionId) throw new Error("No shipping")
  await fetch(`${BACKEND}/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ option_id: optionId }),
  })

  const cartPay = await fetch(
    `${BACKEND}/store/carts/${cartId}?fields=*payment_collection,total`,
    { headers: auth }
  )
  const cartPayJson = (await cartPay.json()) as {
    cart?: { payment_collection?: { id?: string }; total?: number }
  }
  let pcId = cartPayJson.cart?.payment_collection?.id
  if (!pcId) {
    const pc = await fetch(`${BACKEND}/store/payment-collections`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ cart_id: cartId }),
    })
    pcId = ((await pc.json()) as { payment_collection?: { id: string } })
      .payment_collection?.id
  }
  if (!pcId) throw new Error("No PC")

  await fetch(`${BACKEND}/store/payment-collections/${pcId}/payment-sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      provider_id: "pp_paytr_paytr",
      data: {
        customer_email: email,
        cart_items: [
          {
            name: `Demo ${label}`,
            unit_price: cartPayJson.cart?.total || 100,
            quantity: 1,
          },
        ],
      },
    }),
  })

  const complete = await fetch(`${BACKEND}/store/carts/${cartId}/complete`, {
    method: "POST",
    headers: auth,
  })
  const order = (
    (await complete.json()) as {
      order?: { id: string; display_id?: number; items?: { id?: string }[] }
    }
  ).order
  if (!order?.id) throw new Error(`Complete failed (${label})`)

  const itemId = order.items?.[0]?.id
  if (!itemId) throw new Error(`No item on order ${order.id}`)

  return {
    orderId: order.id,
    itemId,
    displayId: order.display_id,
  }
}

async function capturePaytr(
  container: ExecArgs["container"],
  orderId: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: opc } = await query.graph({
    entity: "order_payment_collection",
    fields: ["payment_collection_id"],
    filters: { order_id: orderId },
  })
  const pcId = (opc?.[0] as { payment_collection_id?: string } | undefined)
    ?.payment_collection_id
  if (!pcId) return

  const { data: sessions } = await query.graph({
    entity: "payment_session",
    fields: ["amount", "data"],
    filters: { payment_collection_id: pcId },
  })
  const session = sessions?.[0] as
    | { amount?: number | string; data?: { merchant_oid?: string } }
    | undefined
  const oid = String(session?.data?.merchant_oid || "")
  const amount = Number(session?.amount)
  if (!oid || !Number.isFinite(amount)) return

  const kurus = String(Math.round(amount * 100))
  const key = process.env.PAYTR_MERCHANT_KEY || ""
  const salt = process.env.PAYTR_MERCHANT_SALT || ""
  const hash = crypto
    .createHmac("sha256", key)
    .update(oid + salt + "success" + kurus)
    .digest("base64")

  const res = await fetch(`${BACKEND}/paytr/callback`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      merchant_oid: oid,
      status: "success",
      total_amount: kurus,
      hash,
    }).toString(),
  })
  const text = await res.text()
  if (text.trim() !== "OK") {
    throw new Error(`PayTR callback: ${text.slice(0, 120)}`)
  }
  await new Promise((r) => setTimeout(r, 700))
}

async function withManualShipping<T>(
  container: ExecArgs["container"],
  orderId: string,
  fn: (soId?: string) => Promise<T>
): Promise<T> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["shipping_methods.shipping_option_id"],
    filters: { id: orderId },
  })
  const soId = (
    orders?.[0] as { shipping_methods?: { shipping_option_id?: string }[] }
  )?.shipping_methods?.[0]?.shipping_option_id

  const fulMod = container.resolve(Modules.FULFILLMENT) as {
    updateShippingOptions: (
      id: string,
      data: Record<string, unknown>
    ) => Promise<unknown>
    retrieveShippingOption: (id: string) => Promise<{ provider_id?: string }>
  }
  let prev: string | undefined
  if (soId) {
    const before = await fulMod.retrieveShippingOption(soId)
    prev = before.provider_id
    if (prev && prev !== "manual_manual") {
      await fulMod.updateShippingOptions(soId, { provider_id: "manual_manual" })
    }
  }
  try {
    return await fn(soId)
  } finally {
    if (soId && prev && prev !== "manual_manual") {
      await fulMod.updateShippingOptions(soId, { provider_id: prev })
    }
  }
}

async function fulfill(
  container: ExecArgs["container"],
  orderId: string,
  itemId: string,
  mode: "prepare" | "ship" | "deliver"
) {
  const locationId = await resolveDefaultStockLocationId(container)
  if (!locationId) throw new Error("No stock location")
  const items = [{ id: itemId, quantity: 1 }]

  await withManualShipping(container, orderId, async (soId) => {
    const { result } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: orderId,
        items,
        location_id: locationId,
        ...(soId ? { shipping_option_id: soId } : {}),
        no_notification: true,
      },
    })
    const fulfillmentId =
      (result as { id?: string } | undefined)?.id ||
      (Array.isArray(result) ? (result[0] as { id?: string })?.id : undefined)
    if (!fulfillmentId) throw new Error("Fulfillment create failed")

    if (mode === "prepare") return

    await createOrderShipmentWorkflow(container).run({
      input: {
        order_id: orderId,
        fulfillment_id: fulfillmentId,
        items,
      },
    })

    // Attach demo carrier tracking (label + normalize data) for UI
    if (mode === "ship" || mode === "deliver") {
      const trackNo = `DEMO-${Date.now().toString().slice(-8)}`
      const trackUrl = `https://example.com/track/${trackNo}`
      const fulSvc = container.resolve(Modules.FULFILLMENT) as {
        updateFulfillment: (
          id: string,
          data: Record<string, unknown>
        ) => Promise<unknown>
      }
      await fulSvc.updateFulfillment(fulfillmentId, {
        data: {
          carrier: "demo",
          carrier_name: "Demo Kargo",
          tracking_number: trackNo,
          tracking_url: trackUrl,
        },
        labels: [
          {
            tracking_number: trackNo,
            tracking_url: trackUrl,
            label_url: "",
          },
        ],
      })
    }

    if (mode === "ship") return

    await markOrderFulfillmentAsDeliveredWorkflow(container).run({
      input: { orderId, fulfillmentId },
    })
  })
}

export default async function seedOrderStatusDemos({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const email = String(args?.[0] || process.env.STAGING_VERIFIED_EMAIL || "")
    .trim()
    .toLowerCase()
  const password = String(
    args?.[1] || process.env.STAGING_VERIFIED_PASSWORD || ""
  )

  if (!email || !password) {
    throw new Error(
      "Usage: medusa exec ./src/scripts/seed-order-status-demos.ts <email> <password>"
    )
  }

  // Resolve publishable key from DB
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  let pk = ""
  try {
    pk = await publishableKey()
  } catch {
    const { data: keys } = await query.graph({
      entity: "api_key",
      fields: ["token", "type"],
      filters: { type: "publishable" },
    })
    pk = String((keys?.[0] as { token?: string } | undefined)?.token || "")
  }
  if (!pk) throw new Error("Publishable API key bulunamadı")

  const results: { status: StatusKey; orderId: string; displayId?: number }[] =
    []

  for (const status of STATUSES) {
    logger.info(`[seed-order-status] creating ${status}…`)
    const placed = await placeOrder({
      email,
      password,
      pk,
      label: status,
    })

    try {
      if (status === "pending") {
        // leave as completed-cart pending auth
      } else if (status === "paid") {
        await capturePaytr(container, placed.orderId)
      } else if (status === "preparing") {
        await capturePaytr(container, placed.orderId)
        await fulfill(container, placed.orderId, placed.itemId, "prepare")
      } else if (status === "shipped") {
        await capturePaytr(container, placed.orderId)
        await fulfill(container, placed.orderId, placed.itemId, "ship")
      } else if (status === "delivered") {
        await capturePaytr(container, placed.orderId)
        await fulfill(container, placed.orderId, placed.itemId, "deliver")
      } else if (status === "canceled") {
        await cancelOrderWorkflow(container).run({
          input: { order_id: placed.orderId },
        })
      }
      results.push({
        status,
        orderId: placed.orderId,
        displayId: placed.displayId,
      })
      logger.info(
        `[seed-order-status] OK ${status} #${placed.displayId} ${placed.orderId}`
      )
    } catch (e) {
      logger.error(
        `[seed-order-status] FAIL ${status} ${placed.orderId}: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
      results.push({
        status,
        orderId: placed.orderId,
        displayId: placed.displayId,
      })
    }
  }

  logger.info("[seed-order-status] summary:")
  for (const r of results) {
    logger.info(
      `  ${r.status.padEnd(10)} #${r.displayId ?? "?"} ${r.orderId}`
    )
  }
}
