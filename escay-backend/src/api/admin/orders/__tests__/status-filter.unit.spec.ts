const listRun = jest.fn()
jest.mock("@medusajs/medusa/core-flows", () => ({
  getOrdersListWorkflow: () => ({ run: listRun }),
}))

import { filterOrdersByStatus, matchOrderIds } from "../status-filter"

const rows = [
  { id: "o1", payment_status: "captured", fulfillment_status: "fulfilled", metadata: {} },
  { id: "o2", payment_status: "captured", fulfillment_status: "shipped", metadata: {} },
  { id: "o3", payment_status: "canceled", fulfillment_status: "not_fulfilled", metadata: {} },
  { id: "o4", payment_status: "awaiting", fulfillment_status: "not_fulfilled", metadata: { payment_method: "bank_transfer" } },
  { id: "o5", payment_status: "awaiting", fulfillment_status: "not_fulfilled", metadata: {} },
]

describe("matchOrderIds", () => {
  it("ödeme durumu", () => {
    expect(matchOrderIds(rows, ["captured"], [])).toEqual(["o1", "o2"])
  })
  it("kargo durumu", () => {
    expect(matchOrderIds(rows, [], ["not_fulfilled"])).toEqual(["o3", "o4", "o5"])
  })
  it("ikisi birlikte (VE)", () => {
    expect(matchOrderIds(rows, ["captured"], ["shipped"])).toEqual(["o2"])
  })
  it("ödenmemiş havale listedeki gibi 'Havale onayı bekleniyor' (requires_action)", () => {
    expect(matchOrderIds(rows, ["requires_action"], [])).toEqual(["o4"])
    expect(matchOrderIds(rows, ["awaiting"], [])).toEqual(["o5"])
  })
})

describe("filterOrdersByStatus middleware", () => {
  beforeEach(() => {
    listRun.mockReset()
    listRun.mockResolvedValue({ result: { rows, metadata: {} } })
  })

  it("filtre yoksa dokunmaz", async () => {
    const next = jest.fn()
    const req = { query: { limit: "20" }, scope: {} }
    await filterOrdersByStatus(req as never, {} as never, next)
    expect(listRun).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
    expect(req.query).toEqual({ limit: "20" })
  })

  it("durumları id filtresine çevirir, bilinmeyen anahtarları siler", async () => {
    const next = jest.fn()
    const req = { query: { payment_status: "captured", fulfillment_status: ["shipped"] }, scope: {} } as {
      query: Record<string, unknown>
      scope: unknown
      filterableFields?: Record<string, unknown>
    }
    await filterOrdersByStatus(req as never, {} as never, next)
    expect(req.query).toEqual({ id: ["o2"] })
    expect(next).toHaveBeenCalledWith()
  })

  it("doğrulamadan sonra çalışırsa filterableFields'a da yazar; eşleşme yoksa boş liste", async () => {
    const next = jest.fn()
    const req = { query: { payment_status: "refunded" }, scope: {}, filterableFields: { region_id: ["r"] } }
    await filterOrdersByStatus(req as never, {} as never, next)
    expect(req.filterableFields).toEqual({ region_id: ["r"], id: ["order_none"] })
  })

  it("virgüllü değerleri ayırır", async () => {
    const next = jest.fn()
    const req = { query: { fulfillment_status: "fulfilled,shipped" }, scope: {} } as { query: Record<string, unknown>; scope: unknown }
    await filterOrdersByStatus(req as never, {} as never, next)
    expect(req.query.id).toEqual(["o1", "o2"])
  })
})
