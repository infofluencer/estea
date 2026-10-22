import {
  parasutProductIdFromMetadata,
  parseSkuList,
  selectMappingToApply,
  type MappingReportFile,
} from "../parasut-mapping-apply"
import type { MatchEntry } from "../parasut-product-match"

function entry(p: Partial<MatchEntry> & Pick<MatchEntry, "variant_id">): MatchEntry {
  return {
    sku: null,
    product_id: "prod",
    product_title: "Ürün",
    variant_title: null,
    product_status: "published",
    parasut_product_id: null,
    parasut_name: null,
    parasut_code: null,
    method: "none",
    tier: "none",
    confidence: 0,
    reasons: [],
    price_check: { medusa_gross: null, parasut_list_price: null, parasut_vat_rate: null, ok: null },
    ...p,
  } as MatchEntry
}

const report: MappingReportFile = {
  mapping: { v1: "100" },
  entries: [
    entry({ variant_id: "v1", sku: "MK1", parasut_product_id: "100", method: "name_current", tier: "high" }),
    entry({ variant_id: "v2", sku: "MK2", parasut_product_id: "200", method: "name_family", tier: "suspicious" }),
    entry({ variant_id: "v3", sku: "MK2513-13", parasut_product_id: "300", method: "name_family", tier: "suspicious" }),
    entry({ variant_id: "v4", sku: "TABLO", parasut_product_id: "400", method: "name_fuzzy", tier: "suspicious" }),
    entry({ variant_id: "v5", sku: "SIG", method: "none" }),
  ],
}

describe("selectMappingToApply", () => {
  it("applies only mapping (exact+high) by default", () => {
    const r = selectMappingToApply(report, { includeFamily: false, excludeSkus: [] })
    expect(r.selected.map((s) => s.variant_id)).toEqual(["v1"])
    expect(r.skipped).toHaveLength(4)
  })

  it("adds name_family when enabled, honours exclusions, never fuzzy/none", () => {
    const r = selectMappingToApply(report, {
      includeFamily: true,
      excludeSkus: parseSkuList("mk2513-13, OTHER"),
    })
    expect(r.selected.map((s) => [s.variant_id, s.parasut_product_id])).toEqual([
      ["v1", "100"],
      ["v2", "200"],
    ])
    const reasons = Object.fromEntries(r.skipped.map((s) => [s.variant_id, s.reason]))
    expect(reasons.v3).toMatch(/hariç/)
    expect(reasons.v4).toMatch(/onaysız name_fuzzy/)
    expect(reasons.v5).toMatch(/eşleşme yok/)
  })

  it("ignores entries whose id disagrees with mapping", () => {
    const r = selectMappingToApply(
      { mapping: { v1: "999" }, entries: report.entries!.slice(0, 1) },
      { includeFamily: false, excludeSkus: [] }
    )
    expect(r.selected).toEqual([])
  })
})

describe("parasutProductIdFromMetadata", () => {
  it("reads string or number id", () => {
    expect(parasutProductIdFromMetadata({ parasut_product_id: " 1057595513 " })).toBe("1057595513")
    expect(parasutProductIdFromMetadata({ parasut_product_id: 42 })).toBe("42")
    expect(parasutProductIdFromMetadata({ parasut_product_id: "" })).toBeNull()
    expect(parasutProductIdFromMetadata(null)).toBeNull()
  })
})
