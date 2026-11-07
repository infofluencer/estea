import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import {
  createPricedProducts,
  seedStorefrontFixture,
  trShippingAddress,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"
import { noThrow, registerVerifiedCustomer } from "./helpers/auth"

jest.setTimeout(180 * 1000)

const UNIT_PRICE = 500

/**
 * Mağaza kuralları: stok sınırı, fiyat/metadata kurcalama, kupon, istek
 * listesi, iletişim formu.
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
    let fx: StorefrontFixture
    let variantId: string
    let productId: string

    beforeAll(async () => {
      fx = await seedStorefrontFixture(getContainer())
      const products = await createPricedProducts(getContainer(), fx, 1, {
        unitPrice: UNIT_PRICE,
      })
      productId = products[0].id
      variantId = products[0].variants![0].id
    })

    async function newCart(body: Record<string, unknown> = {}) {
      const res = await api.post(
        `/store/carts`,
        {
          region_id: fx.regionId,
          sales_channel_id: fx.salesChannelId,
          email: `rules-${Date.now()}@escay.test`,
          ...body,
        },
        fx.storeHeaders
      )
      return res.data.cart as { id: string; metadata?: Record<string, unknown> | null }
    }

    describe("Sepet kuralları", () => {
      it("stoktan fazla adet sepete eklenemez (stok 100)", async () => {
        const cart = await newCart()
        const res = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 101 },
          { ...fx.storeHeaders, ...noThrow }
        )
        expect(res.status).toBeGreaterThanOrEqual(400)
        expect(res.status).toBeLessThan(500)
      })

      it("sıfır / negatif adet reddedilir", async () => {
        const cart = await newCart()
        for (const quantity of [0, -1]) {
          const res = await api.post(
            `/store/carts/${cart.id}/line-items`,
            { variant_id: variantId, quantity },
            { ...fx.storeHeaders, ...noThrow }
          )
          expect({ quantity, ok: res.status < 400 }).toEqual({ quantity, ok: false })
        }
      })

      it("istemci birim fiyatı belirleyemez", async () => {
        const cart = await newCart()
        const res = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 1, unit_price: 1 },
          { ...fx.storeHeaders, ...noThrow }
        )
        if (res.status < 400) {
          expect(Number(res.data.cart.items[0].unit_price)).toEqual(UNIT_PRICE)
        } else {
          expect(res.status).toEqual(400)
        }
      })

      it("sunucuya ait metadata anahtarları istekten silinir", async () => {
        const cart = await newCart({
          metadata: { source: "sahte-kampanya", order_note: "Kapıya bırakın" },
        })
        expect(cart.metadata?.source).toBeUndefined()
        expect(cart.metadata?.order_note).toEqual("Kapıya bırakın")

        const updated = await api.post(
          `/store/carts/${cart.id}`,
          { metadata: { source: "yine-sahte", payment_method: "card" } },
          fx.storeHeaders
        )
        expect(updated.data.cart.metadata?.source).toBeUndefined()
        expect(updated.data.cart.metadata?.payment_method).toEqual("card")

        const item = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 1, metadata: { weight_kg: 0.001, gift: true } },
          fx.storeHeaders
        )
        const meta = item.data.cart.items[0].metadata || {}
        expect(meta.weight_kg).toBeUndefined()
        expect(meta.gift).toEqual(true)
      })

      it("yüzde kupon ürün toplamını düşürür, kargoya dokunmaz", async () => {
        await createPromotionsWorkflow(getContainer()).run({
          input: {
            promotionsData: [
              {
                code: "CAY10",
                type: "standard",
                status: "active",
                is_automatic: false,
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
        const cart = await newCart()
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: variantId, quantity: 2 }, fx.storeHeaders)
        const addr = trShippingAddress()
        await api.post(`/store/carts/${cart.id}`, { shipping_address: addr }, fx.storeHeaders)
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: fx.shippingOptionId }, fx.storeHeaders)

        const before = (await api.get(`/store/carts/${cart.id}`, fx.storeHeaders)).data.cart
        const applied = await api.post(
          `/store/carts/${cart.id}/promotions`,
          { promo_codes: ["CAY10"] },
          fx.storeHeaders
        )
        const after = applied.data.cart

        expect(Number(after.discount_total)).toBeCloseTo(100, 2)
        expect(Number(after.total)).toBeCloseTo(Number(before.total) - 100, 2)
        expect(Number(after.shipping_total)).toEqual(Number(before.shipping_total))

        const removed = await api.delete(`/store/carts/${cart.id}/promotions`, {
          ...fx.storeHeaders,
          data: { promo_codes: ["CAY10"] },
        })
        expect(Number(removed.data.cart.total)).toBeCloseTo(Number(before.total), 2)
      })
    })

    describe("İstek listesi", () => {
      const product = () => ({
        product_id: productId,
        handle: "test-cay",
        title: "Test Çay",
        price: UNIT_PRICE,
      })

      it("ekle (iki kez → tek kayıt) → listele → sil", async () => {
        const c = await registerVerifiedCustomer(api, getContainer(), fx, `wl-${Date.now()}@escay.test`)
        await api.post(`/store/customers/me/wishlist`, product(), c.headers)
        await api.post(`/store/customers/me/wishlist`, product(), c.headers)

        const list = await api.get(`/store/customers/me/wishlist`, c.headers)
        expect(list.data.items).toHaveLength(1)
        expect(list.data.items[0]).toMatchObject({ product_id: productId, title: "Test Çay" })

        await api.delete(`/store/customers/me/wishlist/${productId}`, c.headers)
        expect((await api.get(`/store/customers/me/wishlist`, c.headers)).data.items).toHaveLength(0)
      })

      it("misafir favorileri senkronda birleşir; başka müşteri görmez", async () => {
        const a = await registerVerifiedCustomer(api, getContainer(), fx, `wl-a-${Date.now()}@escay.test`)
        const b = await registerVerifiedCustomer(api, getContainer(), fx, `wl-b-${Date.now()}@escay.test`)
        await api.post(`/store/customers/me/wishlist`, product(), a.headers)
        await api.post(
          `/store/customers/me/wishlist/sync`,
          { items: [product(), { ...product(), product_id: "prod_misafir", handle: "misafir", title: "Misafir" }] },
          a.headers
        )
        const listA = await api.get(`/store/customers/me/wishlist`, a.headers)
        expect((listA.data.items as { product_id: string }[]).map((i) => i.product_id).sort()).toEqual(
          [productId, "prod_misafir"].sort()
        )
        const listB = await api.get(`/store/customers/me/wishlist`, b.headers)
        expect(listB.data.items).toHaveLength(0)
      })
    })

    describe("İletişim formu", () => {
      // Her çağrı ayrı IP → hız sınırı kovaları testler arasında karışmaz
      let nextIp = 0
      const ip = () => ({
        headers: {
          ...fx.storeHeaders.headers,
          "x-forwarded-for": `198.51.100.${++nextIp}`,
        },
        ...noThrow,
      })
      const valid = {
        name: "Ayşe Yılmaz",
        email: "ayse@example.com",
        subject: "Toptan sipariş",
        message: "Merhaba, 50 kg siyah çay için fiyat alabilir miyim?",
      }

      async function contactMails() {
        const notifications = getContainer().resolve(Modules.NOTIFICATION)
        return notifications.listNotifications({ template: "contact-form" })
      }

      // HTML kaçışı: src/api/store/contact/__tests__ (notification modülü content'i saklamaz)
      it("geçerli mesaj → 200 + gelen kutusuna tek mail", async () => {
        const before = (await contactMails()).length
        const res = await api.post(`/store/contact`, valid, ip())
        expect(res.status).toEqual(200)
        const mails = await contactMails()
        expect(mails.length).toEqual(before + 1)
        expect(mails.at(-1)?.to).toEqual(process.env.CONTACT_INBOX || "info@esteacay.com")
      })

      it("eksik / bozuk alan → 400", async () => {
        for (const body of [
          { ...valid, email: "eposta-degil" },
          { ...valid, message: "kısa" },
          { ...valid, name: "" },
        ]) {
          const res = await api.post(`/store/contact`, body, ip())
          expect(res.status).toEqual(400)
        }
      })

      it("bal tuzağı (company) dolu → 200 ama mail gitmez", async () => {
        const before = (await contactMails()).length
        const res = await api.post(`/store/contact`, { ...valid, company: "Bot A.Ş." }, ip())
        expect(res.status).toEqual(200)
        expect((await contactMails()).length).toEqual(before)
      })

      it("aynı IP'den 12'den fazla istek → 429", async () => {
        const sameIp = ip()
        const statuses: number[] = []
        for (let i = 0; i < 14; i++) {
          statuses.push((await api.post(`/store/contact`, { ...valid, email: "eposta-degil" }, sameIp)).status)
        }
        expect(statuses).toContain(429)
        expect(statuses.slice(0, 12).every((s) => s === 400)).toBe(true)
      })
    })
  },
})
