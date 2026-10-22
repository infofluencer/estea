const calls: string[] = []
const run = (name: string, fail = false) => () => ({
  run: jest.fn(async () => {
    calls.push(name)
    if (fail) throw new Error(`${name} patladı`)
  }),
})
let failOn = ""
jest.mock("@medusajs/medusa/core-flows", () => ({
  beginReceiveReturnWorkflow: () => run("begin", failOn === "begin")(),
  receiveItemReturnRequestWorkflow: () => run("receive", failOn === "receive")(),
  dismissItemReturnRequestWorkflow: () => run("dismiss", failOn === "dismiss")(),
  confirmReturnReceiveWorkflow: () => run("confirm", failOn === "confirm")(),
  cancelReturnReceiveWorkflow: () => run("cancel")(),
}))

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { buildReturnRefundedCustomerEmail } from "../../emails/return-notifications"
import { acceptReturnItems, planReturnAcceptance } from "../return-acceptance"
import { calculateReturnRefundAmount } from "../return-refund"

const returnItems = [
  { item_id: "item_a", quantity: 2 },
  { item_id: "item_b", quantity: 1 },
]

describe("planReturnAcceptance", () => {
  it("stoğa / hasarlı / kabul edilmeyen ayrımı", () => {
    const plan = planReturnAcceptance(returnItems, [
      { item_id: "item_a", restock_quantity: 1, damaged_quantity: 0 },
      { item_id: "item_b", restock_quantity: 0, damaged_quantity: 1 },
    ])
    expect(plan.receive).toEqual([{ id: "item_a", quantity: 1 }])
    expect(plan.dismiss).toEqual([{ id: "item_b", quantity: 1 }])
    expect(plan.items).toEqual([
      { item_id: "item_a", requested: 2, restock: 1, damaged: 0, rejected: 1 },
      { item_id: "item_b", requested: 1, restock: 0, damaged: 1, rejected: 0 },
    ])
  })

  it("girilmeyen kalem kabul edilmemiş sayılır", () => {
    const plan = planReturnAcceptance(returnItems, [{ item_id: "item_a", restock_quantity: 2 }])
    expect(plan.items[1]).toMatchObject({ item_id: "item_b", rejected: 1 })
  })

  it("hatalı girişler reddedilir", () => {
    expect(() => planReturnAcceptance(returnItems, [{ item_id: "item_a", restock_quantity: 2, damaged_quantity: 1 }])).toThrow(
      /fazla/
    )
    expect(() => planReturnAcceptance(returnItems, [{ item_id: "x", restock_quantity: 1 }])).toThrow(/yok/)
    expect(() => planReturnAcceptance(returnItems, [])).toThrow(/Reddet/)
  })
})

describe("acceptReturnItems", () => {
  function makeContainer(ret: Record<string, unknown>) {
    const updateReturns = jest.fn()
    const container = {
      resolve: (key: string) => {
        if (key === ContainerRegistrationKeys.QUERY) return { graph: async () => ({ data: [ret] }) }
        if (key === Modules.ORDER) return { updateReturns }
        if (key === ContainerRegistrationKeys.LOGGER) return { warn: jest.fn(), info: jest.fn() }
        throw new Error(key)
      },
    }
    return { container: container as never, updateReturns }
  }
  const ret = { id: "ret_1", status: "requested", order_id: "order_1", metadata: { customer_note: "x" }, items: returnItems }

  beforeEach(() => {
    calls.length = 0
    failOn = ""
  })

  it("kabul kaydı → begin → receive → dismiss → confirm", async () => {
    const { container, updateReturns } = makeContainer(ret)
    const res = await acceptReturnItems(container, {
      return_id: "ret_1",
      items: [
        { item_id: "item_a", restock_quantity: 1 },
        { item_id: "item_b", damaged_quantity: 1 },
      ],
      reason: " etiketi sökülmüş ",
      actor_id: "user_1",
    })
    expect(calls).toEqual(["begin", "receive", "dismiss", "confirm"])
    expect(res.partial).toBe(true)
    const meta = updateReturns.mock.calls[0][0][0].data.metadata
    expect(meta.customer_note).toBe("x")
    expect(meta.escay_acceptance).toMatchObject({ reason: "etiketi sökülmüş", by: "user_1" })
  })

  it("adım hata verirse teslim alma iptal edilir ve kayıt geri alınır", async () => {
    failOn = "confirm"
    const { container, updateReturns } = makeContainer(ret)
    await expect(
      acceptReturnItems(container, { return_id: "ret_1", items: [{ item_id: "item_a", restock_quantity: 2 }] })
    ).rejects.toThrow(/Teslim alınamadı/)
    expect(calls).toEqual(["begin", "receive", "confirm", "cancel"])
    expect(updateReturns.mock.calls[1][0][0].data.metadata.escay_acceptance).toBeNull()
  })

  it("bekleyen olmayan iade kabul edilmez", async () => {
    const { container } = makeContainer({ ...ret, status: "received" })
    await expect(
      acceptReturnItems(container, { return_id: "ret_1", items: [{ item_id: "item_a", restock_quantity: 1 }] })
    ).rejects.toThrow(/bekleyen/)
    expect(calls).toEqual([])
  })
})

describe("kısmi kabulde para iadesi", () => {
  const orderItems = [
    { id: "item_a", unit_price: 500 },
    { id: "item_b", unit_price: 300 },
  ]
  it("partially_received: yalnız teslim alınan adet", () => {
    const r = calculateReturnRefundAmount({
      returnStatus: "partially_received",
      returnItems: [
        { item_id: "item_a", quantity: 2, received_quantity: 1 },
        { item_id: "item_b", quantity: 1, received_quantity: 0 },
      ],
      orderItems,
      reasonsById: {},
      shippingTotal: 50,
      shippingAlreadyRefunded: false,
    })
    expect(r.total).toBe(500)
  })

  it("mailde kabul edilmeyen ürünler ve sebep", () => {
    const mail = buildReturnRefundedCustomerEmail({
      returnId: "ret_1",
      orderDisplayId: "100074",
      email: "a@b.test",
      amount: 500,
      notAccepted: [{ title: "Soft Şal", quantity: 1, variantLabel: "Sarı" }],
      notAcceptedReason: "Kullanılmış",
    })
    expect(mail.html).toContain("İadesi kabul edilmeyen ürünler")
    expect(mail.html).toContain("Soft Şal")
    expect(mail.text).toContain("Sebep: Kullanılmış")
    const plain = buildReturnRefundedCustomerEmail({ returnId: "r", orderDisplayId: "1", email: "a@b.test", amount: 1 })
    expect(plain.html).not.toContain("kabul edilmeyen")
  })
})
