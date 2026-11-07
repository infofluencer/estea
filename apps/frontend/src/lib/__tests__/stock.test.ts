import { describe, expect, it } from "vitest"
import {
  CRITICAL_STOCK_THRESHOLD,
  LOW_STOCK_THRESHOLD,
  isProductSoldOut,
  isVariantInStock,
  lowStockLabelForProduct,
  lowStockLabelForQuantity,
  lowStockLabelForVariant,
  productTrackedStockTotal,
  trackedStockQuantity,
} from "../stock"

const tracked = (inventory_quantity: number | null) => ({
  manage_inventory: true,
  allow_backorder: false,
  inventory_quantity,
})

describe("isVariantInStock", () => {
  it("varyant yoksa stokta değil", () => {
    expect(isVariantInStock(null)).toBe(false)
    expect(isVariantInStock(undefined)).toBe(false)
  })

  it("stok takibi kapalı / ön sipariş açık → her zaman stokta", () => {
    expect(isVariantInStock({ manage_inventory: false, inventory_quantity: 0 })).toBe(true)
    expect(isVariantInStock({ manage_inventory: true, allow_backorder: true, inventory_quantity: -2 })).toBe(true)
  })

  it("adet bilinmiyorsa stokta varsayılır (yanlış Tükendi yok)", () => {
    expect(isVariantInStock(tracked(null))).toBe(true)
    expect(isVariantInStock({})).toBe(true)
  })

  it("takipli: > 0 stokta, 0 / negatif tükendi", () => {
    expect(isVariantInStock(tracked(1))).toBe(true)
    expect(isVariantInStock(tracked(0))).toBe(false)
    expect(isVariantInStock(tracked(-1))).toBe(false)
  })
})

describe("isProductSoldOut", () => {
  it("varyantsız ürün tükendi sayılmaz", () => {
    expect(isProductSoldOut([])).toBe(false)
    expect(isProductSoldOut(null)).toBe(false)
  })

  it("tüm varyantlar 0 ise tükendi, biri varsa değil", () => {
    expect(isProductSoldOut([tracked(0), tracked(-3)])).toBe(true)
    expect(isProductSoldOut([tracked(0), tracked(2)])).toBe(false)
  })
})

describe("düşük stok etiketi", () => {
  it("eşikler 5 / 3", () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5)
    expect(CRITICAL_STOCK_THRESHOLD).toBe(3)
  })

  it.each([
    [1, { kind: "critical", count: 1, text: "Son 1 adet" }],
    [3, { kind: "critical", count: 3, text: "Son 3 adet" }],
    [4, { kind: "low", text: "Tükeniyor" }],
    [5, { kind: "low", text: "Tükeniyor" }],
  ])("%i adet → etiket", (qty, label) => {
    expect(lowStockLabelForQuantity(qty)).toEqual(label)
  })

  it.each([0, -1, 6, 100, null, undefined])("%s → etiket yok", (qty) => {
    expect(lowStockLabelForQuantity(qty)).toBeNull()
  })

  it("trackedStockQuantity takipsiz/ön sipariş/bilinmeyende null", () => {
    expect(trackedStockQuantity(null)).toBeNull()
    expect(trackedStockQuantity({ manage_inventory: false, inventory_quantity: 2 })).toBeNull()
    expect(trackedStockQuantity({ allow_backorder: true, inventory_quantity: 2 })).toBeNull()
    expect(trackedStockQuantity(tracked(null))).toBeNull()
    expect(trackedStockQuantity(tracked(2))).toBe(2)
  })

  it("PDP: seçili varyant", () => {
    expect(lowStockLabelForVariant(tracked(2))).toEqual({ kind: "critical", count: 2, text: "Son 2 adet" })
    expect(lowStockLabelForVariant({ manage_inventory: false, inventory_quantity: 1 })).toBeNull()
  })
})

describe("ürün toplam stoğu (liste kartı)", () => {
  it("varyant adetlerini toplar, negatifi 0 sayar", () => {
    expect(productTrackedStockTotal([tracked(2), tracked(-4), tracked(1)])).toBe(3)
  })

  it("takipsiz, ön siparişli veya bilinmeyen varyant → null", () => {
    expect(productTrackedStockTotal([tracked(1), { manage_inventory: false }])).toBeNull()
    expect(productTrackedStockTotal([tracked(1), { allow_backorder: true, inventory_quantity: 0 }])).toBeNull()
    expect(productTrackedStockTotal([tracked(1), tracked(null)])).toBeNull()
    expect(productTrackedStockTotal([])).toBeNull()
  })

  it("tek ince varyant yerine toplam kullanılır", () => {
    // 1 + 10 = 11 → etiket yok (tek varyant "Son 1 adet" olsa da)
    expect(lowStockLabelForProduct([tracked(1), tracked(10)])).toBeNull()
    expect(lowStockLabelForProduct([tracked(2), tracked(2)])).toEqual({ kind: "low", text: "Tükeniyor" })
    expect(lowStockLabelForProduct([tracked(0), tracked(0)])).toBeNull()
  })
})
