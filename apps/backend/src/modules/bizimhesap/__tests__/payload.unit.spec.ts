import {
  buildAddInvoicePayload,
  formatBizimhesapDate,
  mapMedusaTaxRateToVat,
  toBizimhesapCurrency,
} from "../payload"

const customer = { customerId: "cus_1", title: "Ayşe Yılmaz", address: "Adres" }

describe("mapMedusaTaxRateToVat", () => {
  it("%1 çay oranını %100 yapmaz", () => {
    expect(mapMedusaTaxRateToVat(1, 20)).toBe(1)
    expect(mapMedusaTaxRateToVat(20, 1)).toBe(20)
    expect(mapMedusaTaxRateToVat(0.2, 1)).toBe(20)
    expect(mapMedusaTaxRateToVat(null, 1)).toBe(1)
  })
})

describe("toBizimhesapCurrency", () => {
  it("TRY → TL, desteklenmeyeni reddeder", () => {
    expect(toBizimhesapCurrency("try")).toBe("TL")
    expect(toBizimhesapCurrency(null)).toBe("TL")
    expect(toBizimhesapCurrency("EUR")).toBe("EUR")
    expect(() => toBizimhesapCurrency("JPY")).toThrow()
  })
})

describe("formatBizimhesapDate", () => {
  it("İstanbul saatiyle +03:00 yazar", () => {
    expect(formatBizimhesapDate(new Date("2026-11-03T14:49:10.000Z"))).toBe(
      "2026-11-03T17:49:10.000+03:00"
    )
  })
})

describe("buildAddInvoicePayload", () => {
  it("#100001: 35,00 çay + 149,90 kargo = 184,90, oranlar ayrı", () => {
    const { payload, total } = buildAddInvoicePayload({
      firmId: "F",
      invoiceNo: "100001",
      customer,
      lines: [
        {
          productId: "ESC-PAPATYA-BP",
          productName: "Papatya Çayı",
          vatRate: 1,
          quantity: 1,
          grossUnitPrice: 35,
        },
      ],
      shipping: { grossAmount: 149.9, vatRate: 20 },
    })

    expect(total).toBe(184.9)
    expect(payload.invoiceType).toBe(3)
    expect(payload.amounts).toEqual({
      currency: "TL",
      gross: "159.57",
      discount: "0.00",
      net: "159.57",
      tax: "25.33",
      total: "184.90",
    })
    expect(payload.details[0]).toMatchObject({
      taxRate: "1.00",
      net: "34.65",
      tax: "0.35",
      total: "35.00",
    })
    expect(payload.details[1]).toMatchObject({
      productId: "KARGO",
      taxRate: "20.00",
      net: "124.92",
      tax: "24.98",
      total: "149.90",
    })
  })

  it("adet × fiyat yuvarlaması dip toplamı kaydırmaz", () => {
    const { payload, total } = buildAddInvoicePayload({
      firmId: "F",
      invoiceNo: "1",
      customer,
      lines: [
        { productId: "A", productName: "A", vatRate: 1, quantity: 3, grossUnitPrice: 33.33 },
        { productId: "B", productName: "B", vatRate: 1, quantity: 7, grossUnitPrice: 17.77 },
      ],
    })
    expect(total).toBe(224.38)
    const net = Number(payload.amounts.net)
    const tax = Number(payload.amounts.tax)
    expect(Math.round((net + tax) * 100) / 100).toBe(224.38)
  })

  it("indirim brütten düşer, net + vergi indirimli toplama eşittir", () => {
    const { payload, total } = buildAddInvoicePayload({
      firmId: "F",
      invoiceNo: "2",
      customer,
      lines: [
        {
          productId: "A",
          productName: "A",
          vatRate: 1,
          quantity: 2,
          grossUnitPrice: 100,
          discountGross: 20,
        },
      ],
    })
    expect(total).toBe(180)
    expect(payload.details[0]).toMatchObject({
      grossPrice: "198.02",
      discount: "19.80",
      net: "178.22",
      tax: "1.78",
      total: "180.00",
    })
  })

  it("binlik ayraç kullanmaz, boş müşteri alanlarını göndermez", () => {
    const { payload } = buildAddInvoicePayload({
      firmId: "F",
      invoiceNo: "3",
      customer: { ...customer, taxNo: null, email: "", phone: undefined },
      lines: [
        { productId: "A", productName: "A", vatRate: 1, quantity: 1, grossUnitPrice: 2400 },
      ],
    })
    expect(payload.amounts.total).toBe("2400.00")
    expect(payload.customer).toEqual({
      customerId: "cus_1",
      title: "Ayşe Yılmaz",
      address: "Adres",
    })
  })

  it("satırsız faturayı reddeder", () => {
    expect(() =>
      buildAddInvoicePayload({ firmId: "F", invoiceNo: "4", customer, lines: [] })
    ).toThrow("Fatura satırı yok")
  })
})
