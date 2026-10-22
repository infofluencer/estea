import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ORDER_NUMBER_BASE } from "@escay/shared/order-number"
import {
  createPricedProducts,
  seedStorefrontFixture,
  trShippingAddress,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"

jest.setTimeout(120 * 1000)

async function placeStubOrder(
  api: {
    post: Function
    get: Function
  },
  fx: StorefrontFixture,
  variantId: string,
  email: string
) {
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
            name: "Lookup",
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
  return complete.data.order as {
    id: string
    display_id: number
    email: string
  }
}

medusaIntegrationTestRunner({
  inApp: true,
  env: {
    PAYTR_MOCK: "1",
    PAYTR_MERCHANT_ID: "",
    PAYTR_MERCHANT_KEY: "",
    PAYTR_MERCHANT_SALT: "",
    SHIPPING_CARRIER: "",
    COOKIE_SECURE: "false",
  },
  testSuite: ({ api, getContainer }) => {
    describe("Order lookup (guest)", () => {
      let fx: StorefrontFixture
      let order: { id: string; display_id: number; email: string }

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
        const products = await createPricedProducts(getContainer(), fx, 1)
        const email = `lookup-${Date.now()}@escay.test`
        order = await placeStubOrder(
          api,
          fx,
          products[0].variants![0].id,
          email
        )
      })

      it("POST /store/orders/lookup with correct email → 200", async () => {
        const res = await api.post(
          `/store/orders/lookup`,
          { id: order.id, email: order.email },
          fx.storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.order.id).toEqual(order.id)
      })

      it("lookup by 6-digit order number", async () => {
        const six = String(ORDER_NUMBER_BASE + Number(order.display_id))
        const res = await api.post(
          `/store/orders/lookup`,
          { id: six, email: order.email },
          fx.storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.order.id).toEqual(order.id)
      })

      it("wrong email → generic 404 (throwOnError:false)", async () => {
        const wrong = await api
          .post(
            `/store/orders/lookup`,
            { id: order.id, email: "wrong@example.invalid" },
            { ...fx.storeHeaders, throwOnError: false }
          )
          .catch((e: { response?: { status: number; data: unknown } }) => e.response)

        const missing = await api
          .post(
            `/store/orders/lookup`,
            { id: "order_does_not_exist_zzz", email: order.email },
            { ...fx.storeHeaders, throwOnError: false }
          )
          .catch((e: { response?: { status: number; data: unknown } }) => e.response)

        // api helper may return response or throw — normalize
        const wrongStatus =
          (wrong as { status?: number })?.status ??
          (wrong as { response?: { status: number } })?.response?.status
        const missingStatus =
          (missing as { status?: number })?.status ??
          (missing as { response?: { status: number } })?.response?.status

        expect(wrongStatus).toEqual(404)
        expect(missingStatus).toEqual(404)
      })
    })
  },
})
