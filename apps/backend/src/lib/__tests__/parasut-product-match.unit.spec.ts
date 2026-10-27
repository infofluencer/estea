import {
  matchVariantsToParasut,
  normalizeName,
  priceMatches,
  type MedusaVariantRow,
} from "../parasut-product-match"
import type { ParasutProductRecord } from "../../modules/parasut/types"

function pp(p: Partial<ParasutProductRecord> & { id: string; name: string }): ParasutProductRecord {
  return {
    code: null,
    barcode: null,
    vatRate: 1,
    listPrice: null,
    currency: "TRL",
    archived: false,
    inventoryTracking: false,
    salesInvoiceDetailsCount: 0,
    ...p,
  }
}

function mv(
  v: Partial<MedusaVariantRow> & { variantId: string; productTitle: string }
): MedusaVariantRow {
  return {
    sku: null,
    variantTitle: null,
    productId: `prod_${v.productTitle}`,
    productHandle: null,
    productStatus: "published",
    priceTry: null,
    variantCount: 1,
    ...v,
  }
}

describe("normalizeName / price", () => {
  it("folds Turkish chars, case and punctuation", () => {
    expect(normalizeName("RİZE Siyah Çay - 500 g, Kutu")).toBe("rize siyah cay 500 g kutu")
    expect(normalizeName("Işıl  Ağaç")).toBe("isil agac")
  })
  it("accepts net or gross list price within 2%", () => {
    expect(priceMatches(101, 101, 1)).toBe(true)
    expect(priceMatches(101, 100, 1)).toBe(true)
    expect(priceMatches(101, 70, 1)).toBe(false)
    expect(priceMatches(101, null, 1)).toBeNull()
  })
})

describe("matchVariantsToParasut", () => {
  it("uses code, then barcode, then variant name, then parent name", () => {
    const products = [
      pp({ id: "1", name: "X", code: "ESC-SIYAH-500" }),
      pp({ id: "2", name: "Y", barcode: "ESC-YESIL-250" }),
      pp({ id: "3", name: "Bergamot Çay 500 g" }),
      pp({ id: "4", name: "Hediye Seti" }),
    ]
    const variants = [
      mv({ variantId: "v1", productTitle: "Rize Siyah Çay", sku: "ESC-SIYAH-500" }),
      mv({ variantId: "v2", productTitle: "Yeşil Çay", sku: "esc-yesil-250" }),
      mv({ variantId: "v3", productTitle: "Bergamot Çay", variantTitle: "500 g", variantCount: 2 }),
      mv({ variantId: "v4", productTitle: "Hediye Seti", productId: "p_h", variantTitle: "Kutu", variantCount: 2 }),
      mv({ variantId: "v5", productTitle: "Hediye Seti", productId: "p_h", variantTitle: "Ahşap Kutu", variantCount: 2 }),
    ]
    const r = matchVariantsToParasut(variants, products)
    const by = Object.fromEntries(r.entries.map((e) => [e.variant_id, e]))
    expect(by.v1).toMatchObject({ method: "code", tier: "exact", parasut_product_id: "1" })
    expect(by.v2).toMatchObject({ method: "barcode", tier: "exact", parasut_product_id: "2" })
    expect(by.v3).toMatchObject({ method: "name_exact", tier: "high", parasut_product_id: "3" })
    expect(by.v4).toMatchObject({ method: "name_parent", tier: "high", parasut_product_id: "4" })
    expect(by.v5).toMatchObject({ method: "name_parent", tier: "high", parasut_product_id: "4" })
    expect(r.mapping).toEqual({ v1: "1", v2: "2", v3: "3", v4: "4", v5: "4" })
    expect(r.census).toMatchObject({
      parasut_total: 4,
      code_filled: 1,
      barcode_filled: 1,
      code_matches_medusa_sku: 1,
    })
  })

  it("single-variant 'Standart' matches by product title", () => {
    const r = matchVariantsToParasut(
      [mv({ variantId: "v", productTitle: "Rize Siyah Çay", variantTitle: "Standart" })],
      [pp({ id: "9", name: "RİZE SİYAH ÇAY" })]
    )
    expect(r.entries[0]).toMatchObject({ method: "name_exact", parasut_product_id: "9" })
  })

  it("never guesses: similar names stay unmatched, duplicate names are suspicious", () => {
    const r = matchVariantsToParasut(
      [
        mv({ variantId: "f", productTitle: "Rize Siyah Çay Özel Harman" }),
        mv({ variantId: "a", productTitle: "Aynı" }),
      ],
      [
        pp({ id: "1", name: "Rize Siyah Çay" }),
        pp({ id: "2", name: "Aynı" }),
        pp({ id: "3", name: "aynı" }),
      ]
    )
    const by = Object.fromEntries(r.entries.map((e) => [e.variant_id, e]))
    expect(by.f).toMatchObject({ method: "none", tier: "unmatched", parasut_product_id: null })
    expect(by.a).toMatchObject({ method: "name_exact", tier: "suspicious", parasut_product_id: null })
    expect(by.a.alternatives).toHaveLength(2)
    expect(r.mapping).toEqual({})
  })

  it("downgrades archived and cross-product duplicate matches", () => {
    const r = matchVariantsToParasut(
      [
        mv({ variantId: "x", productTitle: "Eski", sku: "OLD" }),
        mv({ variantId: "d1", productTitle: "P1", sku: "DUP", productId: "p1" }),
        mv({ variantId: "d2", productTitle: "P2", sku: "dup", productId: "p2" }),
      ],
      [pp({ id: "1", name: "Eski", code: "OLD", archived: true }), pp({ id: "2", name: "D", code: "DUP" })]
    )
    expect(r.entries.every((e) => e.tier === "suspicious")).toBe(true)
    expect(r.mapping).toEqual({})
  })

  it("flags price mismatch but keeps exact code match", () => {
    const r = matchVariantsToParasut(
      [mv({ variantId: "v", productTitle: "Yeşil Çay", sku: "ESC-YESIL-250", priceTry: 150 })],
      [pp({ id: "1", name: "Yeşil Çay", code: "ESC-YESIL-250", listPrice: 90, vatRate: 1 })]
    )
    expect(r.entries[0]).toMatchObject({ method: "code", tier: "exact" })
    expect(r.entries[0].price_check.ok).toBe(false)
    expect(r.entries[0].reasons.join(" ")).toMatch(/fiyat/)
  })

  it("flags shipping candidates and unmatched variants", () => {
    const r = matchVariantsToParasut(
      [mv({ variantId: "u", productTitle: "Yok Böyle Ürün" })],
      [pp({ id: "k", name: "Kargo Ücreti", vatRate: 20 }), pp({ id: "z", name: "Başka" })]
    )
    expect(r.unmatched.map((e) => e.variant_id)).toEqual(["u"])
    expect(r.shipping_candidates.map((p) => p.id)).toEqual(["k"])
    expect(r.unused_parasut_products).toHaveLength(2)
  })
})
