import { Modules } from "@medusajs/framework/utils"

import { markLabelsPrinted } from "../_orders"

function makeReq(updateOrders: jest.Mock) {
  const logger = { warn: jest.fn() }
  return {
    logger,
    req: {
      scope: {
        resolve: (key: string) => (key === Modules.ORDER ? { updateOrders } : logger),
      },
    } as never,
  }
}

describe("markLabelsPrinted", () => {
  it("yalnız kargo etiketi basılan siparişleri işaretler, mevcut metadata korunur", async () => {
    const updateOrders = jest.fn()
    const { req } = makeReq(updateOrders)
    await markLabelsPrinted(
      req,
      [
        { id: "order_1", metadata: { order_note: "Hediye", payment_method: "paytr" } },
        { id: "order_2", metadata: null },
      ],
      ["order_1"]
    )
    expect(updateOrders).toHaveBeenCalledTimes(1)
    const [rows] = updateOrders.mock.calls[0]
    expect(rows).toEqual([
      {
        id: "order_1",
        metadata: { order_note: "Hediye", payment_method: "paytr", label_printed_at: expect.any(String) },
      },
    ])
    expect(Number.isNaN(Date.parse(rows[0].metadata.label_printed_at))).toBe(false)
  })

  it("basılan yoksa hiçbir şey yazmaz", async () => {
    const updateOrders = jest.fn()
    await markLabelsPrinted(makeReq(updateOrders).req, [{ id: "order_1" }], [])
    expect(updateOrders).not.toHaveBeenCalled()
  })

  it("kayıt hatası etiket baskısını engellemez", async () => {
    const updateOrders = jest.fn().mockRejectedValue(new Error("db kapalı"))
    const { req, logger } = makeReq(updateOrders)
    await expect(markLabelsPrinted(req, [{ id: "order_1" }], ["order_1"])).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("db kapalı"))
  })
})
