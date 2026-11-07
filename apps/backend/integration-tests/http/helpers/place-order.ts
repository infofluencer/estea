import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeCallbackHash } from "../../../src/modules/paytr/hash"
import { PAYTR_CHECKOUT_MODULE } from "../../../src/modules/paytr-checkout"
import { trShippingAddress, type StorefrontFixture } from "./storefront-fixture"

export type PlacedStoreOrder = {
  id: string
  display_id: number
  email: string
  customer_id?: string | null
  items: { id: string; quantity?: number }[]
}

type ApiClient = {
  post: Function
  get: Function
}

export async function placeGuestStubOrder(
  api: ApiClient,
  fx: StorefrontFixture,
  variantId: string,
  email: string,
  opts: {
    quantity?: number
    promoCode?: string
    /** Giriş yapmış müşteri: publishable key + Bearer */
    headers?: { headers: Record<string, string> }
    /** Varsayılan PayTR stub; havale için pp_havale_havale */
    providerId?: string
    cartMetadata?: Record<string, unknown>
  } = {}
): Promise<PlacedStoreOrder> {
  fx = opts.headers ? { ...fx, storeHeaders: opts.headers } : fx
  const providerId = opts.providerId ?? "pp_paytr_paytr"
  const created = await api.post(
    `/store/carts`,
    {
      region_id: fx.regionId,
      sales_channel_id: fx.salesChannelId,
      email,
    },
    fx.storeHeaders
  )
  const cartId = created.data.cart.id
  await api.post(
    `/store/carts/${cartId}/line-items`,
    { variant_id: variantId, quantity: opts.quantity ?? 1 },
    fx.storeHeaders
  )
  if (opts.promoCode) {
    await api.post(
      `/store/carts/${cartId}/promotions`,
      { promo_codes: [opts.promoCode] },
      fx.storeHeaders
    )
  }
  const addr = trShippingAddress()
  await api.post(
    `/store/carts/${cartId}`,
    {
      email,
      shipping_address: addr,
      billing_address: addr,
      ...(opts.cartMetadata ? { metadata: opts.cartMetadata } : {}),
    },
    fx.storeHeaders
  )
  await api.post(
    `/store/carts/${cartId}/shipping-methods`,
    { option_id: fx.shippingOptionId },
    fx.storeHeaders
  )

  const cartGet = await api.get(
    `/store/carts/${cartId}?fields=*payment_collection,total`,
    fx.storeHeaders
  )
  let pcId = cartGet.data.cart.payment_collection?.id
  if (!pcId) {
    const pc = await api.post(
      `/store/payment-collections`,
      { cart_id: cartId },
      fx.storeHeaders
    )
    pcId = pc.data.payment_collection.id
  }
  const session =
    providerId === "pp_paytr_paytr"
      ? {
          provider_id: providerId,
          data: {
            customer_email: email,
            cart_items: [
              {
                name: "Guest",
                unit_price: Number(cartGet.data.cart.total) || 100,
                quantity: 1,
              },
            ],
          },
        }
      : { provider_id: providerId }
  await api.post(
    `/store/payment-collections/${pcId}/payment-sessions`,
    session,
    fx.storeHeaders
  )
  const complete = await api.post(
    `/store/carts/${cartId}/complete`,
    {},
    fx.storeHeaders
  )
  const order = complete.data.order as {
    id: string
    display_id: number
    email: string
    customer_id?: string | null
    items?: { id?: string; quantity?: number }[]
  }
  if (!order?.id) throw new Error("cart.complete did not return an order")
  return {
    id: order.id,
    display_id: Number(order.display_id),
    email: order.email || email,
    customer_id: order.customer_id,
    items: (order.items || [])
      .filter((i) => i.id)
      .map((i) => ({ id: i.id as string, quantity: i.quantity })),
  }
}

/**
 * Canlıdaki kart yolu: iframe kaydı → PayTR "success" bildirimi → sipariş +
 * capture. placeGuestStubOrder ödemeyi yalnız authorize eder; geri ödeme /
 * fatura gibi capture isteyen akışlar bunu kullanmalı.
 */
export async function placePaidCardOrder(
  api: ApiClient,
  container: MedusaContainer,
  fx: StorefrontFixture,
  variantId: string,
  email: string,
  opts: { quantity?: number } = {}
): Promise<PlacedStoreOrder> {
  const created = await api.post(
    `/store/carts`,
    { region_id: fx.regionId, sales_channel_id: fx.salesChannelId, email },
    fx.storeHeaders
  )
  const cartId = created.data.cart.id as string
  await api.post(
    `/store/carts/${cartId}/line-items`,
    { variant_id: variantId, quantity: opts.quantity ?? 1 },
    fx.storeHeaders
  )
  const addr = trShippingAddress()
  await api.post(
    `/store/carts/${cartId}`,
    { email, shipping_address: addr, billing_address: addr },
    fx.storeHeaders
  )
  await api.post(
    `/store/carts/${cartId}/shipping-methods`,
    { option_id: fx.shippingOptionId },
    fx.storeHeaders
  )
  const pc = await api.post(`/store/payment-collections`, { cart_id: cartId }, fx.storeHeaders)
  await api.post(
    `/store/payment-collections/${pc.data.payment_collection.id}/payment-sessions`,
    { provider_id: "pp_paytr_paytr", data: {} },
    fx.storeHeaders
  )
  const reg = await api.post(`/store/paytr-checkout/register`, { cart_id: cartId }, fx.storeHeaders)
  const oid = reg.data.merchant_oid as string

  const checkouts = container.resolve(PAYTR_CHECKOUT_MODULE) as unknown as {
    listPaytrCheckouts: (f: Record<string, unknown>) => Promise<{ amount_kurus: number }[]>
  }
  const [row] = await checkouts.listPaytrCheckouts({ merchant_oid: oid })
  const total = String(row.amount_kurus)
  const res = await api.post(
    `/paytr/callback`,
    new URLSearchParams({
      merchant_oid: oid,
      status: "success",
      total_amount: total,
      payment_amount: total,
      hash: computeCallbackHash({
        merchantOid: oid,
        merchantSalt: process.env.PAYTR_MERCHANT_SALT || "",
        status: "success",
        totalAmount: total,
        merchantKey: process.env.PAYTR_MERCHANT_KEY || "",
      }),
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  )
  if (res.data !== "OK") throw new Error(`PayTR callback failed: ${String(res.data)}`)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({
    entity: "order_cart",
    fields: ["order_id"],
    filters: { cart_id: cartId },
  })
  const orderId = (links?.[0] as { order_id?: string } | undefined)?.order_id
  if (!orderId) throw new Error(`No order for cart ${cartId} after PayTR success`)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "customer_id", "items.id", "items.quantity"],
    filters: { id: orderId },
  })
  const order = data![0] as unknown as {
    id: string
    display_id: number
    email: string
    customer_id?: string | null
    items?: { id: string; quantity?: number }[]
  }
  return {
    id: order.id,
    display_id: Number(order.display_id),
    email: order.email,
    customer_id: order.customer_id,
    items: (order.items || []).map((i) => ({ id: i.id, quantity: Number(i.quantity) })),
  }
}
