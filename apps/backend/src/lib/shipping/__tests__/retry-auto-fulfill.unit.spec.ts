jest.mock("../../auto-fulfill-order", () => ({ autoFulfillPaidOrder: jest.fn() }))
jest.mock("../../ops-events", () => ({
  recordOpsEvent: jest.fn(async () => undefined),
  errorText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

import { recordOpsEvent } from "../../ops-events"
import { isPermanentFulfillError, pickRetryTargets, retryPaidUnfulfilled, RETRY_METADATA_KEY, type RetryOrder } from "../retry-auto-fulfill"

const NOW = new Date("2026-11-11T12:00:00.000Z")
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString()

function order(partial: Partial<RetryOrder> & { id: string }): RetryOrder {
  return { status: "pending", created_at: minutesAgo(60), payment_collections: [{ status: "captured" }], fulfillments: [], metadata: {}, ...partial }
}

function fakeContainer(metadataById: Record<string, Record<string, unknown>> = {}) {
  const updateOrders = jest.fn(async (id: string, data: { metadata: Record<string, unknown> }) => {
    metadataById[id] = data.metadata
  })
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const query = { graph: jest.fn(async ({ filters }: { filters: { id: string } }) => ({ data: [{ id: filters.id, metadata: metadataById[filters.id] ?? {} }] })) }
  const container = {
    resolve: (key: string) => (key === "logger" ? logger : key === "query" ? query : { updateOrders }),
  }
  return { container: container as never, updateOrders, metadataById }
}

describe("ödendi ama kargo kaydı yok → yeniden deneme", () => {
  beforeEach(() => jest.clearAllMocks())

  it("yalnız ödenmiş, hiç kargo kaydı olmayan, bekleme süresini aşmış siparişleri seçer", () => {
    const picked = pickRetryTargets(
      [
        order({ id: "ok" }),
        order({ id: "yeni", created_at: minutesAgo(5) }),
        order({ id: "odenmemis", payment_collections: [{ status: "pending" }] }),
        order({ id: "iptal", status: "canceled" }),
        order({ id: "kaydi-var", fulfillments: [{ id: "f1" }] }),
        order({ id: "iade", payment_collections: [{ status: "captured", refunded_amount: 100 }] }),
        order({ id: "birakildi", metadata: { [RETRY_METADATA_KEY]: { attempts: 12, gave_up: true } } }),
        order({ id: "deneniyor", metadata: { [RETRY_METADATA_KEY]: { attempts: 3 } } }),
      ],
      { now: NOW }
    )
    expect(picked.map((o) => o.id)).toEqual(["ok", "deneniyor"])
  })

  it("başarıda Logs'a bilgi düşer, sayaç yazılmaz", async () => {
    const { container, updateOrders } = fakeContainer()
    const fulfill = jest.fn(async () => ({ ok: true as const, fulfillmentId: "ful_1" }))
    const summary = await retryPaidUnfulfilled(container, { now: () => NOW, load: async () => [order({ id: "o1" })], fulfill })
    expect(summary).toEqual({ candidates: 1, created: 1, failed: 0, gaveUp: 0 })
    expect(updateOrders).not.toHaveBeenCalled()
    expect(recordOpsEvent).toHaveBeenCalledWith(container, expect.objectContaining({ kind: "shipment.created", orderId: "o1" }))
  })

  it("hata: sipariş iptal edilmez, sayaç artar, mevcut metadata korunur, Logs sessiz", async () => {
    const { container, metadataById } = fakeContainer({ o1: { email: "a@b.c" } })
    const fulfill = jest.fn(async () => {
      throw new Error("DHL_TIMEOUT")
    })
    const summary = await retryPaidUnfulfilled(container, { now: () => NOW, load: async () => [order({ id: "o1" })], fulfill })
    expect(summary).toEqual({ candidates: 1, created: 0, failed: 1, gaveUp: 0 })
    expect(metadataById.o1).toMatchObject({ email: "a@b.c", [RETRY_METADATA_KEY]: { attempts: 1, last_error: "DHL_TIMEOUT" } })
    expect(recordOpsEvent).not.toHaveBeenCalled()
  })

  it("son denemede bırakır ve Logs'a tek hata yazar", async () => {
    const { container, metadataById } = fakeContainer()
    const fulfill = jest.fn(async () => ({ ok: false as const, message: "adres eşleşmedi" }))
    const o = order({ id: "o1", metadata: { [RETRY_METADATA_KEY]: { attempts: 11 } } })
    const summary = await retryPaidUnfulfilled(container, { now: () => NOW, load: async () => [o], fulfill })
    expect(summary.gaveUp).toBe(1)
    expect(metadataById.o1[RETRY_METADATA_KEY]).toMatchObject({ attempts: 12, gave_up: true })
    expect(recordOpsEvent).toHaveBeenCalledTimes(1)
    expect(recordOpsEvent).toHaveBeenCalledWith(container, expect.objectContaining({ kind: "shipment.failed", level: "error", orderId: "o1" }))
  })

  it("kalıcı hata (adres/telefon eksik): ilk denemede bırakır, Logs'a 'düzeltilmeli' yazar", async () => {
    const { container, metadataById } = fakeContainer()
    const fulfill = jest.fn(async () => {
      throw new Error("Kargo gönderisi için eksik adres alanları: phone. Sipariş adresini admin panelden tamamlayıp tekrar deneyin.")
    })
    const summary = await retryPaidUnfulfilled(container, { now: () => NOW, load: async () => [order({ id: "o1" })], fulfill })
    expect(summary).toEqual({ candidates: 1, created: 0, failed: 1, gaveUp: 1 })
    expect(metadataById.o1[RETRY_METADATA_KEY]).toMatchObject({ attempts: 1, gave_up: true, permanent: true })
    expect(recordOpsEvent).toHaveBeenCalledWith(container, expect.objectContaining({ title: expect.stringContaining("düzeltilmeli"), level: "error" }))
    // DHL'in alıcı reddi de kalıcı; zaman aşımı değil
    expect(isPermanentFulfillError("DHL eCommerce gönderisi oluşturulamadı: [DHL_INVALID_RECIPIENT] telefon 10 hane olmalı")).toBe(true)
    expect(isPermanentFulfillError("[DHL_TIMEOUT] 30000 ms içinde yanıt yok")).toBe(false)
  })

  it("bu arada kayıt açılmışsa (skipped) hiçbir şey yazmaz", async () => {
    const { container, updateOrders } = fakeContainer()
    const fulfill = jest.fn(async () => ({ ok: true as const, skipped: "fulfillment already exists", fulfillmentId: "f" }))
    const summary = await retryPaidUnfulfilled(container, { now: () => NOW, load: async () => [order({ id: "o1" })], fulfill })
    expect(summary).toEqual({ candidates: 1, created: 0, failed: 0, gaveUp: 0 })
    expect(updateOrders).not.toHaveBeenCalled()
    expect(recordOpsEvent).not.toHaveBeenCalled()
  })
})
