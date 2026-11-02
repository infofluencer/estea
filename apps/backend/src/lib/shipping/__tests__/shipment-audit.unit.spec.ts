import { auditOrders, type AuditOrder } from "../shipment-audit"

const NOW = new Date("2026-10-30T07:00:00.000Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

function order(partial: Partial<AuditOrder> & { id: string }): AuditOrder {
  return { display_id: 1, status: "pending", created_at: daysAgo(3), payment_collections: [{ status: "captured" }], fulfillments: [], ...partial }
}

describe("günlük kargo denetimi (salt okunur)", () => {
  it("ödendi ama kargo kaydı yok → uyarı; çok yeni sipariş atlanır, ödenmemiş sayılmaz", () => {
    const findings = auditOrders(
      [
        order({ id: "o1", display_id: 10, created_at: daysAgo(2) }),
        order({ id: "o2", display_id: 11, created_at: new Date(NOW.getTime() - 3_600_000).toISOString() }),
        order({ id: "o3", display_id: 12, payment_collections: [{ status: "pending" }] }),
      ],
      { now: NOW }
    )
    expect(findings.map((f) => [f.kind, f.orderDisplayId])).toEqual([["paid_without_fulfillment", "10"]])
  })

  it("etiket alınmış ama kargoya verilmemiş kayıt yaş eşiğini aşınca uyarır (aracı sessiz iptali)", () => {
    const findings = auditOrders(
      [
        order({
          id: "o1",
          display_id: 20,
          fulfillments: [{ id: "f1", created_at: daysAgo(5), data: { carrier: "x", shipment_ref: "R1", tracking_number: "T1" } }],
        }),
        order({ id: "o2", display_id: 21, fulfillments: [{ id: "f2", created_at: daysAgo(1), data: { carrier: "x", shipment_ref: "R2" } }] }),
      ],
      { now: NOW, staleLabelDays: 4 }
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ kind: "stale_label", orderId: "o1", level: "warning", data: { shipment_ref: "R1", age_days: 5 } })
    expect(findings[0].detail).toContain("R1")
  })

  it("kargoya verilmiş ama teslim gecikmiş → uyarı; teslim edilmiş ya da yeni → yok", () => {
    const findings = auditOrders(
      [
        order({ id: "o1", display_id: 30, fulfillments: [{ id: "f1", created_at: daysAgo(14), shipped_at: daysAgo(12), data: { tracking_number: "T" } }] }),
        order({ id: "o2", display_id: 31, fulfillments: [{ id: "f2", created_at: daysAgo(14), shipped_at: daysAgo(12), delivered_at: daysAgo(10), data: {} }] }),
        order({ id: "o3", display_id: 32, fulfillments: [{ id: "f3", created_at: daysAgo(4), shipped_at: daysAgo(3), data: {} }] }),
      ],
      { now: NOW, staleTransitDays: 10 }
    )
    expect(findings.map((f) => [f.kind, f.orderDisplayId])).toEqual([["stale_transit", "30"]])
  })

  it("iptal siparişte aktif gönderi → hata; iptal edilmiş kayıtlar sayılmaz", () => {
    const findings = auditOrders(
      [
        order({ id: "o1", display_id: 40, status: "canceled", fulfillments: [{ id: "f1", created_at: daysAgo(2), data: { shipment_ref: "R" } }] }),
        order({ id: "o2", display_id: 41, status: "canceled", fulfillments: [{ id: "f2", created_at: daysAgo(2), canceled_at: daysAgo(1), data: {} }] }),
      ],
      { now: NOW }
    )
    expect(findings.map((f) => [f.kind, f.level, f.orderDisplayId])).toEqual([["canceled_with_active_fulfillment", "error", "40"]])
  })

  it("aynı firma gönderi kimliği iki siparişte → hata", () => {
    const findings = auditOrders(
      [
        order({ id: "o1", display_id: 50, fulfillments: [{ id: "f1", created_at: daysAgo(1), shipped_at: daysAgo(1), data: { carrier: "x", shipment_ref: "DUP" } }] }),
        order({ id: "o2", display_id: 51, fulfillments: [{ id: "f2", created_at: daysAgo(1), shipped_at: daysAgo(1), data: { carrier: "x", shipment_ref: "DUP" } }] }),
        order({ id: "o3", display_id: 52, fulfillments: [{ id: "f3", created_at: daysAgo(1), shipped_at: daysAgo(1), data: { carrier: "x", shipment_ref: "OTHER" } }] }),
      ],
      { now: NOW }
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ kind: "duplicate_shipment_ref", level: "error", data: { order_ids: ["o1", "o2"] } })
    expect(findings[0].title).toContain("iki siparişte")
  })

  it("tutarlı veri → bulgu yok", () => {
    const findings = auditOrders(
      [order({ id: "o1", fulfillments: [{ id: "f1", created_at: daysAgo(3), shipped_at: daysAgo(2), delivered_at: daysAgo(1), data: { shipment_ref: "R" } }] })],
      { now: NOW }
    )
    expect(findings).toEqual([])
  })
})
