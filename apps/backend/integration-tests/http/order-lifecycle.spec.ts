import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import {
  createPricedProducts,
  seedStorefrontFixture,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"
import {
  placeGuestStubOrder,
  placePaidCardOrder,
  type PlacedStoreOrder,
} from "./helpers/place-order"
import { ensureTestReturnReason } from "./helpers/return-reason"
import {
  getPaytrIadeMockRequests,
  resetPaytrIadeMock,
} from "../../src/modules/paytr/mock-iade"
import { createAdminHeaders, noThrow, type AuthHeaders } from "./helpers/auth"

jest.setTimeout(240 * 1000)

const UNIT_PRICE = 640

// Kimlik bilgisi dolu + PAYTR_MOCK: oturum stub, /odeme/iade mock-iade katmanına gider.
// Runner `env`'i medusa-config yüklendikten sonra uygular; provider seçenekleri
// config'ten okunduğu için burada, dosya yüklenirken atanmalı.
process.env.PAYTR_MERCHANT_ID = "100001"
process.env.PAYTR_MERCHANT_KEY = "test-merchant-key"
process.env.PAYTR_MERCHANT_SALT = "test-merchant-salt"

/**
 * Admin panelinden sipariş yaşam döngüsü (gerçek HTTP uçları):
 * ödeme → hazırla → kargola → teslim → misafir iade → kabul (stok geri) →
 * geri ödeme (PayTR mock) → tekrar geri ödeme no-op. Ayrıca ret yolu.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {
    PAYTR_MOCK: "1",
    SHIPPING_CARRIER: "",
    COOKIE_SECURE: "false",
    BIZIMHESAP_FIRM_ID: "",
  },
  testSuite: ({ api, getContainer }) => {
    describe("Sipariş yaşam döngüsü (admin)", () => {
      let fx: StorefrontFixture
      let variantId: string
      let admin: AuthHeaders
      let reasonId: string

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
        const products = await createPricedProducts(getContainer(), fx, 1, {
          unitPrice: UNIT_PRICE,
        })
        variantId = products[0].variants![0].id
        admin = await createAdminHeaders(getContainer())
        reasonId = await ensureTestReturnReason(getContainer())
      })

      async function stock() {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product_variant_inventory_item",
          fields: ["inventory_item_id"],
          filters: { variant_id: variantId },
        })
        const inventory = getContainer().resolve(Modules.INVENTORY)
        const [level] = await inventory.listInventoryLevels({
          inventory_item_id: (data![0] as { inventory_item_id: string }).inventory_item_id,
          location_id: fx.stockLocationId,
        })
        return { stocked: Number(level.stocked_quantity), reserved: Number(level.reserved_quantity) }
      }

      async function status(orderId: string, action: string, extra: Record<string, unknown> = {}) {
        return api.post(
          `/admin/orders/${orderId}/escay-status`,
          { action, notify: false, ...extra },
          { ...admin, ...noThrow }
        )
      }

      async function deliveredOrder(tag: string): Promise<PlacedStoreOrder> {
        const order = await placePaidCardOrder(
          api,
          getContainer(),
          fx,
          variantId,
          `life-${tag}-${Date.now()}@escay.test`
        )
        for (const action of ["prepare", "ship", "deliver"]) {
          const res = await status(order.id, action, action === "ship" ? { tracking_number: "TRK123" } : {})
          expect({ action, status: res.status, body: res.status === 200 ? null : res.data }).toEqual({
            action,
            status: 200,
            body: null,
          })
        }
        return order
      }

      async function guestReturn(order: PlacedStoreOrder) {
        const res = await api.post(
          `/store/returns/guest`,
          {
            order_id: order.id,
            email: order.email,
            items: [{ id: order.items[0].id, quantity: 1 }],
            reason_id: reasonId,
          },
          fx.storeHeaders
        )
        expect(res.status).toEqual(200)
        return res.data.return.id as string
      }

      async function orderRow(orderId: string) {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: [
            "id",
            "fulfillments.shipped_at",
            "fulfillments.delivered_at",
            "fulfillments.labels.tracking_number",
            "payment_collections.payments.captures.amount",
            "payment_collections.payments.refunds.amount",
          ],
          filters: { id: orderId },
        })
        type Row = {
          fulfillments?: {
            shipped_at?: string | null
            delivered_at?: string | null
            labels?: { tracking_number?: string }[]
          }[]
          payment_collections?: {
            payments?: { captures?: { amount: unknown }[]; refunds?: { amount: unknown }[] }[]
          }[]
        }
        const row = data![0] as Row
        const payments = (row.payment_collections || []).flatMap((pc) => pc.payments || [])
        return {
          fulfillments: row.fulfillments || [],
          captured: payments.flatMap((p) => p.captures || []).reduce((s, c) => s + Number(c.amount), 0),
          refunded: payments.flatMap((p) => p.refunds || []).reduce((s, r) => s + Number(r.amount), 0),
        }
      }

      it("hazırla → kargola → teslim: fulfillment, takip no, stok düşer", async () => {
        const before = await stock()
        const order = await deliveredOrder("happy")

        const row = await orderRow(order.id)
        expect(row.captured).toBeGreaterThan(0)
        expect(row.fulfillments).toHaveLength(1)
        expect(row.fulfillments[0].shipped_at).toBeTruthy()
        expect(row.fulfillments[0].delivered_at).toBeTruthy()
        expect(row.fulfillments[0].labels?.map((l) => l.tracking_number)).toContain("TRK123")

        const after = await stock()
        expect(after.stocked).toEqual(before.stocked - 1)
        expect(after.reserved).toEqual(before.reserved)
      })

      it("iade → kabul → geri ödeme: ürün bedeli iade, stok geri, ikinci geri ödeme no-op", async () => {
        const order = await deliveredOrder("refund")
        const returnId = await guestReturn(order)
        const beforeAccept = await stock()

        const accept = await api.post(
          `/admin/returns/${returnId}/accept`,
          { items: [{ item_id: order.items[0].id, restock_quantity: 1 }] },
          { ...admin, ...noThrow }
        )
        expect({ status: accept.status, body: accept.data }).toMatchObject({
          status: 200,
          body: { ok: true },
        })
        expect((await stock()).stocked).toEqual(beforeAccept.stocked + 1)

        const refund = await api.post(`/admin/returns/${returnId}/refund`, {}, { ...admin, ...noThrow })
        expect(refund.status).toEqual(200)
        expect(refund.data.paytr_refund.status).toEqual("success")
        const iade = getPaytrIadeMockRequests().at(-1)
        expect(iade?.return_amount).toEqual("640.00")
        expect(iade?.merchant_id).toEqual("100001")

        const row = await orderRow(order.id)
        // "Vazgeçtim" iadesinde kargo müşteride kalır → yalnız ürün bedeli
        expect(row.refunded).toBeCloseTo(UNIT_PRICE, 2)
        expect(row.refunded).toBeLessThan(row.captured)

        const again = await api.post(`/admin/returns/${returnId}/refund`, {}, { ...admin, ...noThrow })
        expect(again.status).toEqual(200)
        expect(again.data.skipped).toEqual(true)
        expect((await orderRow(order.id)).refunded).toBeCloseTo(UNIT_PRICE, 2)
      })

      it("PayTR iadeyi reddederse: 502, gerçek hata mesajı admin'e ulaşır", async () => {
        const order = await deliveredOrder("refund-fail")
        const returnId = await guestReturn(order)
        resetPaytrIadeMock("fail")
        try {
          await api.post(
            `/admin/returns/${returnId}/accept`,
            { items: [{ item_id: order.items[0].id, restock_quantity: 1 }] },
            admin
          )
          const refund = await api.post(`/admin/returns/${returnId}/refund`, {}, { ...admin, ...noThrow })
          expect(refund.status).toEqual(502)
          expect(refund.data.paytr_refund.error).not.toMatch(/\[object Object\]/)
          expect(refund.data.paytr_refund.error).toMatch(/Mock PayTR iade hatasi/)
          expect((await orderRow(order.id)).refunded).toEqual(0)
        } finally {
          resetPaytrIadeMock("success")
        }
      })

      it("hasarlı kabul: stoğa girmez", async () => {
        const order = await deliveredOrder("damaged")
        const returnId = await guestReturn(order)
        const before = await stock()
        const accept = await api.post(
          `/admin/returns/${returnId}/accept`,
          { items: [{ item_id: order.items[0].id, restock_quantity: 0, damaged_quantity: 1 }] },
          { ...admin, ...noThrow }
        )
        expect(accept.status).toEqual(200)
        expect((await stock()).stocked).toEqual(before.stocked)
      })

      it("talepten fazla kabul reddedilir", async () => {
        const order = await deliveredOrder("over")
        const returnId = await guestReturn(order)
        const accept = await api.post(
          `/admin/returns/${returnId}/accept`,
          { items: [{ item_id: order.items[0].id, restock_quantity: 2 }] },
          { ...admin, ...noThrow }
        )
        expect(accept.status).toEqual(400)
        expect(accept.data.message).toMatch(/fazla olamaz/)
      })

      it("reddedilen iade için geri ödeme yapılmaz", async () => {
        const order = await deliveredOrder("reject")
        const returnId = await guestReturn(order)

        const reject = await api.post(
          `/admin/returns/${returnId}/reject`,
          { reason: "Ürün kullanılmış" },
          { ...admin, ...noThrow }
        )
        expect(reject.status).toEqual(200)

        const refund = await api.post(`/admin/returns/${returnId}/refund`, {}, { ...admin, ...noThrow })
        expect(refund.status).toEqual(200)
        expect(refund.data.skipped).toEqual(true)
        expect((await orderRow(order.id)).refunded).toEqual(0)
      })

      it("geçersiz aksiyon ve iptal sipariş ilerletilemez", async () => {
        const order = await placeGuestStubOrder(api, fx, variantId, `life-cancel-${Date.now()}@escay.test`)

        const bogus = await status(order.id, "teleport")
        expect(bogus.status).toEqual(400)

        await cancelOrderWorkflow(getContainer()).run({
          input: { order_id: order.id, no_notification: true },
        })
        const res = await status(order.id, "prepare")
        expect(res.status).toEqual(400)
        expect(res.data.message).toMatch(/İptal/)
      })
    })
  },
})
