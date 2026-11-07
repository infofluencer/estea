jest.mock("../open-fulfillments", () => ({ listOpenFulfillments: jest.fn() }))
jest.mock("../../carrier-actions", () => ({ applyCarrierAction: jest.fn(async () => ({ ok: true })), patchFulfillmentData: jest.fn(async () => {}) }))
jest.mock("../../ops-events", () => ({ recordOpsEvent: jest.fn(async () => {}), errorText: (e: unknown) => String(e) }))

import { listOpenFulfillments } from "../open-fulfillments"
import { applyCarrierAction, patchFulfillmentData } from "../../carrier-actions"
import { recordOpsEvent } from "../../ops-events"
import { trackOpenShipments } from "../track-shipments"
import { registerCarrierAdapter, resetCarrierAdapters } from "../../../modules/carrier/registry"
import type { CarrierAdapter, CarrierStatus } from "../../../modules/carrier/types"

const container = { resolve: () => ({ info: () => {}, warn: () => {} }) } as never

function withStatus(status: CarrierStatus) {
  const adapter: CarrierAdapter = {
    code: "fake",
    name: "Fake",
    owns: (d) => d?.carrier === "fake",
    createShipment: async () => ({ data: {}, labels: [] }),
    cancelShipment: async () => ({}),
    trackingUrl: () => "",
    getStatus: async () => status,
  }
  resetCarrierAdapters()
  registerCarrierAdapter(adapter)
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(listOpenFulfillments as jest.Mock).mockResolvedValue([
    { id: "ful_1", data: { carrier: "fake", shipment_ref: "ESC65", order_reference: "ESC-65", status_code: "BARCODE_PENDING" } },
  ])
})

describe("trackOpenShipments", () => {
  it("gecikmeli etiket: durum kodu aynı olsa da patch + etiket satırı yazılır", async () => {
    withStatus({
      code: "BARCODE_PENDING",
      description: "x",
      action: "none",
      patch: { tracking_number: "1", label_zpl: "^XA^XZ" },
      labels: [{ tracking_number: "1", tracking_url: "u", label_url: "" }],
    })
    const r = await trackOpenShipments(container)
    expect(r.changed).toBe(1)
    expect(patchFulfillmentData).toHaveBeenCalledWith(container, "ful_1", { tracking_number: "1", label_zpl: "^XA^XZ" }, [
      { tracking_number: "1", tracking_url: "u", label_url: "" },
    ])
    expect(applyCarrierAction).not.toHaveBeenCalled()
  })

  it("değişiklik yoksa yazılmaz", async () => {
    withStatus({ code: "BARCODE_PENDING", description: "x", action: "none" })
    expect((await trackOpenShipments(container)).changed).toBe(0)
    expect(patchFulfillmentData).not.toHaveBeenCalled()
  })

  it("uyarı Logs'a bir kez (başlık başına) düşer; aksiyon uygulanır", async () => {
    withStatus({ code: "8", description: "Destek gerekiyor", action: "failed", alert: { level: "error", title: "DHL gönderide destek istiyor" } })
    await trackOpenShipments(container)
    expect(recordOpsEvent).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ level: "error", title: "DHL gönderide destek istiyor: ESC-65", oncePerTitle: true })
    )
    expect(applyCarrierAction).toHaveBeenCalledWith(container, expect.objectContaining({ fulfillmentId: "ful_1", action: "failed" }))
  })
})
