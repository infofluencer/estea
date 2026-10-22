/**
 * Kurye paketi aldıktan sonraki zincir:
 * kargo webhook'u (adaptör parseWebhook) → "shipped"/"delivered" aksiyonu →
 * Medusa kargo/teslim workflow'u + admin Logs olayı → shipment.created /
 * delivery.created → müşteriye kargo maili (takip linkiyle, bir kez).
 */

const shipmentRun = jest.fn()
const deliveredRun = jest.fn()
jest.mock("@medusajs/medusa/core-flows", () => ({
  createOrderShipmentWorkflow: () => ({ run: shipmentRun }),
  markOrderFulfillmentAsDeliveredWorkflow: () => ({ run: deliveredRun }),
}))

const recordOpsEvent = jest.fn()
jest.mock("../ops-events", () => ({
  ...jest.requireActual("../ops-events"),
  recordOpsEvent: (...args: unknown[]) => recordOpsEvent(...args),
}))

import { ContainerRegistrationKeys, FulfillmentWorkflowEvents, Modules } from "@medusajs/framework/utils"

import { POST as webhook } from "../../api/carrier/webhook/route"
import orderShippingStatusEmailHandler from "../../subscribers/order-shipping-status-email"
import { registerCarrierAdapter, resetCarrierAdapters } from "../../modules/carrier/registry"
import type { CarrierAdapter, FulfillmentAction } from "../../modules/carrier/types"
import { applyCarrierAction } from "../carrier-actions"

const SHIPMENT_REF = "63375938-563b-4f4e-bc09-eef037ccdc37"
const FULFILLMENT_ID = "ful_1"
const ORDER_ID = "order_1"
const TRACKING = "143449310574"

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

type State = { shipped_at: string | null; delivered_at: string | null; data: Record<string, unknown> }

/** Sahte taşıyıcı: durum kodu → aksiyon; sır x-carrier-secret başlığında. */
const STATUS_ACTION: Record<string, FulfillmentAction> = {
  LABEL_PRINTED: "none",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  FAILED: "failed",
}
const fakeAdapter: CarrierAdapter = {
  code: "fake",
  name: "Fake Kargo",
  owns: (d) => d?.carrier === "fake",
  createShipment: async () => ({ data: {}, labels: [] }),
  cancelShipment: async () => ({}),
  trackingUrl: (n) => `https://fake.test/track/${n}`,
  parseWebhook: (req) => {
    if (req.headers["x-carrier-secret"] !== process.env.CARRIER_WEBHOOK_SECRET) return null
    const body = req.body as { ref: string; status: string; tracking?: string; orderRef?: string }
    return {
      shipmentRef: body.ref,
      orderReference: body.orderRef ?? null,
      action: STATUS_ACTION[body.status] ?? "none",
      patch: { status_code: body.status, tracking_number: body.tracking, tracking_url: body.tracking ? `https://fake.test/track/${body.tracking}` : undefined },
      summary: body.status,
    }
  },
}

function makeContainer(state: State) {
  const notifications = { createNotifications: jest.fn() }
  const fulfillmentModule = {
    retrieveFulfillment: jest.fn(async () => ({ id: FULFILLMENT_ID, data: state.data })),
    updateFulfillment: jest.fn(async (_id: string, update: { data: Record<string, unknown> }) => {
      state.data = update.data
    }),
  }
  const query = {
    graph: jest.fn(async ({ entity }: { entity: string }) => {
      if (entity === "order_fulfillment") return { data: [{ order_id: ORDER_ID, fulfillment_id: FULFILLMENT_ID }] }
      if (entity === "fulfillment") {
        return {
          data: [
            {
              id: FULFILLMENT_ID,
              shipped_at: state.shipped_at,
              delivered_at: state.delivered_at,
              items: [
                { line_item_id: "li_1", quantity: 1 },
                { line_item_id: "li_2", quantity: 2 },
              ],
              labels: [],
              data: state.data,
            },
          ],
        }
      }
      if (entity === "order") {
        return {
          data: [
            {
              id: ORDER_ID,
              email: "musteri@example.com",
              display_id: 55,
              fulfillments: [{ id: FULFILLMENT_ID, labels: [], data: state.data }],
            },
          ],
        }
      }
      return { data: [] }
    }),
  }
  const container = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER || key === "logger") return logger
      if (key === ContainerRegistrationKeys.QUERY) return query
      if (key === Modules.FULFILLMENT) return fulfillmentModule
      if (key === Modules.NOTIFICATION) return notifications
      throw new Error(`beklenmeyen resolve: ${key}`)
    },
  }
  return { container, notifications, fulfillmentModule, query }
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

