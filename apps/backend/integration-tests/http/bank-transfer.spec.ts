import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import {
  createPricedProducts,
  PAYTR_PROVIDER_ID,
  seedStorefrontFixture,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"
import { placeGuestStubOrder } from "./helpers/place-order"
import { createAdminHeaders, noThrow, type AuthHeaders } from "./helpers/auth"

jest.setTimeout(180 * 1000)

const HAVALE = "pp_havale_havale"

/**
 * Havale / EFT: checkout'ta seçenek → ödeme bekleyen sipariş (stok ayrılır,
 * müşteriye IBAN döner) → admin "Havale alındı" → capture (idempotent).
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
    BANK_TRANSFER_ENABLED: "1",
    BANK_TRANSFER_BANK_NAME: "Test Bankası",
    BANK_TRANSFER_ACCOUNT_NAME: "Es Çay Test Ltd.",
    BANK_TRANSFER_IBAN: "tr330006100519786457841326",
    BIZIMHESAP_FIRM_ID: "",
  },
  testSuite: ({ api, getContainer }) => {
    // Havale kapalı (2026-11-07, K3): sağlayıcı medusa-config.ts'de yorumda. Açılınca skip'i kaldır.
    describe.skip("Havale / EFT", () => {
      let fx: StorefrontFixture
      let variantId: string
      let admin: AuthHeaders

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
        await updateRegionsWorkflow(getContainer()).run({
          input: {
            selector: { id: fx.regionId },
            update: { payment_providers: [PAYTR_PROVIDER_ID, HAVALE] },
          },
        })
        const products = await createPricedProducts(getContainer(), fx, 1, {
          unitPrice: 450,
        })
        variantId = products[0].variants![0].id
        admin = await createAdminHeaders(getContainer())
      })

      async function placeHavaleOrder(tag: string) {
        return placeGuestStubOrder(api, fx, variantId, `havale-${tag}-${Date.now()}@escay.test`, {
          providerId: HAVALE,
          cartMetadata: {
            payment_method: "bank_transfer",
            legal_accepted_at: new Date().toISOString(),
          },
        })
      }

      async function paymentStatus(orderId: string) {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: ["id", "metadata", "payment_collections.status"],
          filters: { id: orderId },
        })
        const row = data?.[0] as {
          metadata?: Record<string, unknown>
          payment_collections?: { status?: string }[]
        }
        return {
          method: row?.metadata?.payment_method,
          collection: row?.payment_collections?.[0]?.status,
        }
      }

      it("GET /store/bank-transfer: açık + IBAN dörtlü gruplu", async () => {
        const res = await api.get(`/store/bank-transfer`, fx.storeHeaders)
        expect(res.status).toEqual(200)
        expect(res.data).toEqual({
          enabled: true,
          bank_name: "Test Bankası",
          account_name: "Es Çay Test Ltd.",
          iban: "TR33 0006 1005 1978 6457 8413 26",
        })
      })

      it("havale siparişi: ödeme bekliyor, stok ayrıldı, admin durumu pending", async () => {
        const order = await placeHavaleOrder("pending")
        expect(order.display_id).toBeGreaterThan(0)

        const st = await paymentStatus(order.id)
        expect(st.method).toEqual("bank_transfer")
        expect(["completed", "authorized", "captured"]).not.toContain(st.collection)

        const inventory = getContainer().resolve(Modules.INVENTORY)
        const reservations = await inventory.listReservationItems({
          line_item_id: order.items[0].id,
        })
        expect(reservations.reduce((s, r) => s + Number(r.quantity), 0)).toEqual(1)

        const state = await api.get(`/admin/orders/${order.id}/bank-transfer`, admin)
        expect(state.status).toEqual(200)
        expect(state.data.is_bank_transfer).toEqual(true)
        expect(state.data.state).toEqual("pending")
        expect(state.data.amount).toBeGreaterThan(450)
      })

      it("misafir sipariş sorgusu ödeme bekleyen havalede IBAN gösterir", async () => {
        const order = await placeHavaleOrder("lookup")
        const res = await api.post(
          `/store/orders/lookup`,
          { id: order.id, email: order.email },
          fx.storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(JSON.stringify(res.data)).toContain("TR33 0006 1005 1978 6457 8413 26")
        // metadata (iç anahtarlar) müşteriye açılmaz
        expect(res.data.order.metadata ?? null).toBeNull()
      })

      it("admin onayı yetkisiz → 401", async () => {
        const order = await placeHavaleOrder("unauth")
        const res = await api.post(
          `/admin/orders/${order.id}/bank-transfer/confirm`,
          {},
          noThrow
        )
        expect(res.status).toEqual(401)
        expect((await paymentStatus(order.id)).collection).not.toEqual("completed")
      })

      it("admin 'Havale alındı': capture olur, ikinci tık no-op", async () => {
        const order = await placeHavaleOrder("confirm")

        const first = await api.post(
          `/admin/orders/${order.id}/bank-transfer/confirm`,
          {},
          admin
        )
        expect(first.status).toEqual(200)
        expect(first.data.state).toEqual("received")
        expect(first.data.received_at).toBeTruthy()

        const second = await api.post(
          `/admin/orders/${order.id}/bank-transfer/confirm`,
          {},
          admin
        )
        expect(second.status).toEqual(200)
        expect(second.data.state).toEqual("received")
        expect(second.data.received_at).toEqual(first.data.received_at)

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: ["payment_collections.payments.captures.id"],
          filters: { id: order.id },
        })
        const captures = (data?.[0] as {
          payment_collections?: { payments?: { captures?: unknown[] }[] }[]
        }).payment_collections?.flatMap((pc) => pc.payments || []).flatMap((p) => p.captures || [])
        expect(captures?.length).toEqual(1)
      })

      it("eşzamanlı iki onay → tek capture", async () => {
        const order = await placeHavaleOrder("race")
        const [a, b] = await Promise.all([
          api.post(`/admin/orders/${order.id}/bank-transfer/confirm`, {}, { ...admin, ...noThrow }),
          api.post(`/admin/orders/${order.id}/bank-transfer/confirm`, {}, { ...admin, ...noThrow }),
        ])
        expect([a.status, b.status]).toEqual([200, 200])

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: ["payment_collections.payments.captures.id"],
          filters: { id: order.id },
        })
        const captures = (data?.[0] as {
          payment_collections?: { payments?: { captures?: unknown[] }[] }[]
        }).payment_collections?.flatMap((pc) => pc.payments || []).flatMap((p) => p.captures || [])
        expect(captures?.length).toEqual(1)
      })

      it("iptal edilen havale siparişi onaylanamaz", async () => {
        const order = await placeHavaleOrder("cancel")
        await cancelOrderWorkflow(getContainer()).run({
          input: { order_id: order.id, no_notification: true },
        })
        const res = await api.post(
          `/admin/orders/${order.id}/bank-transfer/confirm`,
          {},
          { ...admin, ...noThrow }
        )
        expect(res.status).toBeGreaterThanOrEqual(400)
        expect(res.status).toBeLessThan(500)
        expect(res.data.message).toMatch(/İptal/)
      })

      it("kart siparişinde havale onayı reddedilir", async () => {
        const card = await placeGuestStubOrder(api, fx, variantId, `kart-${Date.now()}@escay.test`)
        const res = await api.post(
          `/admin/orders/${card.id}/bank-transfer/confirm`,
          {},
          { ...admin, ...noThrow }
        )
        expect(res.status).toBeGreaterThanOrEqual(400)
        expect(res.data.message).toMatch(/havale ile verilmemiş/)
      })
    })
  },
})
