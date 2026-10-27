import {
  buildParasutInternetSale,
  estimateGrossFromParasutLines,
  grossToNet,
  mapMedusaTaxRateToParasutVat,
  netToGross,
  toParasutAmount,
} from "../../../lib/parasut-invoice"
import {
  buildSalesInvoicePayload,
  estimatePayloadNetTotal,
} from "../payload"

describe("toParasutAmount", () => {
  it("rounds major-unit amounts to 2 decimals (no ×100)", () => {
    expect(toParasutAmount(999)).toBe(999)
    expect(toParasutAmount("1499.5")).toBe(1499.5)
    expect(toParasutAmount(10.999)).toBe(11)
    expect(toParasutAmount(null)).toBe(0)
    expect(toParasutAmount(1689.29)).toBe(1689.29)
  })
})

describe("mapMedusaTaxRateToParasutVat", () => {
  it("maps fraction and percent forms", () => {
    expect(mapMedusaTaxRateToParasutVat(0.1, 10)).toBe(10)
    expect(mapMedusaTaxRateToParasutVat(0.2, 10)).toBe(20)
    expect(mapMedusaTaxRateToParasutVat(10, 10)).toBe(10)
    expect(mapMedusaTaxRateToParasutVat(20, 10)).toBe(20)
    expect(mapMedusaTaxRateToParasutVat(undefined, 10)).toBe(10)
  })
})

describe("grossToNet / netToGross (KDV dahil → hariç)", () => {
  it("converts tax-inclusive unit price at 10%", () => {
    // Müşteri 1409.29 ödüyor (örnek ekran) — net + KDV = brüt
    const gross = 1409.29
    const net = grossToNet(gross, 10)
    expect(net).toBe(1281.17)
    expect(netToGross(net, 10)).toBe(1409.29)
  })

  it("round-trips 114.48 VAT note style amounts", () => {
    // 114.48 KDV dahil brüt içindeki KDV payı ≈ 10.407 → net ≈ 104.07
    const gross = 114.48
    const net = grossToNet(gross, 10)
    expect(net).toBe(104.07)
    expect(netToGross(net, 10)).toBe(114.48)
  })

  it("handles 20% VAT", () => {
    const gross = 120
    const net = grossToNet(gross, 20)
    expect(net).toBe(100)
    expect(netToGross(net, 20)).toBe(120)
  })

  it("shipping 149.99 inclusive at 20% → net 124.99 + KDV 25.00", () => {
    // Canlı Parasut fatura kanıtı
    const gross = 149.99
    const net = grossToNet(gross, 20)
    expect(net).toBe(124.99)
    const vat = Math.round((netToGross(net, 20) - net) * 100) / 100
    expect(vat).toBe(25)
    expect(netToGross(net, 20)).toBe(149.99)
  })

  it("line 10% + shipping 20% estimate matches customer payment", () => {
    // Ürün 1259.30 (%10) + kargo 149.99 (%20) = 1409.29 (KDV dahil)
    const productGross = 1259.3
    const shippingGross = 149.99
    const productNet = grossToNet(productGross, 10)
    const shippingNet = grossToNet(shippingGross, 20)
    expect(shippingNet).toBe(124.99)
    const estimated = estimateGrossFromParasutLines({
      lines: [
        {
          description: "Siyah Çay",
          quantity: 1,
          unitPrice: productNet,
          vatRate: 10,
        },
      ],
      shipping: { amount: shippingNet, vatRate: 20 },
    })
    expect(estimated).toBe(1409.29)
  })

  it("applies line discount in net without double-counting VAT", () => {
    const grossUnit = 1100
    const grossDiscPerUnit = 110
    const vat = 10
    const netUnit = grossToNet(grossUnit, vat)
    const netDisc = grossToNet(grossDiscPerUnit, vat)
    const estimated = estimateGrossFromParasutLines({
      lines: [
        {
          description: "Ürün",
          quantity: 1,
          unitPrice: netUnit,
          vatRate: vat,
          discountValue: netDisc,
        },
      ],
    })
    // (1100 - 110) = 990 brüt
    expect(estimated).toBe(990)
  })
})

describe("buildSalesInvoicePayload", () => {
  it("keeps major-unit prices, line discount, and separate shipping", () => {
    const body = buildSalesInvoicePayload({
      contactId: "c1",
      orderId: "o1",
      orderDisplayId: "ESC-1",
      currencyCode: "try",
      lines: [
        {
          description: "Siyah Çay",
          quantity: 1,
          unitPrice: 999,
          vatRate: 10,
          discountValue: 99.9,
        },
      ],
      shipping: { description: "Kargo", amount: 124.99, vatRate: 20 },
    })
    const details = body.data.relationships.details.data
    expect(details).toHaveLength(2)
    expect(details[0].attributes.unit_price).toBe(999)
    expect(details[0].attributes.discount_type).toBe("amount")
    expect(details[0].attributes.discount_value).toBe(99.9)
    expect(details[1].attributes.description).toBe("Kargo")
    expect(details[1].attributes.unit_price).toBe(124.99)
    expect(details[1].attributes.vat_rate).toBe(20)
    expect(body.data.attributes.currency).toBe("TRL")
    expect(estimatePayloadNetTotal(body)).toBe(1024.09)
  })
})

describe("buildParasutInternetSale (canlı şablon)", () => {
  it("uses KREDIKARTI/BANKAKARTI and PayTR — not short KREDIKARTI", () => {
    const sale = buildParasutInternetSale("2026-09-23")
    expect(sale.payment_type).toBe("KREDIKARTI/BANKAKARTI")
    expect(sale.payment_type).not.toBe("KREDIKARTI")
    expect(sale.payment_platform).toBe("PayTR")
    expect(sale.payment_date).toBe("2026-09-23")
    expect(sale.url).toMatch(/^https?:\/\//)
    expect(sale.send_date).toBeUndefined()
  })

  it("havale siparişi → EFT/HAVALE, aracı banka adı", () => {
    const prev = process.env.BANK_TRANSFER_BANK_NAME
    process.env.BANK_TRANSFER_BANK_NAME = "Ziraat Bankası"
    try {
      const sale = buildParasutInternetSale("2026-10-08", { bankTransfer: true })
      expect(sale.payment_type).toBe("EFT/HAVALE")
      expect(sale.payment_platform).toBe("Ziraat Bankası")
    } finally {
      if (prev === undefined) delete process.env.BANK_TRANSFER_BANK_NAME
      else process.env.BANK_TRANSFER_BANK_NAME = prev
    }
  })

  it("PARASUT_INTERNET_SALE_URL, STOREFRONT_URL'den (geçiş öncesi IP) önce gelir", () => {
    const prev = {
      sale: process.env.PARASUT_INTERNET_SALE_URL,
      storefront: process.env.STOREFRONT_URL,
    }
    process.env.STOREFRONT_URL = "http://187.127.86.214:3015"
    process.env.PARASUT_INTERNET_SALE_URL = "https://market.esteacay.com/"
    try {
      expect(buildParasutInternetSale("2026-10-06").url).toBe("https://market.esteacay.com")
      delete process.env.PARASUT_INTERNET_SALE_URL
      expect(buildParasutInternetSale("2026-10-06").url).toBe("http://187.127.86.214:3015")
    } finally {
      if (prev.sale === undefined) delete process.env.PARASUT_INTERNET_SALE_URL
      else process.env.PARASUT_INTERNET_SALE_URL = prev.sale
      if (prev.storefront === undefined) delete process.env.STOREFRONT_URL
      else process.env.STOREFRONT_URL = prev.storefront
    }
  })
})
