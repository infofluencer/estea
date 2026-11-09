import {
  buildStockBySku,
  computeInFlightBySku,
  computeStockPlan,
  extractRows,
  parseQuantity,
  toTrackedVariants,
  type TrackedVariant,
} from "../stock"

function variant(sku: string, stocked: number, reserved = 0): TrackedVariant {
  return { variantId: `v_${sku}`, sku, inventoryItemId: `i_${sku}`, locationId: "loc", stocked, reserved }
}

function plan(
  variants: TrackedVariant[],
  stock: [string, number][],
  inFlight: [string, number][] = [],
  maxZeroRatio = 0.5
) {
  return computeStockPlan({
    variants,
    stockBySku: new Map(stock),
    inFlightBySku: new Map(inFlight),
    maxZeroRatio,
  })
}

describe("extractRows", () => {
  const row = { code: "A" }

  it.each([
    ["düz dizi", [row]],
    ["data dizisi", { data: [row] }],
    ["iç içe sarmal", { resultCode: 1, errorText: "", data: { products: [row] } }],
  ])("%s", (_name, body) => {
    expect(extractRows(body)).toEqual([row])
  })

  it("boş listeyi boş döner", () => {
    expect(extractRows({ data: { products: [] } })).toEqual([])
  })

  it("hata metnini fırlatır", () => {
    expect(() => extractRows({ errorText: "Token geçersiz" })).toThrow("Token geçersiz")
  })

  it("birden çok dizide tahmin etmez", () => {
    expect(() => extractRows({ a: [row], b: [row] })).toThrow("birden çok")
  })

  it("dizisiz yanıtı reddeder", () => {
    expect(() => extractRows({ ok: true })).toThrow("satır dizisi yok")
  })
})

