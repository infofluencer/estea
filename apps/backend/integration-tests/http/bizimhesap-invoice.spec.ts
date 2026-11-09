import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import {
  createPromotionsWorkflow,
  getOrderDetailWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { STORE_ORDER_RETRIEVE_FIELDS } from "../../src/api/store/orders/_shared"
import { issueSalesInvoiceForOrder } from "../../src/lib/bizimhesap-invoice"
import {
  createPricedProducts,
  seedStorefrontFixture,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"
import { placeGuestStubOrder } from "./helpers/place-order"

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
    BIZIMHESAP_FIRM_ID: "",
  },
  testSuite: ({ api, getContainer }) => {
    describe("BizimHesap faturası (%1 KDV dahil gerçek sipariş, mock gönderim)", () => {
      let fx: StorefrontFixture

      // Runner her testten önce DB'yi bu kancaların sonundaki anlık görüntüye döndürür;
      // kurgu iç describe'da yapılırsa silinir, vergi uygulanmadan test geçer.
      beforeAll(async () => {
        const container = getContainer()
        fx = await seedStorefrontFixture(container)
        const tax = container.resolve(Modules.TAX)
        const [taxRegion] = await tax.listTaxRegions({ country_code: "tr" })
        await tax.createTaxRates({
          tax_region_id: taxRegion.id,
          name: "KDV",
          code: "KDV",
          rate: 1,
          is_default: true,
        })
        await updateRegionsWorkflow(container).run({
          input: {
            selector: { id: fx.regionId },
            update: { is_tax_inclusive: true },
          },
        })
        // Ürün fiyatı para birimine bağlı; bölge tercihi ona uygulanmaz.
        const pricing = container.resolve(Modules.PRICING)
        const [tryPreference] = await pricing.listPricePreferences({
          attribute: "currency_code",
          value: "try",
        })
        if (tryPreference) {
          await pricing.updatePricePreferences(tryPreference.id, {
            is_tax_inclusive: true,
          })
        } else {
          await pricing.createPricePreferences({
            attribute: "currency_code",
            value: "try",
            is_tax_inclusive: true,
          })
        }
      })

      async function placeAndInvoice(
        unitPrice: number,
        opts: { quantity?: number; promoCode?: string } = {}
      ) {
        const container = getContainer()
        const [product] = await createPricedProducts(container, fx, 1, {
          unitPrice,
        })
        const order = await placeGuestStubOrder(
          api,
          fx,
          product.variants[0].id,
          `fatura-${Date.now()}@escay.test`,
          opts
        )
        const res = await issueSalesInvoiceForOrder(container, order.id)
        // KDV dahil toplam vergisiz de aynı çıkar; vergi gerçekten uygulanmış olmalı.
        // Müşterinin sipariş sayfasındaki sorgu; kalem alanları eksik sorguda total yanlış hesaplanır.
        const { result } = await getOrderDetailWorkflow(container).run({
          input: {
            fields: [...STORE_ORDER_RETRIEVE_FIELDS, "metadata"],
            order_id: order.id,
          },
        })
        const stored = result as unknown as {
          total: number
          tax_total: number
          metadata: Record<string, unknown> | null
          items: { tax_lines: { rate: number }[] }[]
        }
        expect(Number(stored.tax_total)).toBeGreaterThan(0)
        expect(Number(stored.items[0].tax_lines[0].rate)).toBe(1)
        return { order, res, stored }
      }

      it("tek adet: toplam tutar, kayıt yazılır, ikinci çağrı atlar", async () => {
        const { order, res, stored } = await placeAndInvoice(35)
        expect(res.meta.error).toBeUndefined()
        expect(res.meta).toMatchObject({ status: "created", mode: "mock" })
        expect(res.meta.total).toBeCloseTo(134.99, 2)
        expect(res.meta.total).toBeCloseTo(Number(stored.total), 2)
        expect(stored.metadata?.bizimhesap_invoice).toMatchObject({
          status: "created",
          items: [{ line_item_id: order.items[0].id, quantity: 1 }],
        })

        const again = await issueSalesInvoiceForOrder(getContainer(), order.id)
        expect(again.skipped).toBe(true)
      })

      it("çok adet + küsuratlı fiyat: toplam tutar", async () => {
        const { res, stored } = await placeAndInvoice(33.33, { quantity: 7 })
        expect(res.meta.error).toBeUndefined()
        expect(res.meta.status).toBe("created")
        expect(res.meta.total).toBeCloseTo(33.33 * 7 + 99.99, 2)
        expect(res.meta.total).toBeCloseTo(Number(stored.total), 2)
      })

      it("yüzde kupon: indirimli toplam tutar, yanlış alarm yok", async () => {
        await createPromotionsWorkflow(getContainer()).run({
          input: {
            promotionsData: [
              {
                code: "FATURA10",
                type: "standard",
                status: "active",
                application_method: {
                  type: "percentage",
                  target_type: "items",
                  allocation: "across",
                  value: 10,
                  currency_code: "try",
                },
              },
            ],
          },
        })
        const { res, stored } = await placeAndInvoice(100, {
          quantity: 3,
          promoCode: "FATURA10",
        })
        expect(res.meta.error).toBeUndefined()
        expect(res.meta.status).toBe("created")
        expect(res.meta.total).toBeCloseTo(270 + 99.99, 2)
        expect(res.meta.total).toBeCloseTo(Number(stored.total), 2)
      })
    })
  },
})
