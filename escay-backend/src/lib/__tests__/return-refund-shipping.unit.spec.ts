import { calculateReturnRefundAmount } from "../return-refund"

const base = {
  returnStatus: "received",
  returnItems: [{ item_id: "i1", quantity: 1, received_quantity: 1, reason_id: "r_changed" }],
  orderItems: [{ id: "i1", refundable_total_per_unit: 2499 }],
  reasonsById: { r_changed: { metadata: {} }, r_defect: { metadata: { seller_pays_shipping: true } } },
  shippingTotal: 149.9,
  shippingAlreadyRefunded: false,
}

describe("calculateReturnRefundAmount — kargo", () => {
  it("sebep müşteriden ise kargo eklenmez", () => {
    expect(calculateReturnRefundAmount(base)).toMatchObject({ shippingIncluded: false, total: 2499 })
  })

  it("admin 'kargoyu da iade et' derse eklenir", () => {
    expect(calculateReturnRefundAmount({ ...base, forceShipping: true })).toMatchObject({
      shippingIncluded: true,
      shippingAmount: 149.9,
      total: 2648.9,
    })
  })

  it("kargo daha önce iade edildiyse admin işaretlese de eklenmez", () => {
    expect(
      calculateReturnRefundAmount({ ...base, forceShipping: true, shippingAlreadyRefunded: true })
    ).toMatchObject({ shippingIncluded: false, total: 2499 })
  })

  it("satıcı kaynaklı sebepte işaretsiz de eklenir", () => {
    const r = calculateReturnRefundAmount({
      ...base,
      returnItems: [{ ...base.returnItems[0], reason_id: "r_defect" }],
    })
    expect(r.shippingIncluded).toBe(true)
  })
})
