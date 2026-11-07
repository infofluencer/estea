import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { reconcilePaytrCheckouts } from "../../src/lib/paytr-checkout"
import { computeCallbackHash } from "../../src/modules/paytr/hash"
import { PAYTR_CHECKOUT_MODULE } from "../../src/modules/paytr-checkout"
import { OPS_EVENT_MODULE } from "../../src/modules/ops-event"
import type { PaytrStatusResult } from "../../src/lib/paytr-status"
import {
  PAYTR_PROVIDER_ID,
  createPricedProducts,
  seedStorefrontFixture,
  trShippingAddress,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"

jest.setTimeout(180 * 1000)

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
    describe("PayTR: sipariş ödeme başarılı olunca oluşur", () => {
      let fx: StorefrontFixture
      let variantId: string
      let otherVariantId: string
      let inventoryItemId: string

      beforeAll(async () => {
        const container = getContainer()
        fx = await seedStorefrontFixture(container)
        const products = await createPricedProducts(container, fx, 2)
        variantId = products[0].variants![0].id
        otherVariantId = products[1].variants![0].id
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product_variant_inventory_item",
          fields: ["inventory_item_id"],
          filters: { variant_id: variantId },
        })
        inventoryItemId = (data[0] as { inventory_item_id: string }).inventory_item_id
      })

      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const checkouts = () => getContainer().resolve(PAYTR_CHECKOUT_MODULE) as any

      async function openCart(email: string, variant = variantId, quantity = 1) {
        const created = await api.post(
          `/store/carts`,
          { region_id: fx.regionId, sales_channel_id: fx.salesChannelId, email },
          fx.storeHeaders
        )
        const cartId = created.data.cart.id as string
        await api.post(`/store/carts/${cartId}/line-items`, { variant_id: variant, quantity }, fx.storeHeaders)
        const addr = trShippingAddress()
        await api.post(`/store/carts/${cartId}`, { email, shipping_address: addr, billing_address: addr }, fx.storeHeaders)
        await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: fx.shippingOptionId }, fx.storeHeaders)
        return cartId
      }

      /** Mağazanın yaptığı gibi: oturum aç + iframe'den önce kaydı yaz. */
      async function openIframe(cartId: string) {
        const cart = await api.get(`/store/carts/${cartId}?fields=*payment_collection,total`, fx.storeHeaders)
        let pcId = cart.data.cart.payment_collection?.id
        if (!pcId) {
          const pc = await api.post(`/store/payment-collections`, { cart_id: cartId }, fx.storeHeaders)
          pcId = pc.data.payment_collection.id
        }
        await api.post(
          `/store/payment-collections/${pcId}/payment-sessions`,
          { provider_id: PAYTR_PROVIDER_ID, data: {} },
          fx.storeHeaders
        )
        const reg = await api.post(`/store/paytr-checkout/register`, { cart_id: cartId }, fx.storeHeaders)
        const oid = reg.data.merchant_oid as string
        const [row] = await checkouts().listPaytrCheckouts({ merchant_oid: oid })
        return { oid, kurus: row.amount_kurus as number }
      }

      async function callback(
        oid: string,
        status: "success" | "failed",
        kurus: number,
        extra: Record<string, string> = {}
      ) {
        const total = String(kurus)
        const hash = computeCallbackHash({
          merchantOid: oid,
          merchantSalt: "",
          status,
          totalAmount: total,
          merchantKey: "",
        })
        const res = await api.post(
          `/paytr/callback`,
          new URLSearchParams({
            merchant_oid: oid,
            status,
            total_amount: total,
            payment_amount: total,
            hash,
            failed_reason_code: status === "failed" ? "6" : "",
            failed_reason_msg: status === "failed" ? "3D tamamlanmadı" : "",
            ...extra,
          }).toString(),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        )
        expect(res.data).toBe("OK")
      }

      async function row(oid: string) {
        const [r] = await checkouts().listPaytrCheckouts({ merchant_oid: oid })
        return r
      }

      async function ordersForCart(cartId: string) {
        const { data } = await query().graph({
          entity: "order_cart",
          fields: ["order_id"],
          filters: { cart_id: cartId },
        })
        return (data as { order_id: string }[]).map((d) => d.order_id)
      }

      async function isCaptured(orderId: string) {
        const { data } = await query().graph({
          entity: "order",
          fields: ["id", "payment_collections.payments.captured_at"],
          filters: { id: orderId },
        })
        const payments = (data[0] as any).payment_collections.flatMap((p: any) => p.payments || [])
        return payments.length > 0 && payments.every((p: any) => Boolean(p.captured_at))
      }

      async function alerts() {
        const ops = getContainer().resolve(OPS_EVENT_MODULE) as any
        const rows = await ops.listOpsEvents({ kind: "payment.alert" }, { take: 50 })
        return rows.map((r: any) => r.title as string)
      }

      const paidStatus = (kurus: number, returned = 0): PaytrStatusResult => ({
        ok: true,
        merchant_oid: "x",
        payment_amount: kurus / 100,
        payment_total: kurus / 100,
        payment_date: null,
        currency: "TL",
        payment_type: "card",
        returns: [],
        returned_total: returned,
      })
      const unpaidStatus: PaytrStatusResult = { ok: false, merchant_oid: "x", message: "004" }

      it("iframe açılınca sipariş yok; success gelince sipariş + tahsilat; tekrar bildirim ikinci sipariş açmaz", async () => {
        const cartId = await openCart(`ok-${Date.now()}@escay.test`)
        const { oid, kurus } = await openIframe(cartId)
        expect(await ordersForCart(cartId)).toHaveLength(0)
        expect((await row(oid)).status).toBe("pending")

        await callback(oid, "success", kurus)
        const orders = await ordersForCart(cartId)
        expect(orders).toHaveLength(1)
        expect(await isCaptured(orders[0])).toBe(true)
        const r = await row(oid)
        expect(r.status).toBe("completed")
        expect(r.order_id).toBe(orders[0])

        await callback(oid, "success", kurus)
        expect(await ordersForCart(cartId)).toHaveLength(1)
      })

      it("durum ucu: sipariş yalnız numara + sepet eşleşince döner", async () => {
        const cartId = await openCart(`st-${Date.now()}@escay.test`)
        const { oid, kurus } = await openIframe(cartId)
        const url = (o: string, c: string) => `/store/paytr-checkout/status?oid=${o}&cart_id=${c}`
        expect((await api.get(url(oid, cartId), fx.storeHeaders)).data.state).toBe("processing")
        await callback(oid, "success", kurus)
        const done = (await api.get(url(oid, cartId), fx.storeHeaders)).data
        expect(done.state).toBe("completed")
        expect(done.order_id).toBeTruthy()
        const wrong = (await api.get(url(oid, "cart_baska"), fx.storeHeaders)).data
        expect(wrong).toEqual({ state: "unknown" })
      })

      it("failed sonra aynı numarayla success: sipariş tek, deneme sayılır", async () => {
        const cartId = await openCart(`retry-${Date.now()}@escay.test`)
        const { oid, kurus } = await openIframe(cartId)
        await callback(oid, "failed", kurus)
        expect(await ordersForCart(cartId)).toHaveLength(0)
        expect((await row(oid)).failed_attempts).toBe(1)
        await callback(oid, "success", kurus)
        expect(await ordersForCart(cartId)).toHaveLength(1)
      })

      it("tekrar deneme: başarısız ödemeden sonra aynı sepetle yeni ekran, tek sipariş", async () => {
        const cartId = await openCart(`again-${Date.now()}@escay.test`)
        const first = await openIframe(cartId)
        await callback(first.oid, "failed", first.kurus)
        const second = await openIframe(cartId)
        expect(second.oid).not.toBe(first.oid)
        await callback(second.oid, "success", second.kurus)
        expect(await ordersForCart(cartId)).toHaveLength(1)
      })

      it("eski ekrandan ödeme (oturum silinmiş, sepet aynı): parayı alan numarayla sipariş açılır", async () => {
        const cartId = await openCart(`old-${Date.now()}@escay.test`)
        const first = await openIframe(cartId)
        await openIframe(cartId)
        await callback(first.oid, "success", first.kurus)
        const orders = await ordersForCart(cartId)
        expect(orders).toHaveLength(1)
        expect(await isCaptured(orders[0])).toBe(true)
        expect((await row(first.oid)).status).toBe("completed")
      })

      it("iki ekrandan da ödenirse: tek sipariş + çift ödeme uyarısı", async () => {
        const cartId = await openCart(`dup-${Date.now()}@escay.test`)
        const first = await openIframe(cartId)
        const second = await openIframe(cartId)
        await callback(second.oid, "success", second.kurus)
        await callback(first.oid, "success", first.kurus)
        expect(await ordersForCart(cartId)).toHaveLength(1)
        const r = await row(first.oid)
        expect(r.status).toBe("review")
        expect(r.review_kind).toBe("duplicate_payment")
        expect(await alerts()).toContain("PayTR kritik durum: duplicate_payment")
      })

      it("ödeme sırasında sepet değişirse: sipariş açılmaz, para kayıtta, uyarı gider", async () => {
        const cartId = await openCart(`chg-${Date.now()}@escay.test`)
        const { oid, kurus } = await openIframe(cartId)
        await api.post(`/store/carts/${cartId}/line-items`, { variant_id: otherVariantId, quantity: 1 }, fx.storeHeaders)
        await callback(oid, "success", kurus)
        expect(await ordersForCart(cartId)).toHaveLength(0)
        const r = await row(oid)
        expect(r.status).toBe("review")
        expect(r.review_kind).toBe("cart_changed")
        expect(r.paid_kurus).toBe(kurus)
        expect(await alerts()).toContain("PayTR kritik durum: cart_changed")
        // Sonuç sayfası "birkaç dakikaya e-posta gelir" demez; elle inceleme olduğunu söyler.
        const st = await api.get(`/store/paytr-checkout/status?oid=${oid}&cart_id=${cartId}`, fx.storeHeaders)
        expect(st.data).toEqual({ state: "attention" })
      })

      it("para birimi TL değilse sipariş açılmaz, elle inceleme", async () => {
        const cartId = await openCart(`cur-${Date.now()}@escay.test`)
        const { oid, kurus } = await openIframe(cartId)
        await callback(oid, "success", kurus, { currency: "USD" })
        expect(await ordersForCart(cartId)).toHaveLength(0)
        const r = await row(oid)
        expect(r.status).toBe("review")
        expect(r.review_kind).toBe("currency_mismatch")
        // "TL" normal akış
        const cart2 = await openCart(`cur2-${Date.now()}@escay.test`)
        const second = await openIframe(cart2)
        await callback(second.oid, "success", second.kurus, { currency: "TL" })
        expect(await ordersForCart(cart2)).toHaveLength(1)
      })

      it("kayıt, gösterilecek iframe token'ının oturumuna yazılır; oturum değişmişse 409", async () => {
        const cartId = await openCart(`tok-${Date.now()}@escay.test`)
        await openIframe(cartId)
        const stale = await api.post(
          `/store/paytr-checkout/register`,
          { cart_id: cartId, iframe_token: "eski-ekranin-tokeni" },
          { ...fx.storeHeaders, validateStatus: () => true }
        )
        expect(stale.status).toBe(409)
        expect(stale.data.code).toBe("stale_token")
      })

      it("stok biterse: para kayıtta, otomatik iade yok, uyarı bir kez; stok gelince iş siparişi açar", async () => {
        const cartId = await openCart(`stock-${Date.now()}@escay.test`)
        const { oid, kurus } = await openIframe(cartId)
        const inventory = getContainer().resolve(Modules.INVENTORY) as any
        await inventory.updateInventoryLevels([
          { inventory_item_id: inventoryItemId, location_id: fx.stockLocationId, stocked_quantity: 0 },
        ])

        await callback(oid, "success", kurus)
        expect(await ordersForCart(cartId)).toHaveLength(0)
        const r = await row(oid)
        expect(r.status).toBe("paid")
        expect(r.last_error).toBeTruthy()
        expect((await alerts()).filter((t: string) => t.includes("order_create_failed"))).toHaveLength(1)

        // Hâlâ stok yok: uyarı tekrar etmez
        await reconcilePaytrCheckouts(getContainer(), { query: async () => paidStatus(kurus) })
        expect((await alerts()).filter((t: string) => t.includes("order_create_failed"))).toHaveLength(1)

        await inventory.updateInventoryLevels([
          { inventory_item_id: inventoryItemId, location_id: fx.stockLocationId, stocked_quantity: 100 },
        ])
        await reconcilePaytrCheckouts(getContainer(), { query: async () => paidStatus(kurus) })
        const orders = await ordersForCart(cartId)
        expect(orders).toHaveLength(1)
        expect(await isCaptured(orders[0])).toBe(true)
        expect((await row(oid)).status).toBe("completed")
      })

      it("sipariş oluşamadan PayTR panelinden iade edilirse: deneme kapanır, sipariş açılmaz", async () => {
        const cartId = await openCart(`ref-${Date.now()}@escay.test`)
        const { oid, kurus } = await openIframe(cartId)
        const inventory = getContainer().resolve(Modules.INVENTORY) as any
        await inventory.updateInventoryLevels([
          { inventory_item_id: inventoryItemId, location_id: fx.stockLocationId, stocked_quantity: 0 },
        ])
        await callback(oid, "success", kurus)
        await inventory.updateInventoryLevels([
          { inventory_item_id: inventoryItemId, location_id: fx.stockLocationId, stocked_quantity: 100 },
        ])
        await reconcilePaytrCheckouts(getContainer(), { query: async () => paidStatus(kurus, kurus / 100) })
        expect((await row(oid)).status).toBe("refunded")
        expect(await ordersForCart(cartId)).toHaveLength(0)
      })

      it("bildirim hiç gelmezse: iş PayTR'ye sorup siparişi açar; ödenmemişe dokunmaz", async () => {
        const paidCart = await openCart(`poll-${Date.now()}@escay.test`)
        const paid = await openIframe(paidCart)
        const unpaidCart = await openCart(`nopay-${Date.now()}@escay.test`)
        const unpaid = await openIframe(unpaidCart)
        const later = new Date(Date.now() + 10 * 60 * 1000)

        await reconcilePaytrCheckouts(getContainer(), {
          now: later,
          query: async (o) => (o === paid.oid ? paidStatus(paid.kurus) : unpaidStatus),
        })

        const orders = await ordersForCart(paidCart)
        expect(orders).toHaveLength(1)
        expect(await isCaptured(orders[0])).toBe(true)
        expect((await row(paid.oid)).paid_source).toBe("status_query")
        expect(await ordersForCart(unpaidCart)).toHaveLength(0)
        expect((await row(unpaid.oid)).status).toBe("pending")

        // Sorguyla yakalandıktan sonra gelen geç bildirim ikinci sipariş açmaz
        await callback(paid.oid, "success", paid.kurus)
        expect(await ordersForCart(paidCart)).toHaveLength(1)
      })

      it("sorgu süresi dolduktan sonra gelen geç bildirim yine sipariş açar", async () => {
        const cartId = await openCart(`late-${Date.now()}@escay.test`)
        const { oid, kurus } = await openIframe(cartId)
        await reconcilePaytrCheckouts(getContainer(), {
          now: new Date(Date.now() + 49 * 60 * 60 * 1000),
          query: async () => unpaidStatus,
        })
        expect((await row(oid)).status).toBe("expired")

        await callback(oid, "success", kurus)
        const orders = await ordersForCart(cartId)
        expect(orders).toHaveLength(1)
        expect(await isCaptured(orders[0])).toBe(true)
      })

      it("tutar tutmazsa sipariş açılmaz", async () => {
        const cartId = await openCart(`amt-${Date.now()}@escay.test`)
        const { oid, kurus } = await openIframe(cartId)
        await callback(oid, "success", kurus - 500)
        expect(await ordersForCart(cartId)).toHaveLength(0)
        expect((await row(oid)).review_kind).toBe("amount_mismatch")
      })
    })
  },
})
