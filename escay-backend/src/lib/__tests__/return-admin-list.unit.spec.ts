import { classifyReturn } from "../return-admin-list"

describe("classifyReturn", () => {
  it("requested → open", () => {
    expect(classifyReturn({ status: "requested" })).toBe("open")
  })

  it("received without refund → received", () => {
    expect(classifyReturn({ status: "received" })).toBe("received")
    expect(classifyReturn({ status: "partially_received" })).toBe("received")
  })

  it("refund success → refunded", () => {
    expect(classifyReturn({ status: "received", metadata: { paytr_refund: { status: "success" } } })).toBe("refunded")
  })

  it("refund failed → problem (havale or PayTR error)", () => {
    expect(
      classifyReturn({ status: "received", metadata: { paytr_refund: { status: "failed", manual_required: true } } })
    ).toBe("problem")
  })

  it("rejection wins over everything", () => {
    expect(
      classifyReturn({
        status: "canceled",
        metadata: { escay_rejection: { rejected: true }, paytr_refund: { status: "skipped" } },
      })
    ).toBe("rejected")
  })

  it("canceled without rejection → canceled", () => {
    expect(classifyReturn({ status: "canceled" })).toBe("canceled")
  })
})
