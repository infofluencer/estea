import {
  autoFulfillOnPayment,
  buildOrderReference,
  configuredCarrierCode,
  getCarrierFor,
  getConfiguredCarrier,
  registerCarrierAdapter,
  resetCarrierAdapters,
} from "../registry"
import { hasCarrierShipment, mergeFulfillmentData, readFulfillmentData, type CarrierAdapter } from "../types"

const fake: CarrierAdapter = {
  code: "fake",
  name: "Fake Kargo",
  owns: (d) => d?.carrier === "fake",
  createShipment: async () => ({ data: {}, labels: [] }),
  cancelShipment: async () => ({}),
  trackingUrl: (n) => `https://fake.test/${n}`,
}

beforeEach(() => {
  resetCarrierAdapters()
  delete process.env.SHIPPING_CARRIER
  delete process.env.SHIPPING_AUTO_FULFILL
  delete process.env.ORDER_REF_PREFIX
})

describe("carrier registry", () => {
  it("SHIPPING_CARRIER boş / manual → adaptör yok, auto-fulfill kapalı", () => {
    expect(configuredCarrierCode()).toBeNull()
    process.env.SHIPPING_CARRIER = "manual"
    expect(configuredCarrierCode()).toBeNull()
    expect(getConfiguredCarrier()).toBeNull()
    expect(autoFulfillOnPayment()).toBe(false)
  })

  it("kayıtlı adaptör env ile seçilir; auto-fulfill varsayılan açık", () => {
    registerCarrierAdapter(fake)
    process.env.SHIPPING_CARRIER = "FAKE"
    expect(getConfiguredCarrier()?.code).toBe("fake")
    expect(autoFulfillOnPayment()).toBe(true)
    process.env.SHIPPING_AUTO_FULFILL = "false"
    expect(autoFulfillOnPayment()).toBe(false)
  })

  it("mevcut kaydın adaptörü data.carrier'dan bulunur", () => {
    registerCarrierAdapter(fake)
    expect(getCarrierFor({ carrier: "fake" })?.name).toBe("Fake Kargo")
    expect(getCarrierFor({ carrier: "manual" })).toBeNull()
  })

  it("sipariş referansı ESC-<display_id> (+ -D değişimde)", () => {
    expect(buildOrderReference(65)).toBe("ESC-65")
    expect(buildOrderReference(65, { exchange: true })).toBe("ESC-65-D")
    process.env.ORDER_REF_PREFIX = "X-"
    expect(buildOrderReference("7")).toBe("X-7")
  })
})

describe("fulfillment data helpers", () => {
  it("readFulfillmentData boşları atar, hasCarrierShipment manual'i saymaz", () => {
    expect(readFulfillmentData({ carrier: "fake", tracking_number: " 123 ", label_url: "", test_mode: true })).toEqual({
      carrier: "fake",
      tracking_number: "123",
      test_mode: true,
    })
    expect(hasCarrierShipment({ carrier: "fake", shipment_ref: "s1" })).toBe(true)
    expect(hasCarrierShipment({ carrier: "manual", shipment_ref: "s1" })).toBe(false)
    expect(hasCarrierShipment({ carrier: "fake" })).toBe(false)
  })

  it("mergeFulfillmentData eskiyi korur, boş değerle ezmez, updated_at yazar", () => {
    const out = mergeFulfillmentData({ carrier: "fake", tracking_number: "1" }, { tracking_number: "", status: "SHIPPED" })
    expect(out).toMatchObject({ carrier: "fake", tracking_number: "1", status: "SHIPPED" })
    expect(typeof out.updated_at).toBe("string")
  })
})
