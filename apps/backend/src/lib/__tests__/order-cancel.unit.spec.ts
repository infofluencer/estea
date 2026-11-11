import { orderCancelBlocker } from "../order-cancel"

describe("orderCancelBlocker", () => {
  it("allows an order with no shipment or an open, not-yet-shipped shipment", () => {
    expect(orderCancelBlocker({ status: "pending", fulfillments: [] })).toBeNull()
    expect(orderCancelBlocker({ status: "pending", fulfillments: [{ id: "f1" }] })).toBeNull()
  })

  it("ignores canceled shipments", () => {
    expect(
      orderCancelBlocker({ status: "pending", fulfillments: [{ id: "f1", canceled_at: "x", shipped_at: "y" }] })
    ).toBeNull()
  })

  it("blocks shipped, delivered, completed and already canceled orders", () => {
    expect(orderCancelBlocker({ status: "pending", fulfillments: [{ id: "f1", shipped_at: "y" }] })).toMatch(/kargoya verilmiş/)
    expect(orderCancelBlocker({ status: "pending", fulfillments: [{ id: "f1", delivered_at: "y" }] })).toMatch(/teslim edilmiş/)
    expect(orderCancelBlocker({ status: "completed", fulfillments: [] })).toMatch(/Tamamlanmış/)
    expect(orderCancelBlocker({ status: "canceled", fulfillments: [] })).toMatch(/zaten iptal/)
  })
})
