import { formatLabelDate, toLabelOrder } from "../order-packing-label"
import { parseOrderIds } from "../../api/admin/escay-labels/_orders"

const order = {
  id: "order_1",
  display_id: 1042,
  created_at: "2026-10-07T09:30:00.000Z",
  email: "ayse@example.com",
  metadata: { order_note: "Hediye paketi olsun <lütfen>" },
  shipping_address: {
    first_name: "Ayşe",
    last_name: "Yılmaz",
    address_1: "Gül Sok. No:5 D:3",
    address_2: "Caferağa Mah.",
    city: "İstanbul",
    postal_code: "34710",
    phone: "05551112233",
    metadata: { district: "Kadıköy", neighbourhood: "Caferağa Mah." },
  },
  items: [
    {
      product_title: "Rize Çayı",
      variant_title: "500 g / Karton",
      variant_sku: "RZ-500",
      quantity: 2,
      variant: {
        options: [
          { value: "500 g", option: { title: "Gramaj" } },
          { value: "Karton", option: { title: "Paket" } },
        ],
      },
    },
    { product_title: "Demlik", variant_title: "Default variant", quantity: 1 },
    // Canlıda adet line item'da değil detail'de, BigNumber nesnesi olarak gelebilir.
    {
      product_title: "Bergamot Harmanı",
      quantity: { numeric: 0 },
      detail: { quantity: { value: "3", precision: 20 } },
      variant: { options: [{ value: "250 g", option: { title: "Gramaj" } }] },
    },
  ],
  fulfillments: [
    { canceled_at: "2026-10-07T10:00:00Z", data: { carrier: "fake", tracking_number: "OLD" } },
    {
      canceled_at: null,
      data: {
        carrier: "fake",
        carrier_name: "Fake Kargo",
        shipment_ref: "shp_1",
        tracking_number: "123456",
        barcode: "58164696128",
        label_url: "https://labels.fake.test/x.pdf",
      },
    },
  ],
}

describe("order packing label", () => {
  it("maps order fields for the label", () => {
    const label = toLabelOrder(order)
    expect(label.displayId).toBe("1042")
    expect(label.customerName).toBe("Ayşe Yılmaz")
    expect(label.addressLines).toEqual(["Gül Sok. No:5 D:3", "Caferağa Mah.", "Kadıköy / İstanbul 34710"])
    expect(label.lines[0]).toEqual({ title: "Rize Çayı", variant: "Gramaj: 500 g · Paket: Karton", sku: "RZ-500", quantity: 2 })
    expect(label.lines[1].variant).toBe("")
    expect(label.lines[2]).toEqual({ title: "Bergamot Harmanı", variant: "Gramaj: 250 g", sku: "", quantity: 3 })
    expect(label.note).toBe("Hediye paketi olsun <lütfen>")
    expect(label.carrier).toBe("Fake Kargo")
    expect(label.trackingNumber).toBe("123456")
    expect(toLabelOrder(order, { orderPrefix: "ESC-" }).shipment).toEqual({
      barcode: "58164696128",
      carrier: "Fake Kargo",
      orderNumber: "ESC-1042",
    })
  })

  it("uses ORDER_REF_PREFIX / data.order_reference for the shipment reference", () => {
    const prev = process.env.ORDER_REF_PREFIX
    process.env.ORDER_REF_PREFIX = "ESC-"
    expect(toLabelOrder(order).shipment?.orderNumber).toBe("ESC-1042")
    const withRef = { ...order, fulfillments: [{ canceled_at: null, data: { ...order.fulfillments[1].data, order_reference: "ESC-1042-D" } }] }
    expect(toLabelOrder(withRef).shipment?.orderNumber).toBe("ESC-1042-D")
    if (prev === undefined) delete process.env.ORDER_REF_PREFIX
    else process.env.ORDER_REF_PREFIX = prev
  })

  it("manual (elle) kargo kaydı firma gönderisi sayılmaz", () => {
    const manual = { ...order, fulfillments: [{ canceled_at: null, data: { carrier: "manual", tracking_number: "999" } }] }
    const label = toLabelOrder(manual)
    expect(label.shipment).toBeNull()
    expect(label.carrier).toBe("")
    expect(label.trackingNumber).toBe("999")
  })

  it("points to the carrier's own label PDF", () => {
    const label = toLabelOrder(order)
    expect(label.carrierLabelUrl).toBe("https://labels.fake.test/x.pdf")
    expect(label.carrierLabelZpl).toBe("")
    expect(toLabelOrder({ ...order, fulfillments: [] }).carrierLabelUrl).toBe("")
    // http / boş değer etiket adresi sayılmaz
    const insecure = { ...order, fulfillments: [{ canceled_at: null, data: { label_url: "http://x" } }] }
    expect(toLabelOrder(insecure).carrierLabelUrl).toBe("")
  })

  it("formats dates in Istanbul time", () => {
    expect(formatLabelDate(new Date("2026-10-07T19:34:00Z"))).toBe("07.10.2026 22:34")
    expect(formatLabelDate(null)).toBe("—")
  })

  it("parses ids from query", () => {
    expect(parseOrderIds("a, b,,a")).toEqual(["a", "b"])
    expect(parseOrderIds(["a,b", "c"])).toEqual(["a", "b", "c"])
    expect(parseOrderIds(undefined)).toEqual([])
  })
})
