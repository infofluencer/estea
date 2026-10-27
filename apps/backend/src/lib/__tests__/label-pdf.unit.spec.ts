import { PDFDocument, StandardFonts } from "pdf-lib"

import { buildLabelsPdf, LABEL_HEIGHT, LABEL_WIDTH } from "../label-pdf"
import type { LabelOrder } from "../order-packing-label"

const base: LabelOrder = {
  id: "order_1",
  displayId: "55",
  createdAt: new Date("2026-10-12T06:42:00Z"),
  customerName: "Ayşenur Şahin",
  phone: "+905308248291",
  email: "a@example.com",
  addressLines: ["49.sk Güneşlipark Gardenya sitesi E blok D:22", "Bağlar Mahallesi", "Bağcılar / İstanbul 34212"],
  lines: [{ title: "Rize Siyah Çay", variant: "Gramaj: 500 g", sku: "ESC-SIYAH-500", quantity: 1 }],
  note: "Hediye paketi olsun lütfen",
  carrier: "MANUAL",
  trackingNumber: "324406761644",
  shipment: { barcode: "37965238126", carrier: "Elle kargo", orderNumber: "ESC-55" },
  carrierLabelUrl: "https://example.invalid/labels/x.pdf",
  carrierLabelZpl: "",
}

/** 10×10 cm kargo etiketi yerine geçen test PDF'i. */
async function fakeCarrierPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([283.46, 283.46])
  page.drawText("KARGO", { x: 20, y: 200, size: 40, font: await doc.embedFont(StandardFonts.Helvetica) })
  return Buffer.from(await doc.save())
}

async function pages(pdf: Buffer) {
  return (await PDFDocument.load(pdf)).getPages()
}

describe("label pdf", () => {
  it("puts the carrier label on a 10×15 page, one page per order", async () => {
    const carrierPdf = await fakeCarrierPdf()
    const lines = Array.from({ length: 40 }, (_, i) => ({ title: `Ürün ${i + 1}`, variant: "", sku: `SKU-${i + 1}`, quantity: 1 }))
    const pdf = await buildLabelsPdf([
      { order: base, carrierPdf },
      { order: { ...base, id: "order_2", displayId: "56", lines }, carrierPdf },
    ])
    const result = await pages(pdf)
    expect(result).toHaveLength(2)
    result.forEach((p) => {
      expect(p.getWidth()).toBeCloseTo(LABEL_WIDTH, 1)
      expect(p.getHeight()).toBeCloseTo(LABEL_HEIGHT, 1)
    })
  })

  it("puts the carrier label and a short slip on the same page when asked", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ title: `Ürün ${i + 1}`, variant: "Gramaj: 500 g", sku: `SKU-${i + 1}`, quantity: 1 }))
    const pdf = await buildLabelsPdf(
      [
        { order: base, carrierPdf: await fakeCarrierPdf() },
        { order: { ...base, lines }, carrierPdf: await fakeCarrierPdf() },
      ],
      { withSlip: true }
    )
    const result = await pages(pdf)
    expect(result).toHaveLength(2)
    result.forEach((p) => {
      expect(p.getWidth()).toBeCloseTo(LABEL_WIDTH, 1)
      expect(p.getHeight()).toBeCloseTo(LABEL_HEIGHT, 1)
    })
  })

  it("prints a full packing slip when there is no shipment yet", async () => {
    const pdf = await buildLabelsPdf([{ order: { ...base, shipment: null, carrierLabelUrl: "" }, carrierPdf: null }])
    const [page] = await pages(pdf)
    expect(page.getWidth()).toBeCloseTo(LABEL_WIDTH, 1)
    expect(page.getHeight()).toBeCloseTo(LABEL_HEIGHT, 1)
  })

  it("continues long packing slips on extra pages", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({
      title: `Çok uzun ürün adı numara ${i + 1} — Özel Harman Çay Koleksiyonu`,
      variant: "Gramaj: 500 g · Paket: Kutu",
      sku: `SKU-${i + 1}`,
      quantity: 1,
    }))
    const pdf = await buildLabelsPdf([{ order: { ...base, shipment: null, lines }, carrierPdf: null }])
    const result = await pages(pdf)
    expect(result.length).toBeGreaterThan(1)
    result.forEach((p) => expect(p.getHeight()).toBeCloseTo(LABEL_HEIGHT, 1))
  })

  it("prints a warning slip when the carrier label could not be fetched", async () => {
    const pdf = await buildLabelsPdf([
      { order: base, carrierPdf: null, warning: "KARGO ETİKETİ ALINAMADI" },
    ])
    expect(await pages(pdf)).toHaveLength(1)
  })
})
