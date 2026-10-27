import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createPricedProducts,
  seedStorefrontFixture,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"
import { placeGuestStubOrder } from "./helpers/place-order"
import { ensureTestReturnReason } from "./helpers/return-reason"
import {
  deliverOrderFulfillment,
  fulfillOrderItems,
  shipOrderFulfillment,
} from "./helpers/fulfill-order"
import { rejectStoreReturn } from "../../src/lib/return-rejection"

jest.setTimeout(120 * 1000)

function httpStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "response" in err) {
    return (err as { response?: { status?: number } }).response?.status
  }
  return undefined
}

async function firstOrderItemId(
  container: MedusaContainer,
  orderId: string,
  fallback?: string
): Promise<string> {
  if (fallback) return fallback
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "items.id"],
    filters: { id: orderId },
  })
  const id = (data?.[0] as { items?: { id?: string }[] } | undefined)?.items?.[0]
    ?.id
  if (!id) throw new Error(`No items on order ${orderId}`)
  return id
}

/**
 * Returns HTTP surface — guest security + happy path after fulfill.
 * Full lifecycle (refund/restock/reject) stays in:
 *   npm run test:returns
 *   npm run test:smoke:full
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
    describe("Returns (guest security)", () => {
      let fx: StorefrontFixture
      let variantId: string
      let reasonId: string

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
        const products = await createPricedProducts(getContainer(), fx, 1)
        variantId = products[0].variants![0].id
        reasonId = await ensureTestReturnReason(getContainer())
      })

      it("lists return reasons for store", async () => {
        const res = await api.get(`/store/return-reasons`, fx.storeHeaders)
        expect(res.status).toEqual(200)
        expect(Array.isArray(res.data.return_reasons)).toBeTruthy()
        expect(res.data.return_reasons.length).toBeGreaterThanOrEqual(1)
      })

      it("guest return with bogus order → 404 (no leak)", async () => {
        try {
          const res = await api.post(
            `/store/returns/guest`,
            {
              order_id: "order_does_not_exist",
              email: "anyone@escay.test",
              items: [{ id: "orli_fake", quantity: 1 }],
              reason_id: reasonId,
            },
            { ...fx.storeHeaders, throwOnError: false }
          )
          expect(res.status).toEqual(404)
        } catch (e: unknown) {
          expect(httpStatus(e)).toEqual(404)
        }
      })

      it("wrong email ≡ missing order (generic 404)", async () => {
        const email = `guest-ret-${Date.now()}@escay.test`
        const order = await placeGuestStubOrder(api, fx, variantId, email)
        const itemId = await firstOrderItemId(
          getContainer(),
          order.id,
          order.items[0]?.id
        )

        const wrong = await api
          .post(
            `/store/returns/guest`,
            {
              order_id: order.id,
              email: "wrong@example.invalid",
              items: [{ id: itemId, quantity: 1 }],
              reason_id: reasonId,
            },
            { ...fx.storeHeaders, throwOnError: false }
          )
          .catch((e: { response?: { status: number } }) => e.response)

        const missing = await api
          .post(
            `/store/returns/guest`,
            {
              order_id: "order_does_not_exist_zzz",
              email,
              items: [{ id: itemId, quantity: 1 }],
              reason_id: reasonId,
            },
            { ...fx.storeHeaders, throwOnError: false }
          )
          .catch((e: { response?: { status: number } }) => e.response)

        const wrongStatus =
          (wrong as { status?: number })?.status ??
          (wrong as { response?: { status: number } })?.response?.status
        const missingStatus =
          (missing as { status?: number })?.status ??
          (missing as { response?: { status: number } })?.response?.status
        expect(wrongStatus).toEqual(404)
        expect(missingStatus).toEqual(404)
      })

      it("unfulfilled guest order → 4xx (nothing returnable)", async () => {
        const email = `guest-ret-unful-${Date.now()}@escay.test`
        const order = await placeGuestStubOrder(api, fx, variantId, email)
        const itemId = await firstOrderItemId(
          getContainer(),
          order.id,
          order.items[0]?.id
        )

        try {
          const res = await api.post(
            `/store/returns/guest`,
            {
              order_id: order.id,
              email,
              items: [{ id: itemId, quantity: 1 }],
              reason_id: reasonId,
            },
            { ...fx.storeHeaders, throwOnError: false }
          )
          expect(res.status).toBeGreaterThanOrEqual(400)
          expect(res.status).toBeLessThan(500)
          expect(res.status).not.toEqual(404)
        } catch (e: unknown) {
          const status = httpStatus(e)
          expect(status).toBeGreaterThanOrEqual(400)
          expect(status).toBeLessThan(500)
          expect(status).not.toEqual(404)
        }
      })

      it("fulfilled but not shipped → 4xx (kargoya verilmeden iade yok)", async () => {
        const email = `guest-ret-noship-${Date.now()}@escay.test`
        const order = await placeGuestStubOrder(api, fx, variantId, email)
        const itemId = await firstOrderItemId(
          getContainer(),
          order.id,
          order.items[0]?.id
        )

        await fulfillOrderItems(getContainer(), {
          orderId: order.id,
          itemId,
          locationId: fx.stockLocationId,
          shippingOptionId: fx.shippingOptionId,
        })

        const res = await api
          .post(
            `/store/returns/guest`,
            {
              order_id: order.id,
              email,
              items: [{ id: itemId, quantity: 1 }],
              reason_id: reasonId,
            },
            { ...fx.storeHeaders, throwOnError: false }
          )
          .catch((e: { response?: { status: number } }) => e.response)
        const status =
          (res as { status?: number })?.status ??
          (res as { response?: { status: number } })?.response?.status
        expect(status).toBeGreaterThanOrEqual(400)
        expect(status).toBeLessThan(500)
      })

      it("delivered guest order → POST /store/returns/guest 200", async () => {
        const email = `guest-ret-ok-${Date.now()}@escay.test`
        const order = await placeGuestStubOrder(api, fx, variantId, email)
        const itemId = await firstOrderItemId(
          getContainer(),
          order.id,
          order.items[0]?.id
        )

        const fulfillment = await fulfillOrderItems(getContainer(), {
          orderId: order.id,
          itemId,
          locationId: fx.stockLocationId,
          shippingOptionId: fx.shippingOptionId,
        })
        await shipOrderFulfillment(getContainer(), {
          orderId: order.id,
          fulfillmentId: (fulfillment as { id: string }).id,
          itemId,
        })
        await deliverOrderFulfillment(getContainer(), {
          orderId: order.id,
          fulfillmentId: (fulfillment as { id: string }).id,
        })

        const res = await api.post(
          `/store/returns/guest`,
          {
            order_id: order.id,
            email,
            items: [{ id: itemId, quantity: 1 }],
            reason_id: reasonId,
            note: "integration guest return",
          },
          fx.storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.return?.id).toBeTruthy()
        expect(res.data.return?.order_id).toEqual(order.id)
      })

      async function shippedGuestOrder(tag: string, deliver = true) {
        const email = `guest-ret-${tag}-${Date.now()}@escay.test`
        const order = await placeGuestStubOrder(api, fx, variantId, email)
        const itemId = await firstOrderItemId(getContainer(), order.id, order.items[0]?.id)
        const fulfillment = await fulfillOrderItems(getContainer(), {
          orderId: order.id,
          itemId,
          locationId: fx.stockLocationId,
          shippingOptionId: fx.shippingOptionId,
        })
        await shipOrderFulfillment(getContainer(), {
          orderId: order.id,
          fulfillmentId: (fulfillment as { id: string }).id,
          itemId,
        })
        if (deliver) {
          await deliverOrderFulfillment(getContainer(), {
            orderId: order.id,
            fulfillmentId: (fulfillment as { id: string }).id,
          })
        }
        return { order, email, itemId }
      }

      function postGuestReturn(orderId: string, email: string, itemId: string) {
        return api
          .post(
            `/store/returns/guest`,
            { order_id: orderId, email, items: [{ id: itemId, quantity: 1 }], reason_id: reasonId },
            { ...fx.storeHeaders, throwOnError: false }
          )
          .catch((e: { response?: { status: number } }) => e.response)
      }

      const statusOf = (r: unknown) =>
        (r as { status?: number })?.status ?? (r as { response?: { status: number } })?.response?.status

      it("shipped but not delivered → 4xx (teslim edilmeden iade yok)", async () => {
        const { order, email, itemId } = await shippedGuestOrder("transit", false)
        const res = await postGuestReturn(order.id, email, itemId)
        expect(statusOf(res)).toBeGreaterThanOrEqual(400)
        expect(statusOf(res)).toBeLessThan(500)
      })

      it("rejected return → same item cannot be requested again", async () => {
        const { order, email, itemId } = await shippedGuestOrder("rej")
        const first = await postGuestReturn(order.id, email, itemId)
        expect(statusOf(first)).toEqual(200)
        const returnId = (first as { data: { return: { id: string } } }).data.return.id

        await rejectStoreReturn(getContainer(), { return_id: returnId, reason: "test" })

        const again = await postGuestReturn(order.id, email, itemId)
        expect(statusOf(again)).toBeGreaterThanOrEqual(400)
        expect(statusOf(again)).toBeLessThan(500)
      })

      it("double submit at once → only one return created", async () => {
        const { order, email, itemId } = await shippedGuestOrder("dbl")
        const [a, b] = await Promise.all([
          postGuestReturn(order.id, email, itemId),
          postGuestReturn(order.id, email, itemId),
        ])
        const statuses = [statusOf(a), statusOf(b)].sort()
        expect(statuses[0]).toEqual(200)
        expect(statuses[1]).toBeGreaterThanOrEqual(400)

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "return",
          fields: ["id", "status"],
          filters: { order_id: order.id },
        })
        expect(data.filter((r: { status?: string }) => r.status !== "canceled").length).toEqual(1)
      })
    })
  },
})
