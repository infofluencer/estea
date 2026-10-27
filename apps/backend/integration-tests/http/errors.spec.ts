import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  createPricedProducts,
  seedStorefrontFixture,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"

jest.setTimeout(60 * 1000)

/**
 * Error / edge-case HTTP tests (throwOnError:false).
 * Deep RMA smoke remains in npm run test:smoke:* / test:returns.
 */
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
    describe("Error scenarios", () => {
      let fx: StorefrontFixture
      let variantId: string

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
        const products = await createPricedProducts(getContainer(), fx, 1, {
          unitPrice: 500,
        })
        variantId = products[0].variants![0].id
      })

      it("invalid publishable key → 4xx", async () => {
        try {
          const res = await api.get(`/store/products?limit=1`, {
            headers: { "x-publishable-api-key": "pk_invalid" },
            throwOnError: false,
          })
          expect([400, 401, 403]).toContain(res.status)
        } catch (e: unknown) {
          const status = (e as { response?: { status?: number } })?.response
            ?.status
          expect([400, 401, 403]).toContain(status)
        }
      })

      it("add invalid variant to cart → error", async () => {
        const cart = await api.post(
          `/store/carts`,
          { region_id: fx.regionId, sales_channel_id: fx.salesChannelId },
          fx.storeHeaders
        )
        try {
          const res = await api.post(
            `/store/carts/${cart.data.cart.id}/line-items`,
            { variant_id: "variant_does_not_exist", quantity: 1 },
            { ...fx.storeHeaders, throwOnError: false }
          )
          expect(res.status).toBeGreaterThanOrEqual(400)
        } catch (e: unknown) {
          const status = (e as { response?: { status?: number } })?.response
            ?.status
          expect(status).toBeGreaterThanOrEqual(400)
        }
      })

      it("invalid promo code → error (errors[])", async () => {
        const cart = await api.post(
          `/store/carts`,
          { region_id: fx.regionId, sales_channel_id: fx.salesChannelId },
          fx.storeHeaders
        )
        await api.post(
          `/store/carts/${cart.data.cart.id}/line-items`,
          { variant_id: variantId, quantity: 1 },
          fx.storeHeaders
        )
        try {
          const res = await api.post(
            `/store/carts/${cart.data.cart.id}/promotions`,
            { promo_codes: ["NOT-A-REAL-CODE"] },
            { ...fx.storeHeaders, throwOnError: false }
          )
          expect(res.status).toBeGreaterThanOrEqual(400)
        } catch (e: unknown) {
          const status = (e as { response?: { status?: number } })?.response
            ?.status
          expect(status).toBeGreaterThanOrEqual(400)
        }
      })
    })
  },
})
