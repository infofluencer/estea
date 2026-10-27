import {
  matchVariantsToParasut,
  nameSimilarity,
  normalizeName,
  priceMatches,
  type MedusaVariantRow,
} from "../parasut-product-match"
import type { ParasutProductRecord } from "../../modules/parasut/types"

function pp(p: Partial<ParasutProductRecord> & { id: string; name: string }): ParasutProductRecord {
  return {
    code: null,
    barcode: null,
    vatRate: 10,
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

describe("normalizeName / similarity / price", () => {
  it("folds Turkish chars, case and punctuation", () => {
    expect(normalizeName("İPEK Şal - Çiçek, Gül")).toBe("ipek sal cicek gul")
    expect(normalizeName("Işıl  Ağaç")).toBe("isil agac")
  })
  it("scores token overlap", () => {
    expect(nameSimilarity("Enderun Şal Siyah", "enderun sal siyah")).toBe(1)
    expect(nameSimilarity("Enderun Şal", "Dersaadet Tablo")).toBe(0)
  })
  it("accepts net or gross list price within 2%", () => {
    expect(priceMatches(1100, 1100, 10)).toBe(true)
    expect(priceMatches(1100, 1000, 10)).toBe(true)
    expect(priceMatches(1100, 700, 10)).toBe(false)
    expect(priceMatches(1100, null, 10)).toBeNull()
  })
})

describe("matchVariantsToParasut", () => {
  it("uses code, then barcode, then variant name, then parent name", () => {
    const products = [
      pp({ id: "1", name: "X", code: "MK2503" }),
      pp({ id: "2", name: "Y", barcode: "MK2505-2" }),
      pp({ id: "3", name: "Enderun Şal - Siyah" }),
      pp({ id: "4", name: "Dersaadet" }),
    ]
    const variants = [
      mv({ variantId: "v1", productTitle: "A", sku: "MK2503" }),
      mv({ variantId: "v2", productTitle: "B", sku: "MK2505-2" }),
      mv({
        variantId: "v3",
        productTitle: "Enderun Şal",
        variantTitle: "Siyah",
        variantCount: 2,
      }),
      mv({
        variantId: "v4",
        productTitle: "Dersaadet",
        productId: "p_d",
        variantTitle: "Lale",
        variantCount: 2,
      }),
      mv({
        variantId: "v5",
        productTitle: "Dersaadet",
        productId: "p_d",
        variantTitle: "Amber",
        variantCount: 2,
      }),
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
      [mv({ variantId: "v", productTitle: "Tunel Şal", variantTitle: "Standart" })],
      [pp({ id: "9", name: "TÜNEL ŞAL" })]
    )
    expect(r.entries[0]).toMatchObject({ method: "name_exact", parasut_product_id: "9" })
  })

  it("never maps fuzzy or ambiguous names; lists them as suspicious", () => {
    const r = matchVariantsToParasut(
      [
        mv({ variantId: "f", productTitle: "Enderun İpek Şal Siyah Model" }),
        mv({ variantId: "a", productTitle: "Aynı" }),
      ],
      [
        pp({ id: "1", name: "Enderun İpek Şal Siyah" }),
        pp({ id: "2", name: "Aynı" }),
        pp({ id: "3", name: "aynı" }),
      ]
    )
    const by = Object.fromEntries(r.entries.map((e) => [e.variant_id, e]))
    expect(by.f).toMatchObject({ method: "name_fuzzy", tier: "suspicious", parasut_product_id: "1" })
    expect(by.a).toMatchObject({ tier: "suspicious", parasut_product_id: null })
    expect(by.a.alternatives).toHaveLength(2)
    expect(r.mapping).toEqual({})
  })

  it("downgrades archived and cross-product duplicate matches", () => {
    const r = matchVariantsToParasut(
      [
        mv({ variantId: "x", productTitle: "Old", sku: "OLD" }),
        mv({ variantId: "d1", productTitle: "P1", sku: "DUP", productId: "p1" }),
        mv({ variantId: "d2", productTitle: "P2", sku: "dup", productId: "p2" }),
      ],
      [pp({ id: "1", name: "Old", code: "OLD", archived: true }), pp({ id: "2", name: "D", code: "DUP" })]
    )
    expect(r.entries.every((e) => e.tier === "suspicious")).toBe(true)
    expect(r.mapping).toEqual({})
  })

  it("picks current-name generation over older 'Yün İpek' records (real Parasut names)", () => {
    const products = [
      pp({ id: "1057775896", name: "Buhara Yün İpek Omuz Şal Buhara / Vizon", salesInvoiceDetailsCount: 129 }),
      pp({ id: "1063836605", name: "Buhara Yün İpek Omuz Şal - Vizon Buhara / Vizon", salesInvoiceDetailsCount: 9 }),
      pp({ id: "1066466419", name: "Buhara   Omuz Şal - Vizon Buhara / Vizon", salesInvoiceDetailsCount: 2 }),
      pp({ id: "1057776481", name: "Sarmaşık Fureya Eşarp Sarmaşık Fureya / Soft Mercan" }),
      pp({ id: "1063836786", name: "Sarmaşık Fureya Eşarp - Soft Mercan Sarmaşık Fureya / Soft Mercan" }),
      pp({ id: "1068678249", name: "Terra Harmonia   Şal - Kül Kahve Terra Harmonia / Kül Kahve" }),
      pp({ id: "1075355455", name: "Terra Harmonia Şal - Kül Kahve Terra Harmonia / Kül Kahve" }),
      pp({ id: "1068677594", name: "Düz   Şal - Gri Düz Şal / Gri" }),
      pp({ id: "1068678685", name: "Düz   Şal - Duman Gri Düz Şal / Duman Gri" }),
    ]
    const variants = [
      mv({ variantId: "buhara", productTitle: "Buhara Omuz Şal", productId: "b", variantTitle: "Vizon", variantCount: 4 }),
      mv({ variantId: "fureya", productTitle: "Sarmaşık Fureya Eşarp", productId: "f", variantTitle: "Soft Mercan", variantCount: 4 }),
      mv({ variantId: "terra", productTitle: "Terra Harmonia Şal", productId: "t", variantTitle: "Kül Kahve", variantCount: 8 }),
      mv({ variantId: "duz-gri", productTitle: "Düz Şal", productId: "d", variantTitle: "Gri", variantCount: 8 }),
      mv({ variantId: "duz-duman", productTitle: "Düz Şal", productId: "d", variantTitle: "Duman Gri", variantCount: 8 }),
    ]
    const r = matchVariantsToParasut(variants, products)
    expect(r.mapping).toEqual({
      buhara: "1066466419",
      fureya: "1063836786",
      terra: "1075355455",
      "duz-gri": "1068677594",
      "duz-duman": "1068678685",
    })
    const by = Object.fromEntries(r.entries.map((e) => [e.variant_id, e]))
    expect(by.buhara).toMatchObject({ method: "name_current", tier: "high" })
    expect(by.terra.reasons[0]).toMatch(/en yeni id/)
  })

  it("falls back to most-invoiced old generation as suspicious (not mapped)", () => {
    const r = matchVariantsToParasut(
      [mv({ variantId: "k", productTitle: "Kamara Omuz Şal", variantTitle: "Vizon", variantCount: 2 })],
      [
        pp({ id: "1057777437", name: "Kamara Yün İpek Omuz Şal Kamara / Vizon", salesInvoiceDetailsCount: 50 }),
        pp({ id: "1066457214", name: "Kamara Yün İpek Omuz Şal - Vizon Kamara / Vizon", salesInvoiceDetailsCount: 5 }),
        pp({ id: "1066466419", name: "Buhara   Omuz Şal - Vizon Buhara / Vizon" }),
      ]
    )
    expect(r.entries[0]).toMatchObject({
      method: "name_family",
      tier: "suspicious",
      parasut_product_id: "1057777437",
    })
    expect(r.mapping).toEqual({})
  })

  it("does not cross product type when color differs (Ada Sarayı tablo vs şal)", () => {
    const r = matchVariantsToParasut(
      [mv({ variantId: "a", productTitle: "Ada Sarayı", variantTitle: "Siyah Tablo" })],
      [pp({ id: "1063838303", name: "Ada Sarayı Omuz Şal - Siyah Ada Sarayı / Siyah" })]
    )
    expect(r.entries[0].method).not.toBe("name_current")
    expect(r.entries[0].method).not.toBe("name_family")
    expect(r.mapping).toEqual({})
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
