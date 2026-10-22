import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  createPricedProducts,
  createTestCategory,
  seedStorefrontFixture,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"

jest.setTimeout(120 * 1000)

const EXPECTED_PRODUCT_COUNT = Number(
  process.env.INTEGRATION_PRODUCT_COUNT || "45"
)

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
    describe("Catalog (store API)", () => {
      let fx: StorefrontFixture

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
        const category = await createTestCategory(getContainer())
        await createPricedProducts(getContainer(), fx, EXPECTED_PRODUCT_COUNT, {
          categoryId: category.id,
          unitPrice: 1499,
        })
      })

      it(`lists ~${EXPECTED_PRODUCT_COUNT} published products`, async () => {
        const res = await api.get(
          `/store/products?limit=100&region_id=${fx.regionId}&country_code=tr`,
          fx.storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.count).toBeGreaterThanOrEqual(EXPECTED_PRODUCT_COUNT)
        expect(res.data.products.length).toBeGreaterThan(0)
      })

      it("lists product categories", async () => {
        const res = await api.get(
          `/store/product-categories?limit=50`,
          fx.storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.product_categories.length).toBeGreaterThan(0)
      })

      it("product detail has variants + calculated price (major-unit)", async () => {
        const list = await api.get(
          `/store/products?limit=1&region_id=${fx.regionId}&country_code=tr&fields=*variants,*variants.calculated_price`,
          fx.storeHeaders
        )
        const handle = list.data.products[0].handle
        const res = await api.get(
          `/store/products?handle=${handle}&region_id=${fx.regionId}&country_code=tr&fields=*variants,*variants.calculated_price,+variants.inventory_quantity`,
          fx.storeHeaders
        )
        expect(res.status).toEqual(200)
        const product = res.data.products[0]
        expect(product.variants?.length).toBeGreaterThan(0)
        const price =
          product.variants[0].calculated_price?.calculated_amount ??
          product.variants[0].calculated_price?.calculated_amount_with_tax
        expect(Number(price)).toBeGreaterThan(0)
        expect(Number(price)).toBeLessThan(1_000_000)
      })
    })
  },
})