async function postWebhook(container: unknown, body: Record<string, unknown>, secret = "s3cret") {
  const res = makeRes()
  await webhook(
    { scope: container, headers: { "x-carrier-secret": secret }, query: {}, body } as never,
    res as never
  )
  return res
}

const notice = (status: string, extra: Record<string, unknown> = {}) => ({
  ref: SHIPMENT_REF,
  status,
  tracking: TRACKING,
  orderRef: "ESC-55",
  ...extra,
})

function events(kind: string) {
  return recordOpsEvent.mock.calls.map((c) => c[1]).filter((e) => e.kind === kind)
}

beforeEach(() => {
  jest.clearAllMocks()
  resetCarrierAdapters()
  registerCarrierAdapter(fakeAdapter)
  process.env.SHIPPING_CARRIER = "fake"
  process.env.CARRIER_WEBHOOK_SECRET = "s3cret"
  process.env.STOREFRONT_URL = "https://market.esteacay.com"
})

describe("kargo webhook → sipariş durumu", () => {
  const fresh = (): State => ({
    shipped_at: null,
    delivered_at: null,
    data: { carrier: "fake", carrier_name: "Fake Kargo", shipment_ref: SHIPMENT_REF },
  })

  it("SHIPPED → data güncellenir, kargoya verilir, Logs olayı", async () => {
    const state = fresh()
    const { container, fulfillmentModule } = makeContainer(state)
    const res = await postWebhook(container, notice("SHIPPED"))

    expect(res.statusCode).toBe(200)
    expect(fulfillmentModule.updateFulfillment).toHaveBeenCalledWith(FULFILLMENT_ID, expect.anything())
    expect(state.data).toMatchObject({ carrier: "fake", shipment_ref: SHIPMENT_REF, tracking_number: TRACKING, status_code: "SHIPPED" })
    expect(shipmentRun).toHaveBeenCalledTimes(1)
    expect(shipmentRun.mock.calls[0][0].input).toMatchObject({
      order_id: ORDER_ID,
      fulfillment_id: FULFILLMENT_ID,
      items: [
        { id: "li_1", quantity: 1 },
        { id: "li_2", quantity: 2 },
      ],
      labels: [{ tracking_number: TRACKING, tracking_url: `https://fake.test/track/${TRACKING}`, label_url: "" }],
    })
    expect(recordOpsEvent).toHaveBeenCalledWith(container, expect.objectContaining({ kind: "shipment.shipped", orderId: ORDER_ID, once: true }))
    expect(deliveredRun).not.toHaveBeenCalled()
    expect(events("shipment.webhook")).toEqual([
      expect.objectContaining({ level: "info", title: "Kargo bildirimi: ESC-55 · SHIPPED", orderId: ORDER_ID, oncePerTitle: true }),
    ])
  })

  it("ara durum (LABEL_PRINTED) → yalnız veri güncellenir, sipariş durumu değişmez", async () => {
    const { container, fulfillmentModule } = makeContainer(fresh())
    await postWebhook(container, notice("LABEL_PRINTED"))
    expect(fulfillmentModule.updateFulfillment).toHaveBeenCalled()
    expect(shipmentRun).not.toHaveBeenCalled()
    expect(recordOpsEvent.mock.calls.map((c) => c[1].kind)).toEqual(["shipment.webhook"])
  })

  it("sipariş referansı yoksa son kayıtlar taranır (shipment_ref eşleşmesi)", async () => {
    const { container, query } = makeContainer(fresh())
    await postWebhook(container, notice("SHIPPED", { orderRef: undefined }))
    expect(query.graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "fulfillment", pagination: expect.anything() }))
    expect(shipmentRun).toHaveBeenCalledTimes(1)
  })

  it("eşleşmeyen gönderi → 200, Logs uyarısı, işlem yok", async () => {
    const { container } = makeContainer(fresh())
    const res = await postWebhook(container, notice("SHIPPED", { ref: "bilinmeyen", orderRef: "ESC-99" }))
    expect(res.statusCode).toBe(200)
    expect(shipmentRun).not.toHaveBeenCalled()
    expect(events("shipment.webhook")[0]).toMatchObject({ level: "warning", title: "Kargo bildirimi eşleşmedi: ESC-99" })
  })

  it("kargo durumu işlenemezse Logs'a hata satırı, yine 200", async () => {
    const { container } = makeContainer(fresh())
    shipmentRun.mockRejectedValueOnce(new Error("workflow patladı"))
    const res = await postWebhook(container, notice("SHIPPED"))
    expect(res.statusCode).toBe(200)
    const errors = events("shipment.webhook").filter((e) => e.level === "error")
    expect(errors).toEqual([expect.objectContaining({ title: "Kargo bildirimi işlenemedi: ESC-55 · SHIPPED", orderId: ORDER_ID })])
    expect(errors[0].detail).toContain("workflow patladı")
  })

  it("aynı bildirim tekrar gelirse ikinci kez kargoya verilmez", async () => {
    const { container } = makeContainer({ ...fresh(), shipped_at: "2026-10-13T10:00:00Z" })
    await postWebhook(container, notice("SHIPPED"))
    expect(shipmentRun).not.toHaveBeenCalled()
  })

  it("teslim bildirimi kargoya verilmeden gelirse önce kargo, sonra teslim", async () => {
    const { container } = makeContainer(fresh())
    await postWebhook(container, notice("DELIVERED"))
    expect(shipmentRun).toHaveBeenCalledTimes(1)
    expect(deliveredRun).toHaveBeenCalledWith({ input: { orderId: ORDER_ID, fulfillmentId: FULFILLMENT_ID } })
    const kinds = recordOpsEvent.mock.calls.map((c) => c[1].kind).filter((k) => k !== "shipment.webhook")
    expect(kinds).toEqual(["shipment.shipped", "shipment.delivered"])
  })

  it("teslim edilmiş siparişe tekrar teslim → bir şey yapılmaz", async () => {
    const { container } = makeContainer({ ...fresh(), shipped_at: "2026-10-13T10:00:00Z", delivered_at: "2026-10-14T10:00:00Z" })
    const result = await applyCarrierAction(container as never, { fulfillmentId: FULFILLMENT_ID, action: "delivered" })
    expect(result).toEqual({ ok: true, did: "already_delivered" })
    expect(deliveredRun).not.toHaveBeenCalled()
  })

  it("yarış: iki kanal aynı anda → Medusa 'already shipped' derse hata değil, yapılmış sayılır", async () => {
    const { container } = makeContainer(fresh())
    shipmentRun.mockRejectedValueOnce(new Error("Fulfillment with id ful_1 already shipped"))
    const result = await applyCarrierAction(container as never, { fulfillmentId: FULFILLMENT_ID, action: "shipped" })
    expect(result).toEqual({ ok: true, did: "shipped" })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("başka bir kanal zaten kargoya vermiş"))
    shipmentRun.mockRejectedValueOnce(new Error("Fulfillment with id ful_1 already shipped"))
    await postWebhook(container, notice("SHIPPED"))
    expect(events("shipment.webhook").filter((e) => e.level === "error")).toEqual([])
  })

  it("yarış: teslimde 'already delivered' → already_delivered, hata yok", async () => {
    const { container } = makeContainer({ ...fresh(), shipped_at: "2026-10-13T10:00:00Z" })
    deliveredRun.mockRejectedValueOnce(new Error("Fulfillment with id ful_1 already delivered"))
    const result = await applyCarrierAction(container as never, { fulfillmentId: FULFILLMENT_ID, action: "delivered" })
    expect(result).toEqual({ ok: true, did: "already_delivered" })
    expect(events("shipment.delivered")).toEqual([])
  })

  it("başka workflow hatası yutulmaz", async () => {
    const { container } = makeContainer(fresh())
    shipmentRun.mockRejectedValueOnce(new Error("DB bağlantısı koptu"))
    await expect(applyCarrierAction(container as never, { fulfillmentId: FULFILLMENT_ID, action: "shipped" })).rejects.toThrow(
      "DB bağlantısı koptu"
    )
  })

  it("kargo hatası → Logs'a hata olayı, sipariş durumu değişmez", async () => {
    const { container } = makeContainer(fresh())
    await postWebhook(container, notice("FAILED"))
    expect(shipmentRun).not.toHaveBeenCalled()
    expect(recordOpsEvent).toHaveBeenCalledWith(container, expect.objectContaining({ kind: "shipment.problem", level: "error", orderId: ORDER_ID }))
  })

  it("yanlış sır → 200 ama hiçbir şey işlenmez, Logs'a günde bir uyarı", async () => {
    const { container, fulfillmentModule } = makeContainer(fresh())
    const res = await postWebhook(container, notice("SHIPPED"), "yanlis")
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: false, reason: "rejected" })
    expect(fulfillmentModule.updateFulfillment).not.toHaveBeenCalled()
    expect(shipmentRun).not.toHaveBeenCalled()
    expect(events("shipment.webhook")).toEqual([
      expect.objectContaining({ level: "warning", title: expect.stringMatching(/^Kargo bildirimi reddedildi .* · \d{4}-\d{2}-\d{2}$/), oncePerTitle: true }),
    ])
  })

  it("adaptör yoksa (elle kargo) webhook 200 + no carrier adapter", async () => {
    resetCarrierAdapters()
    const { container } = makeContainer(fresh())
    const res = await postWebhook(container, notice("SHIPPED"))
    expect(res.body).toEqual({ ok: false, reason: "no carrier adapter" })
    expect(shipmentRun).not.toHaveBeenCalled()
  })
})

