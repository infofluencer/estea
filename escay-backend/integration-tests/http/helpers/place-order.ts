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
  email: string
): Promise<PlacedStoreOrder> {
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
    { variant_id: variantId, quantity: 1 },
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
  await api.post(
    `/store/payment-collections/${pcId}/payment-sessions`,
    {
      provider_id: "pp_paytr_paytr",
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
    },
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

