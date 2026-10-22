import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ORDER_NUMBER_BASE } from "@escay/shared/order-number"
import {
  createPricedProducts,
  seedStorefrontFixture,
  trShippingAddress,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"

jest.setTimeout(120 * 1000)

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
    describe("Cart + checkout (PayTR stub)", () => {
      let fx: StorefrontFixture
      let variantId: string
      let unitPrice: number

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
        const products = await createPricedProducts(getContainer(), fx, 1, {
          unitPrice: 2199,
        })
        variantId = products[0].variants![0].id
        unitPrice = 2199
      })

      it("cart → line item → address → shipping → major-unit totals", async () => {
        const email = `cart-${Date.now()}@escay.test`
        const created = await api.post(
          `/store/carts`,
          {
            region_id: fx.regionId,
            sales_channel_id: fx.salesChannelId,
            email,
          },
          fx.storeHeaders
        )
        expect(created.status).toEqual(200)
        const cartId = created.data.cart.id

        const withItem = await api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: variantId, quantity: 1 },
          fx.storeHeaders
        )
        expect(withItem.status).toEqual(200)
        expect(withItem.data.cart.items.length).toBeGreaterThanOrEqual(1)

        const addr = trShippingAddress()
        await api.post(
          `/store/carts/${cartId}`,
          {
            email,
            shipping_address: addr,
            billing_address: addr,
          },
          fx.storeHeaders
        )

        const shipped = await api.post(
          `/store/carts/${cartId}/shipping-methods`,
          { option_id: fx.shippingOptionId },
          fx.storeHeaders
        )
        expect(shipped.status).toEqual(200)

        const cart = shipped.data.cart
        expect(Number(cart.item_total ?? cart.item_subtotal)).toBeGreaterThan(0)
        expect(Number(cart.total)).toBeGreaterThan(0)
        expect(Number(cart.total)).toBeLessThan(1_000_000)
        expect(
          Math.abs(Number(cart.item_total ?? cart.item_subtotal) - unitPrice)
        ).toBeLessThan(unitPrice * 0.5 + 1)
      })

      it("PayTR stub payment session → cart.complete → order + 6-digit number", async () => {
        const email = `checkout-${Date.now()}@escay.test`
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
          {
            email,
            shipping_address: addr,
            billing_address: addr,
            metadata: { legal_accepted_at: new Date().toISOString() },
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
        let pcId = cartGet.data.cart.payment_collection?.id as
          | string
          | undefined
        if (!pcId) {
          const pc = await api.post(
            `/store/payment-collections`,
            { cart_id: cartId },
            fx.storeHeaders
          )
          pcId = pc.data.payment_collection.id
        }

        const session = await api.post(
          `/store/payment-collections/${pcId}/payment-sessions`,
          {
            provider_id: "pp_paytr_paytr",
            data: {
              customer_email: email,
              cart_items: [
                {
                  name: "Integration",
                  unit_price: Number(cartGet.data.cart.total) || unitPrice,
                  quantity: 1,
                },
              ],
            },
          },
          fx.storeHeaders
        )
        expect(session.status).toBeLessThan(300)
        const sessionData =
          session.data.payment_collection?.payment_sessions?.[0]?.data ||
          session.data.payment_sessions?.[0]?.data
        expect(
          sessionData?._stub === true || sessionData?.iframe_token == null
        ).toBeTruthy()

        const complete = await api.post(
          `/store/carts/${cartId}/complete`,
          {},
          fx.storeHeaders
        )
        expect(complete.status).toEqual(200)
        const order = complete.data.order
        expect(order?.id).toBeTruthy()
        expect(Number(order.display_id)).toBeGreaterThanOrEqual(1)
        const six = String(ORDER_NUMBER_BASE + Number(order.display_id))
        expect(six.length).toEqual(6)
      })
    })
  },
})
