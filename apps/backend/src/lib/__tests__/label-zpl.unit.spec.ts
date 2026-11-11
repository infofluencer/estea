import { buildZplBundle, printsAsZpl, zplFileName, zplLabelsAsPdf } from "../label-zpl"
import type { LabelOrder } from "../order-packing-label"

function label(partial: Partial<LabelOrder> & { id: string }): LabelOrder {
  return {
    displayId: "65",
    createdAt: null,
    customerName: "Ayşe Yılmaz",
    phone: "",
    email: "",
    addressLines: [],
    lines: [],
    note: "",
    carrier: "DHL eCommerce",
    trackingNumber: "",
    shipment: { orderNumber: `ESC-${partial.id}` } as LabelOrder["shipment"],
    carrierLabelUrl: "",
    carrierLabelZpl: "",
    ...partial,
  }
}

describe("DHL etiketi ZPL dosyası", () => {
  const ZPL = "^XA^PW831^LL0959^FDx^FS^XZ\r\n"

  it("ZPL'li siparişler tek dosyada, sırayla; PDF'liler ve gönderisizler PDF'e; etiketi olmayan gönderi atlanır", () => {
    const b = buildZplBundle(
      [
        label({ id: "1", carrierLabelZpl: ZPL }),
        label({ id: "2", carrierLabelUrl: "https://firma/etiket.pdf" }),
        label({ id: "3", shipment: null }),
        label({ id: "4" }),
        label({ id: "5", carrierLabelZpl: "^XA^FDy^FS^XZ" }),
      ],
      {}
    )
    expect(b.includedIds).toEqual(["1", "5"])
    expect(b.pdfIds).toEqual(["2", "3", "4"])
    expect(b.skipped).toEqual(["ESC-4"])
    expect(b.zpl).toBe("^XA^PW831^LL0959^FDx^FS^XZ\r\n^XA^FDy^FS^XZ\r\n")
    expect(b.zpl.match(/\^XA/g)).toHaveLength(2)
  })

  it("DHL_LABEL_PDF=labelary açıkça yazılırsa eski PDF yolu", () => {
    const o = label({ id: "1", carrierLabelZpl: ZPL })
    expect(printsAsZpl(o, {})).toBe(true)
    expect(zplLabelsAsPdf({ DHL_LABEL_PDF: "labelary" })).toBe(true)
    expect(printsAsZpl(o, { DHL_LABEL_PDF: "labelary" })).toBe(false)
    expect(buildZplBundle([o], { DHL_LABEL_PDF: "labelary" }).zpl).toBe("")
  })

  it("dosya adı Türkiye saatiyle", () => {
    expect(zplFileName(new Date("2026-11-11T14:45:00Z"))).toBe("dhl-etiket-20261111-1745.zpl")
  })
})