describe("parseQuantity", () => {
  it.each([
    [12, 12],
    ["12", 12],
    ["12,5", 12.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["0", 0],
  ])("%s → %s", (input, expected) => {
    expect(parseQuantity(input)).toBe(expected)
  })

  it.each([[null], [undefined], [""], ["yok"], [{}]])("%s okunamaz, 0 sayılmaz", (input) => {
    expect(parseQuantity(input)).toBeNull()
  })
})

describe("buildStockBySku", () => {
  it("SKU'yu normalize eder, alan adı büyük/küçük harf duyarsızdır", () => {
    const { bySku } = buildStockBySku([{ Code: " abc-1 ", Quantity: "5" }], [])
    expect(bySku.get("ABC-1")).toBe(5)
  })

  it("satırda kod yoksa ürün listesinden bulur", () => {
    const { bySku } = buildStockBySku(
      [{ productId: "p1", quantity: 3 }],
      [{ id: "p1", code: "A" }]
    )
    expect(bySku.get("A")).toBe(3)
  })

  it("alan adı ezilebilir", () => {
    const { bySku } = buildStockBySku([{ barcode: "869", adet: 4 }], [], {
      skuField: "barcode",
      quantityField: "adet",
    })
    expect(bySku.get("869")).toBe(4)
  })

  it("miktarı okunamayan ürünü dışarıda bırakır", () => {
    const parsed = buildStockBySku(
      [
        { code: "A", quantity: "?" },
        { code: "B", quantity: 1 },
      ],
      []
    )
    expect(parsed.invalidQuantity).toEqual(["A"])
    expect(parsed.bySku.has("A")).toBe(false)
  })

  it("mükerrer SKU'yu tümden dışarıda bırakır", () => {
    const parsed = buildStockBySku(
      [
        { code: "A", quantity: 1 },
        { code: "A", quantity: 9 },
        { code: "B", quantity: 1 },
      ],
      []
    )
    expect(parsed.duplicates).toEqual(["A"])
    expect(parsed.bySku.has("A")).toBe(false)
  })

  it("alanlar tanınmazsa gelen alanları söyleyerek durur", () => {
    expect(() => buildStockBySku([{ foo: 1, bar: 2 }], [])).toThrow("foo, bar")
  })
})

describe("computeInFlightBySku", () => {
  const item = (fulfilled: number, received = 0) => ({
    variant_sku: "a",
    detail: { fulfilled_quantity: fulfilled, return_received_quantity: received },
  })
  const live = { bizimhesap_invoice: { status: "created", mode: "live" } }

  it("kargolanmış, faturası kesilmemiş adedi sayar", () => {
    expect(computeInFlightBySku([{ items: [item(2)] }]).get("A")).toBe(2)
  })

  it("canlı faturası kesilmişse saymaz (stok BizimHesap'tan düştü)", () => {
    expect(computeInFlightBySku([{ metadata: live, items: [item(2)] }]).size).toBe(0)
  })

  it.each(["unknown", "error", "pending", "dry_run"])("fatura %s ise yolda sayar", (status) => {
    const metadata = { bizimhesap_invoice: { status, mode: "live" } }
    expect(computeInFlightBySku([{ metadata, items: [item(1)] }]).get("A")).toBe(1)
  })

  it("mock fatura BizimHesap'a düşmediğinden yolda sayar", () => {
    const metadata = { bizimhesap_invoice: { status: "created", mode: "mock" } }
    expect(computeInFlightBySku([{ metadata, items: [item(1)] }]).get("A")).toBe(1)
  })

  it("teslim alınan iadeyi düşer, iptal siparişi saymaz", () => {
    expect(computeInFlightBySku([{ items: [item(3, 1)] }]).get("A")).toBe(2)
    expect(computeInFlightBySku([{ status: "canceled", items: [item(3)] }]).size).toBe(0)
  })
})

describe("toTrackedVariants", () => {
  const level = { location_id: "l1", stocked_quantity: 4, reserved_quantity: 1 }
  const link = (levels: unknown[], required = 1) => ({
    inventory_item_id: "i1",
    required_quantity: required,
    inventory: { location_levels: levels as (typeof level)[] },
  })

  it("tek konumlu varyantı alır", () => {
    const { tracked } = toTrackedVariants([{ id: "v", sku: "A", inventory_items: [link([level])] }])
    expect(tracked[0]).toMatchObject({ sku: "A", locationId: "l1", stocked: 4, reserved: 1 })
  })

  it("stok takibi kapalıysa sessizce geçer", () => {
    const r = toTrackedVariants([{ id: "v", sku: "A", manage_inventory: false }])
    expect(r.tracked).toEqual([])
    expect(r.skipped).toEqual([])
  })

  it("SKU'suz ve paket varyantı atlar", () => {
    const { skipped } = toTrackedVariants([
      { id: "v1", sku: "", inventory_items: [link([level])] },
      { id: "v2", sku: "B", inventory_items: [link([level], 2)] },
    ])
    expect(skipped.map((s) => s.reason)).toEqual(["SKU yok", "tek envanter kalemine 1:1 bağlı değil"])
  })

  it("birden çok konumda seçim ister, verilirse o konumu alır", () => {
    const other = { ...level, location_id: "l2", stocked_quantity: 9 }
    const row = { id: "v", sku: "A", inventory_items: [link([level, other])] }
    expect(toTrackedVariants([row]).skipped[0].reason).toContain("BIZIMHESAP_STOCK_LOCATION_ID")
    expect(toTrackedVariants([row], "l2").tracked[0].stocked).toBe(9)
  })
})

describe("computeStockPlan", () => {
  it("farkı değişiklik olarak çıkarır, kesri aşağı yuvarlar", () => {
    const p = plan([variant("A", 3)], [["A", 7.9]])
    expect(p.changes[0]).toMatchObject({ from: 3, to: 7, bizimhesap: 7.9 })
  })

  it("aynı değerde yazmaz", () => {
    const p = plan([variant("A", 3)], [["A", 3]])
    expect(p.changes).toEqual([])
    expect(p.unchanged).toBe(1)
  })

  it("yolda olan adedi düşer", () => {
    expect(plan([variant("A", 9)], [["A", 10]], [["A", 2]]).changes[0].to).toBe(8)
  })

  it("rezerve adedi düşmez, altına inerse raporlar", () => {
    const p = plan([variant("A", 5, 3)], [["A", 2]])
    expect(p.changes[0].to).toBe(2)
    expect(p.oversold).toEqual([{ sku: "A", target: 2, reserved: 3 }])
  })

  it("eksi stok ve fazla yolda adet 0'a kırpılır", () => {
    expect(plan([variant("A", 1)], [["A", -4]]).changes[0].to).toBe(0)
    expect(plan([variant("A", 1)], [["A", 1]], [["A", 5]]).changes[0].to).toBe(0)
  })

  it("BizimHesap'ta olmayan SKU sıfırlanmaz", () => {
    const p = plan([variant("A", 5)], [["B", 1]])
    expect(p.changes).toEqual([])
    expect(p.missing).toEqual(["A"])
  })

  it("SKU'yu büyük/küçük harf duyarsız eşler", () => {
    expect(plan([variant("abc", 1)], [["ABC", 2]]).matched).toBe(1)
  })

  describe("toplu sıfırlama koruması", () => {
    const six = ["A", "B", "C", "D", "E", "F"].map((s) => variant(s, 5))
    const zero = (n: number) => six.map((v, i): [string, number] => [v.sku, i < n ? 0 : 5])

    it("sınırda çalışır", () => {
      expect(plan(six, zero(3)).zeroGuardTripped).toBe(false)
    })

    it("sınır aşılınca durur", () => {
      expect(plan(six, zero(4)).zeroGuardTripped).toBe(true)
    })

    it("oran 1 ile kapanır", () => {
      expect(plan(six, zero(6), [], 1).zeroGuardTripped).toBe(false)
    })

    it("küçük katalogda 2 ürünün tükenmesi tetiklemez", () => {
      expect(plan([variant("A", 1), variant("B", 1)], [["A", 0], ["B", 0]]).zeroGuardTripped).toBe(false)
    })

    it("zaten sıfır olan ürünü saymaz", () => {
      expect(plan(six.map((v) => ({ ...v, stocked: 0 })), zero(6)).newlyZero).toBe(0)
    })
  })
})
