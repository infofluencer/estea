import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { displayIdFromReference, findFulfillmentByCarrierRef, listFulfillmentsPaged } from "../open-fulfillments"

type Row = { id: string; created_at: string; canceled_at?: string | null; delivered_at?: string | null; data: Record<string, unknown> }

/** N kayıt + hedef en sonda (en eski) — "son N kayıt" taramasının kaçırdığı yer. */
function makeRows(total: number, target: Row): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < total; i++) {
    rows.push({ id: `ful_${i}`, created_at: new Date(Date.now() - i * 3_600_000).toISOString(), data: { carrier: "fake", shipment_ref: `ref_${i}` } })
  }
  rows.push({ ...target, created_at: new Date(Date.now() - (total + 1) * 3_600_000).toISOString() })
  return rows
}

function makeContainer(rows: Row[], opts: { rejectNullFilter?: boolean; labels?: { tracking_number: string; fulfillment_id: string }[] } = {}) {
  const graph = jest.fn(async (q: { entity: string; filters?: Record<string, unknown>; pagination?: { take: number; skip?: number } }) => {
    if (q.entity === "fulfillment") {
      if (opts.rejectNullFilter && q.filters && "delivered_at" in q.filters) throw new Error("null filter unsupported")
      if (q.filters?.id) {
        const ids = q.filters.id as string[]
        return { data: rows.filter((r) => ids.includes(r.id)) }
      }
      const take = q.pagination?.take ?? rows.length
      const skip = q.pagination?.skip ?? 0
      return { data: rows.slice(skip, skip + take) }
    }
    if (q.entity === "fulfillment_label") return { data: opts.labels || [] }
    if (q.entity === "order_fulfillment") {
      const id = (q.filters as { fulfillment_id: string }).fulfillment_id
      return { data: [{ order_id: `order_for_${id}`, fulfillment_id: id }] }
    }
    return { data: [] }
  })
  const container = { resolve: (key: string) => (key === ContainerRegistrationKeys.QUERY ? { graph } : { info() {}, warn() {} }) }
  return { container: container as never, graph }
}

describe("taşıyıcı kimliğiyle fulfillment eşleşmesi (sayfalı, sabit üst sınır yok)", () => {
  const target: Row = { id: "ful_target", created_at: "", data: { carrier: "fake", shipment_ref: "OLD-REF", tracking_number: "TRK-OLD" } }

  it("1200 kayıt gerisindeki eski gönderiyi bulur (Mareen 'son 200' hatası)", async () => {
    const { container, graph } = makeContainer(makeRows(1200, target))
    const found = await findFulfillmentByCarrierRef(container, { carrierCode: "fake", shipmentRef: "OLD-REF" })
    expect(found).toMatchObject({ id: "ful_target", orderId: "order_for_ful_target" })
    const pages = graph.mock.calls.filter((c) => c[0].entity === "fulfillment" && c[0].pagination).length
    expect(pages).toBeGreaterThanOrEqual(6)
  })

  it("bulunca taramayı durdurur", async () => {
    const rows = makeRows(1200, target)
    rows.splice(10, 0, { id: "ful_early", created_at: rows[10].created_at, data: { carrier: "fake", shipment_ref: "EARLY" } })
    const { container, graph } = makeContainer(rows)
    const found = await findFulfillmentByCarrierRef(container, { carrierCode: "fake", shipmentRef: "EARLY" })
    expect(found?.id).toBe("ful_early")
    expect(graph.mock.calls.filter((c) => c[0].entity === "fulfillment" && c[0].pagination).length).toBe(1)
  })

  it("etiket tablosundaki takip numarası üzerinden tarama yapmadan bulur", async () => {
    const rows = makeRows(1200, target)
    const { container, graph } = makeContainer(rows, { labels: [{ tracking_number: "TRK-OLD", fulfillment_id: "ful_target" }] })
    const found = await findFulfillmentByCarrierRef(container, { carrierCode: "fake", shipmentRef: "nope", trackingNumbers: ["TRK-OLD"] })
    expect(found?.id).toBe("ful_target")
    expect(graph.mock.calls.filter((c) => c[0].entity === "fulfillment" && c[0].pagination)).toHaveLength(0)
  })

  it("iptal edilmiş ve farklı adaptöre ait kayıtlar eşleşmez", async () => {
    const rows: Row[] = [
      { id: "f_cancel", created_at: new Date().toISOString(), canceled_at: new Date().toISOString(), data: { carrier: "fake", shipment_ref: "R" } },
      { id: "f_other", created_at: new Date().toISOString(), data: { carrier: "other", shipment_ref: "R" } },
    ]
    const { container } = makeContainer(rows)
    expect(await findFulfillmentByCarrierRef(container, { carrierCode: "fake", shipmentRef: "R" })).toBeNull()
  })

  it("null filtresi reddedilirse filtresiz yeniden tarar", async () => {
    const { container } = makeContainer(makeRows(300, target), { rejectNullFilter: true })
    const rows = await listFulfillmentsPaged(container, { filters: { delivered_at: null }, pageSize: 100 })
    expect(rows).toHaveLength(301)
  })

  it("sipariş referansından display id", () => {
    expect(displayIdFromReference("ESC-65")).toBe(65)
    expect(displayIdFromReference("ESC-65-D")).toBe(65)
    expect(displayIdFromReference("")).toBeNull()
    expect(displayIdFromReference("ESC-")).toBeNull()
  })
})