describe("shipment.created / delivery.created → müşteri maili", () => {
  const shippedState = (): State => ({
    shipped_at: "2026-10-13T10:00:00Z",
    delivered_at: null,
    data: { carrier: "fake", carrier_name: "Fake Kargo", shipment_ref: SHIPMENT_REF, tracking_number: TRACKING },
  })

  async function emit(name: string, data: Record<string, unknown> = { id: FULFILLMENT_ID }) {
    const ctx = makeContainer(shippedState())
    await orderShippingStatusEmailHandler({ event: { name, data }, container: ctx.container } as never)
    return ctx
  }

  it("kargoya verildi maili: doğru alıcı, şablon, adaptör takip linki, tekrar gönderim engeli", async () => {
    const { notifications } = await emit(FulfillmentWorkflowEvents.SHIPMENT_CREATED)
    expect(notifications.createNotifications).toHaveBeenCalledTimes(1)
    const mail = notifications.createNotifications.mock.calls[0][0]
    expect(mail).toMatchObject({
      to: "musteri@example.com",
      channel: "email",
      template: "order-shipped",
      idempotency_key: `order-shipped:${FULFILLMENT_ID}`,
    })
    expect(mail.content.subject).toContain("kargoya verildi")
    expect(mail.content.html).toContain(`https://fake.test/track/${TRACKING}`)
    expect(mail.content.html).toContain("Fake Kargo")
    expect(mail.content.html).toContain(TRACKING)
  })

  it("teslim edildi maili", async () => {
    const { notifications } = await emit(FulfillmentWorkflowEvents.DELIVERY_CREATED)
    const mail = notifications.createNotifications.mock.calls[0][0]
    expect(mail).toMatchObject({ template: "order-delivered", idempotency_key: `order-delivered:${FULFILLMENT_ID}` })
  })

  it("no_notification ise mail gitmez", async () => {
    const { notifications } = await emit(FulfillmentWorkflowEvents.SHIPMENT_CREATED, { id: FULFILLMENT_ID, no_notification: true })
    expect(notifications.createNotifications).not.toHaveBeenCalled()
  })

  it("mail servisi hata verirse loglanır, akış kırılmaz", async () => {
    const ctx = makeContainer(shippedState())
    ctx.notifications.createNotifications.mockRejectedValueOnce(new Error("SMTP kapalı"))
    await expect(
      orderShippingStatusEmailHandler({
        event: { name: FulfillmentWorkflowEvents.SHIPMENT_CREATED, data: { id: FULFILLMENT_ID } },
        container: ctx.container,
      } as never)
    ).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("SMTP kapalı"))
  })
})
