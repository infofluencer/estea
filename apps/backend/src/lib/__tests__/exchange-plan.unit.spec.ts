import {
  exchangeChoices,
  exchangeDisplayState,
  isExchangeActive,
  planExchangeShipment,
  readExchange,
  validateExchangeChoices,
  variantAvailable,
} from "../exchange-plan"

const ex = {
  status: "requested" as const,
  items: [
    { item_id: "li_1", quantity: 2, variant_id: "var_L", title: "Siyah Çay", from_variant: "Kutu", to_variant: "Poşet", to_sku: "A-L" },
    { item_id: "li_2", quantity: 1, variant_id: "var_B", title: "Siyah Çay", from_variant: "500 g", to_variant: "1 kg", to_sku: null },
  ],
  source: "customer" as const,
  requested_at: "2026-10-21T10:00:00Z",
  by: null,
}

describe("readExchange / isExchangeActive", () => {
  it("metadata'dan okur, iptal edileni aktif saymaz", () => {
    expect(readExchange({ escay_exchange: ex })).toEqual(ex)
    expect(readExchange({})).toBeNull()
    expect(isExchangeActive({ escay_exchange: ex })).toBe(true)
    expect(isExchangeActive({ escay_exchange: { ...ex, status: "canceled" } })).toBe(false)
  })
})

describe("planExchangeShipment", () => {
  it("kabul edilen adet kadar yeni ürün (kısmi kabul)", () => {
    const plan = planExchangeShipment(
      ex,
      [
        { item_id: "li_1", quantity: 2, received_quantity: 1 },
        { item_id: "li_2", quantity: 1, received_quantity: 0 },
      ],
      "partially_received"
    )
    expect(plan).toEqual([{ item_id: "li_1", variant_id: "var_L", quantity: 1 }])
  })

  it("tam kabulde received_quantity boşsa talep adedi", () => {
    const plan = planExchangeShipment(ex, [{ item_id: "li_1", quantity: 2 }, { item_id: "li_2", quantity: 1 }], "received")
    expect(plan.map((p) => p.quantity)).toEqual([2, 1])
  })

  it("hiç kabul yoksa boş", () => {
    expect(planExchangeShipment(ex, [{ item_id: "li_1", quantity: 2, received_quantity: 0 }], "partially_received")).toEqual([])
  })
})

describe("variant choices", () => {
  const variants = [
    {
      id: "var_M",
      title: "500 g / Kutu",
      sku: "A-M",
      options: [{ value: "500 g", option: { title: "Gramaj" } }, { value: "Kutu", option: { title: "Paket" } }],
      inventory_items: [{ required_quantity: 1, inventory: { location_levels: [{ location_id: "loc", available_quantity: 3 }] } }],
    },
    {
      id: "var_L",
      title: "500 g / Poşet",
      sku: "A-L",
      options: [{ value: "500 g", option: { title: "Gramaj" } }, { value: "Poşet", option: { title: "Paket" } }],
      inventory_items: [{ required_quantity: 1, inventory: { location_levels: [{ location_id: "loc", available_quantity: 0 }] } }],
    },
    { id: "var_X", title: "Default", manage_inventory: false, inventory_items: [] },
  ]

  it("mevcut varyant hariç, stokla", () => {
    const choices = exchangeChoices(variants as never, "var_M", "loc")
    expect(choices.map((c) => [c.variant_id, c.title, c.available])).toEqual([
      ["var_L", "500 g / Poşet", 0],
      ["var_X", "var_X", null],
    ])
  })

  it("stok takibi yok → null, BigNumber nesnesi okunur", () => {
    expect(variantAvailable({ id: "v", manage_inventory: false } as never)).toBeNull()
    expect(
      variantAvailable(
        { id: "v", inventory_items: [{ inventory: { location_levels: [{ location_id: "loc", available_quantity: { value: "5" } }] } }] } as never,
        "loc"
      )
    ).toBe(5)
  })

  it("stok yetmezse / yabancı varyantsa hata; toplam adet aynı varyantta birleşir", () => {
    const choices = new Map([["li_1", exchangeChoices(variants as never, "var_M", "loc")]])
    expect(() => validateExchangeChoices([{ key: "li_1", quantity: 1, variant_id: "var_L" }], choices)).toThrow(/stokta yok/)
    expect(() => validateExchangeChoices([{ key: "li_1", quantity: 1, variant_id: "var_M" }], choices)).toThrow(/geçerli değil/)
    expect(() => validateExchangeChoices([{ key: "li_1", quantity: 2, variant_id: "var_X" }], choices)).not.toThrow()
    const stocked = new Map([["li_1", [{ variant_id: "v", title: "Poşet", sku: null, available: 2 }]]])
    expect(() =>
      validateExchangeChoices(
        [
          { key: "li_1", quantity: 1, variant_id: "v" },
          { key: "li_1", quantity: 2, variant_id: "v" },
        ],
        stocked
      )
    ).toThrow(/yalnız 2 adet/)
  })
})

describe("exchangeDisplayState", () => {
  it("iade bekleniyor → gönderi açılacak → etiket hazır → kargoda → teslim", () => {
    expect(exchangeDisplayState({ exchange: ex, returnReceived: false })).toBe("awaiting_return")
    expect(exchangeDisplayState({ exchange: ex, returnReceived: true })).toBe("to_ship")
    const shipped = { ...ex, status: "shipment_created" as const }
    expect(exchangeDisplayState({ exchange: shipped, returnReceived: true, shipment: {} })).toBe("label_ready")
    expect(exchangeDisplayState({ exchange: shipped, returnReceived: true, shipment: { shipped: true } })).toBe("shipped")
    expect(exchangeDisplayState({ exchange: shipped, returnReceived: true, shipment: { delivered: true } })).toBe("delivered")
    expect(exchangeDisplayState({ exchange: shipped, returnReceived: true, shipment: { canceled: true } })).toBe("to_ship")
  })

  it("iptal / red / hata", () => {
    expect(exchangeDisplayState({ exchange: { ...ex, status: "canceled" }, returnReceived: true })).toBe("canceled")
    expect(exchangeDisplayState({ exchange: ex, returnReceived: false, returnRejected: true })).toBe("rejected")
    expect(exchangeDisplayState({ exchange: { ...ex, status: "failed" }, returnReceived: true })).toBe("failed")
  })
})
