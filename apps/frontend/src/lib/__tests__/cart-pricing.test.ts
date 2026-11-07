import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CART_SHIPPING_PRICE,
  VAT_RATE,
  computeCartDisplayTotals,
  includedVatFromGross,
  productSubtotalFromCart,
  roundMoney,
} from "../cart-pricing"

afterEach(() => {
  vi.resetModules()
})

describe("varsayılanlar (env yok)", () => {
  it("KDV %1, yedek kargo 99,90 TL", () => {
    expect(VAT_RATE).toBe(1)
    expect(CART_SHIPPING_PRICE).toBe(99.9)
  })
})

describe("roundMoney", () => {
  it("kuruşa yuvarlar", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(19.999)).toBe(20)
    expect(roundMoney(149.904)).toBe(149.9)
    expect(roundMoney(149.906)).toBe(149.91)
    expect(roundMoney(0)).toBe(0)
  })

  // HATA: Math.round(x * 100) / 100 kayan nokta temsili yüzünden yarım kuruşu
  // aşağı yuvarlıyor (1.005 * 100 === 100.49999999999999). Beklenen 1.01.
  it.fails("yarım kuruşu yukarı yuvarlar (1,005 → 1,01)", () => {
    expect(roundMoney(1.005)).toBe(1.01)
  })
})

describe("includedVatFromGross (%1 KDV)", () => {
  it("KDV dahil tutardan içerdiği KDV'yi çıkarır", () => {
    expect(includedVatFromGross(101)).toBe(1)
    expect(includedVatFromGross(250)).toBe(2.48) // 250 / 101 = 2.4752…
    expect(includedVatFromGross(99.9)).toBe(0.99)
  })

  it("sıfır / negatif / NaN → 0", () => {
    expect(includedVatFromGross(0)).toBe(0)
    expect(includedVatFromGross(-50)).toBe(0)
    expect(includedVatFromGross(Number.NaN)).toBe(0)
  })
})

describe("computeCartDisplayTotals", () => {
  it("kargo tahmini yoksa yedek ücret eklenir", () => {
    expect(computeCartDisplayTotals(250)).toEqual({
      subtotal: 250,
      shipping: 99.9,
      total: 349.9,
      includedVat: 2.48,
    })
    expect(computeCartDisplayTotals(250, null).shipping).toBe(99.9)
  })

  it("ücretsiz kargo (0) yedek ücrete düşmez", () => {
    expect(computeCartDisplayTotals(250, 0)).toEqual({
      subtotal: 250,
      shipping: 0,
      total: 250,
      includedVat: 2.48,
    })
  })

  it("kargo tahmini yuvarlanır, NaN tahmin yedeğe düşer", () => {
    expect(computeCartDisplayTotals(100.004, 49.899).total).toBe(149.9)
    expect(computeCartDisplayTotals(100, Number.NaN).shipping).toBe(99.9)
    expect(computeCartDisplayTotals(100, Number.POSITIVE_INFINITY).shipping).toBe(99.9)
  })

  it("boş sepet: ara toplam 0, KDV 0, yalnız kargo", () => {
    expect(computeCartDisplayTotals(0)).toEqual({
      subtotal: 0,
      shipping: 99.9,
      total: 99.9,
      includedVat: 0,
    })
  })

  it("kayan nokta toplamı kuruşta kalır", () => {
    expect(computeCartDisplayTotals(0.1 + 0.2, 0.1).total).toBe(0.4)
  })
})

describe("productSubtotalFromCart", () => {
  it("item_total önceliklidir ve yuvarlanır", () => {
    expect(
      productSubtotalFromCart({ item_total: 100.456, item_subtotal: 50, subtotal: 10 })
    ).toBe(100.46)
  })

  it("item_total yoksa item_subtotal, o da yoksa subtotal", () => {
    expect(productSubtotalFromCart({ item_total: null, item_subtotal: 80 })).toBe(80)
    expect(productSubtotalFromCart({ subtotal: 70 })).toBe(70)
  })

  it("item_total 0 ise 0 döner (kalemlere bakmaz)", () => {
    expect(
      productSubtotalFromCart({ item_total: 0, items: [{ subtotal: 50 }] })
    ).toBe(0)
  })

  it("toplam alanı yoksa kalemlerden hesaplar", () => {
    expect(
      productSubtotalFromCart({
        items: [
          { subtotal: 149.9 },
          { unit_price: 74.95, quantity: 2 },
          { unit_price: 10, quantity: 0 },
          { unit_price: 10, quantity: -3 },
          { unit_price: null, quantity: 5 },
        ],
      })
    ).toBe(299.8)
  })

  it("sayı olmayan toplam alanı kalemlere düşer", () => {
    expect(
      productSubtotalFromCart({
        item_total: "abc" as unknown as number,
        items: [{ unit_price: 12.5, quantity: 3 }],
      })
    ).toBe(37.5)
  })

  it("boş / kalemsiz sepet → 0", () => {
    expect(productSubtotalFromCart({})).toBe(0)
    expect(productSubtotalFromCart({ items: null })).toBe(0)
    expect(productSubtotalFromCart({ items: [] })).toBe(0)
  })
})

describe("env ile yapılandırma", () => {
  it("NEXT_PUBLIC_VAT_RATE=20 → %20 KDV", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAT_RATE", "20")
    vi.stubEnv("NEXT_PUBLIC_SHIPPING_FALLBACK_PRICE", "0")
    const m = await import("../cart-pricing")
    expect(m.VAT_RATE).toBe(20)
    expect(m.includedVatFromGross(120)).toBe(20)
    expect(m.computeCartDisplayTotals(120).total).toBe(120)
  })

  // HATA: `Number(process.env.X ?? 1)` — boş string (Docker ARG değersiz geçilince)
  // `??`'den geçer ve Number("") === 0 olur: KDV sessizce %0'a düşer.
  it.fails("boş NEXT_PUBLIC_VAT_RATE varsayılan %1'e düşer", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAT_RATE", "")
    const m = await import("../cart-pricing")
    expect(m.VAT_RATE).toBe(1)
  })

  // Aynı kalıp: boş NEXT_PUBLIC_SHIPPING_FALLBACK_PRICE yedek kargoyu 0 TL gösterir.
  it.fails("boş NEXT_PUBLIC_SHIPPING_FALLBACK_PRICE varsayılan 99,90'a düşer", async () => {
    vi.stubEnv("NEXT_PUBLIC_SHIPPING_FALLBACK_PRICE", "")
    const m = await import("../cart-pricing")
    expect(m.CART_SHIPPING_PRICE).toBe(99.9)
  })

  // Geçersiz değer NaN üretir ve tüm toplamlar NaN olur.
  it("geçersiz KDV değeri NaN üretir (mevcut davranış)", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAT_RATE", "yüzde-bir")
    const m = await import("../cart-pricing")
    expect(Number.isNaN(m.includedVatFromGross(100))).toBe(true)
  })
})
