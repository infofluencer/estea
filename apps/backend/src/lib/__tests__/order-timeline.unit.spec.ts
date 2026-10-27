import {
  ORDER_STATUS_BADGE,
  ORDER_TIMELINE_STEPS,
  formatOrderStatusLabel,
  nextOrderStatusAction,
  resolveOrderTimeline,
  trackingFallbackMessage,
  type OrderTimelineInput,
  type OrderTimelineStepKey,
} from "@escay/shared/order-timeline"

function expectStepFlags(
  order: OrderTimelineInput,
  current: OrderTimelineStepKey
) {
  const tl = resolveOrderTimeline(order)
  expect(tl.canceled).toBe(false)
  expect(tl.currentKey).toBe(current)
  expect(ORDER_STATUS_BADGE[tl.currentKey]).toBe(formatOrderStatusLabel(order))
  expect(tl.steps).toHaveLength(ORDER_TIMELINE_STEPS.length)

  const idx = ORDER_TIMELINE_STEPS.findIndex((s) => s.key === current)
  tl.steps.forEach((step, i) => {
    expect(step.key).toBe(ORDER_TIMELINE_STEPS[i].key)
    expect(step.label).toBe(ORDER_TIMELINE_STEPS[i].label)
    if (current === "delivered") {
      expect(step.done).toBe(true)
      expect(step.current).toBe(i === idx)
    } else {
      expect(step.current).toBe(i === idx)
      expect(step.done).toBe(i < idx)
    }
  })
  return tl
}

describe("resolveOrderTimeline — all stepper states", () => {
  it("canceled: no progression, no next action", () => {
    const tl = resolveOrderTimeline({ status: "canceled" })
    expect(tl.canceled).toBe(true)
    expect(formatOrderStatusLabel({ status: "canceled" })).toBe("İptal")
    expect(nextOrderStatusAction({ status: "canceled" })).toBeNull()
  })

  it("received (unpaid)", () => {
    const order = { status: "pending" }
    expectStepFlags(order, "received")
    expect(formatOrderStatusLabel(order)).toBe("Alındı")
    expect(nextOrderStatusAction(order)).toBe("prepare")
    expect(trackingFallbackMessage("received")).toMatch(/Ödeme sonrası/)
  })

  it("preparing (paid, no fulfillment)", () => {
    const order = {
      status: "pending",
      payment_collections: [{ status: "captured" }],
    }
    expectStepFlags(order, "preparing")
    expect(formatOrderStatusLabel(order)).toBe("Hazırlanıyor")
    expect(nextOrderStatusAction(order)).toBe("prepare")
    expect(trackingFallbackMessage("preparing")).toMatch(/hazırlanıyor/)
  })

  it("preparing (fulfillment, label not printed)", () => {
    const order: OrderTimelineInput = {
      payment_collections: [{ status: "captured" }],
      fulfillments: [{}],
    }
    expectStepFlags(order, "preparing")
    expect(nextOrderStatusAction(order)).toBe("prepare")
  })

  it("prepared (label printed, not shipped)", () => {
    const order: OrderTimelineInput = {
      payment_collections: [{ status: "captured" }],
      fulfillments: [{}],
      metadata: { label_printed_at: "2026-10-14T10:00:00.000Z" },
    }
    expectStepFlags(order, "prepared")
    expect(formatOrderStatusLabel(order)).toBe("Hazırlandı")
    expect(nextOrderStatusAction(order)).toBe("ship")
    expect(trackingFallbackMessage("prepared")).toMatch(/hazırlandı/)
  })

  it("shipped (shipped_at)", () => {
    const order: OrderTimelineInput = {
      fulfillments: [{ shipped_at: "2026-01-01" }],
    }
    expectStepFlags(order, "shipped")
    expect(formatOrderStatusLabel(order)).toBe("Kargoya verildi")
    expect(nextOrderStatusAction(order)).toBe("deliver")
    expect(
      trackingFallbackMessage("shipped", { hasTrackingLink: false })
    ).toMatch(/yola çıktı/)
    expect(
      trackingFallbackMessage("shipped", { hasTrackingLink: true })
    ).toBeNull()
  })

  it("preparing when label has tracking but was not printed", () => {
    const order: OrderTimelineInput = {
      fulfillments: [
        { labels: [{ tracking_number: "TRK1", tracking_url: "https://t.test" }] },
      ],
    }
    expectStepFlags(order, "preparing")
  })

  it("prepared when marked manually (prepared_at)", () => {
    const order: OrderTimelineInput = {
      payment_collections: [{ status: "captured" }],
      fulfillments: [{}],
      metadata: { prepared_at: "2026-10-14T10:00:00.000Z" },
    }
    expectStepFlags(order, "prepared")
  })

  it("empty label_printed_at (reship reset) stays preparing", () => {
    const order: OrderTimelineInput = {
      payment_collections: [{ status: "captured" }],
      fulfillments: [{}],
      metadata: { label_printed_at: "" },
    }
    expectStepFlags(order, "preparing")
  })

  it("label printed but unpaid and no fulfillment stays received", () => {
    expectStepFlags({ metadata: { label_printed_at: "2026-10-14" } }, "received")
  })

  it("prepared when carrier tracking exists and label printed", () => {
    const order: OrderTimelineInput = {
      fulfillments: [
        {
          data: {
            carrier: "fake",
            tracking_number: "G1",
            tracking_url: "https://g.test",
          },
        },
      ],
      metadata: { label_printed_at: "2026-10-14T10:00:00.000Z" },
    }
    expectStepFlags(order, "prepared")
  })

  it("delivered", () => {
    const order: OrderTimelineInput = {
      fulfillments: [
        { shipped_at: "2026-01-01", delivered_at: "2026-01-02" },
      ],
    }
    expectStepFlags(order, "delivered")
    expect(formatOrderStatusLabel(order)).toBe("Teslim edildi")
    expect(nextOrderStatusAction(order)).toBeNull()
    expect(trackingFallbackMessage("delivered")).toMatch(/teslim edildi/)
  })

  it("ignores canceled fulfillments", () => {
    const order: OrderTimelineInput = {
      payment_collections: [{ status: "captured" }],
      fulfillments: [
        { canceled_at: "2026-01-01", shipped_at: "2026-01-01" },
      ],
    }
    expectStepFlags(order, "preparing")
  })

  it("authorized payment counts as preparing", () => {
    expectStepFlags(
      { payment_collections: [{ status: "authorized" }] },
      "preparing"
    )
  })

  it("badge + tracking copy stay aligned for every step key", () => {
    const keys: OrderTimelineStepKey[] = [
      "received",
      "preparing",
      "prepared",
      "shipped",
      "delivered",
    ]
    for (const key of keys) {
      expect(ORDER_STATUS_BADGE[key]).toBeTruthy()
      const msg = trackingFallbackMessage(key, { hasTrackingLink: false })
      if (key === "shipped") {
        expect(msg).toBeTruthy()
      } else {
        expect(msg).toBeTruthy()
      }
      expect(ORDER_TIMELINE_STEPS.find((s) => s.key === key)?.label).toBeTruthy()
    }
  })
})
