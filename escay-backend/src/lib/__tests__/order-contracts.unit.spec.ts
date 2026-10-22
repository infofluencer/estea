import { PDFDocument } from "pdf-lib"

import { contractSections } from "@escay/shared/legal-contracts"

import {
  contractDataFromOrder,
  isOrderContractKind,
  orderContractKey,
  renderOrderContractPdf,
  type ContractOrder,
} from "../order-contracts"

const order: ContractOrder = {
  id: "order_01TEST",
  display_id: 1234,
  email: "ayse@example.com",
  currency_code: "try",
  created_at: "2026-10-16T10:00:00Z",
  total: 2149.9,
  item_total: 2199.9,
  shipping_total: 0,
  discount_total: 50,
  metadata: { payment_method: "card" },
  shipping_address: {
    first_name: "Ayşe",
    last_name: "Yılmaz",
    address_1: "Çiçek Sok. No: 5 D: 3",
    city: "Kadıköy",
    province: "İstanbul",
    postal_code: "34710",
    phone: "05551112233",
  },
  billing_address: null,
  items: [
    { product_title: "İpek Eşarp Şakayık", variant_title: "Lacivert", variant_sku: "MR-1001", quantity: 1, unit_price: 1299.9, total: 1299.9 },
    { product_title: "Pamuk Şal Güz", variant_title: "Default", quantity: 2, unit_price: 450, total: 900 },
  ],
}

const allText = (kind: "on-bilgilendirme-formu" | "mesafeli-satis-sozlesmesi", data = contractDataFromOrder(order, null)) =>
  contractSections(kind, data)
    .flatMap((s) => [
      s.heading,
      ...s.blocks.flatMap((b) =>
        b.type === "p" ? [b.text] : b.type === "lines" ? b.lines : [...b.rows.flat(), ...b.totals.flat()]
      ),
    ])
    .join("\n")

describe("order-contracts", () => {
  it("yeni sistem PDF'leri WP'den ayrı önekte (contracts/) durur", () => {
    expect(orderContractKey("order_1", "mesafeli-satis-sozlesmesi")).toBe("contracts/order_1/mesafeli-satis-sozlesmesi.pdf")
    expect(isOrderContractKind("on-bilgilendirme-formu")).toBe(true)
    expect(isOrderContractKind("wp-contracts")).toBe(false)
  })

  it("sipariş bilgileri sözleşmeye doldurulur", () => {
    const d = contractDataFromOrder(order, null)
    expect(d.recipient.name).toBe("Ayşe Yılmaz")
    expect(d.billing.address).toContain("Çiçek Sok.")
    expect(d.items).toEqual([
      { name: "İpek Eşarp Şakayık - Lacivert (MR-1001)", quantity: 1, total: expect.stringContaining("1.299,90") },
      { name: "Pamuk Şal Güz", quantity: 2, total: expect.stringContaining("900,00") },
    ])
    expect(d.totals.map((t) => t.label)).toEqual(["Ara Toplam", "İndirim", "Kargo", "Toplam (KDV dahil)"])
    expect(d.totals.find((t) => t.label === "Kargo")?.value).toBe("Ücretsiz")
  })

  it("checkout adresi: mahalle + ilçe / il", () => {
    const d = contractDataFromOrder(
      {
        ...order,
        shipping_address: {
          first_name: "Ayşe",
          last_name: "Yılmaz",
          address_1: "Çiçek Sok. No: 5 D: 3",
          address_2: "Caferağa Mah.",
          city: "İstanbul",
          postal_code: "34710",
          metadata: { district: "Kadıköy" },
        },
      },
      null
    )
    expect(d.recipient.address).toBe("Çiçek Sok. No: 5 D: 3, Caferağa Mah., Kadıköy / İstanbul, 34710")
  })

  it("satıcı künyesi CONTRACT_SELLER'dan gelir; alıcı adı metinde", () => {
    for (const kind of ["on-bilgilendirme-formu", "mesafeli-satis-sozlesmesi"] as const) {
      const text = allText(kind)
      expect(text).toContain("info@esteacay.com")
      expect(text).toContain("Hamzalı Çay")
      expect(text).toContain("Ayşe Yılmaz")
    }
    expect(allText("mesafeli-satis-sozlesmesi")).toContain("BAKANLIK: Gümrük ve Ticaret Bakanlığı’nı,")
    expect(allText("on-bilgilendirme-formu")).toContain("İşbu Sözleşme ticari amaçlarla yapılmaktadır.")
  })

  it("ödeme şekli WP etiketleriyle", () => {
    expect(allText("on-bilgilendirme-formu")).toContain("Ödeme Şekli ve Planı : Kredi Banka Kartı")
    const bank = contractDataFromOrder({ ...order, metadata: { payment_method: "bank_transfer" } }, null)
    expect(allText("on-bilgilendirme-formu", bank)).toContain("Ödeme Şekli ve Planı : Banka havalesi/EFT")
  })

  it("site sayfası (veri yok) müşteri bilgisi ve tablo basmaz", () => {
    const sections = contractSections("mesafeli-satis-sozlesmesi", null)
    expect(sections.some((s) => s.blocks.some((b) => b.type === "table"))).toBe(false)
    expect(JSON.stringify(sections)).toContain("sipariş sırasında belirtilir")
  })

  it("PDF üretilir, yeni sistem yazar ve tüm sayfalar A4", async () => {
    const pdf = await renderOrderContractPdf("on-bilgilendirme-formu", order, {
      generatedAt: new Date("2026-10-16T10:00:05Z"),
      legalAcceptedAt: new Date("2026-10-16T09:59:58Z"),
    })
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    expect(doc.getCreator()).toContain("Es Çay (Medusa)")
    for (const page of doc.getPages()) {
      expect(Math.round(page.getWidth())).toBe(595)
      expect(Math.round(page.getHeight())).toBe(842)
    }
  })
})
