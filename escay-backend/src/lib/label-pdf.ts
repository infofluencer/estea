/**
 * Es Çay etiket PDF'i — sipariş başına sayfa(lar).
 *
 * Tüm sayfalar 10×15 cm (TSC yazıcıdaki rulo); kenarlarda ~1,3 cm pay
 * (yazıcı kenarları kesiyordu).
 *
 * Kargo gönderisi varsa kargo firmasının etiketi
 * hiçbir ekleme yapılmadan sayfanın üstüne yerleştirilir; kurye yalnız bu
 * etiketteki barkodu okutur.
 * `withSlip` ise aynı sayfada etiketin altına sipariş fişi (adet × ürün ·
 * varyant · SKU, not) aşağı doğru yazılır. Gönderi yoksa (ya da etiket
 * alınamadıysa) sayfa hazırlık fişidir.
 *
 * Yazı tipi: data/fonts/Inter (Türkçe karakterler için gömülü).
 */

import { readFileSync } from "fs"
import { join } from "path"

import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { BRAND_LOGO_PNG_DATA_URI } from "./label-logos"
import { formatLabelDate, type LabelOrder } from "./order-packing-label"

const MM = 72 / 25.4
/** Sayfa: TSC yazıcıdaki 10×15 cm rulo. */
export const LABEL_WIDTH = 100 * MM
export const LABEL_HEIGHT = 150 * MM
/** Kenar payı: 4×4'te sorunsuz basılan %75 alanla aynı (yazıcı kenarı kesiyordu). */
const MARGIN = 12.7 * MM
const CONTENT_WIDTH = LABEL_WIDTH - 2 * MARGIN
const BLACK = rgb(0, 0, 0)
const GREY = rgb(0.35, 0.35, 0.35)
/** Yazılar bu boyuttan küçülmez; fiş yine sığmazsa kalanlar ayrı sayfaya. */
const MIN_SCALE = 0.75

type Fonts = { regular: PDFFont; medium: PDFFont }

let fontBytes: { regular: Buffer; medium: Buffer } | null = null

function loadFontBytes() {
  if (!fontBytes) {
    const dir = join(process.cwd(), "data", "fonts")
    fontBytes = {
      regular: readFileSync(join(dir, "Inter-Regular.ttf")),
      medium: readFileSync(join(dir, "Inter-Medium.ttf")),
    }
  }
  return fontBytes
}

export type LabelPage = {
  order: LabelOrder
  /** Kargo firmasının etiketi (PDF). Yoksa sayfa yalnız fiştir. */
  carrierPdf: Buffer | null
  /** Gönderi var ama etiket alınamadıysa fişin başına yazılan uyarı. */
  warning?: string
  /** Sığmayan kalemlerin devam sayfası (toplam satırı basılmaz). */
  continued?: boolean
}

/** fontkit ölçümü yavaş; genişlik boyutla doğrusal → 1 pt için önbellek. */
const widthCache = new WeakMap<PDFFont, Map<string, number>>()

function textWidth(font: PDFFont, text: string, size: number): number {
  let cache = widthCache.get(font)
  if (!cache) widthCache.set(font, (cache = new Map()))
  let unit = cache.get(text)
  if (unit === undefined) {
    unit = font.widthOfTextAtSize(text, 1)
    cache.set(text, unit)
  }
  return unit * size
}

/** Metni verilen genişliğe sığacak satırlara böler (uzun kelimeyi harf harf). */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ""
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (textWidth(font, candidate, size) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      line = ""
      let chunk = ""
      for (const ch of word) {
        if (textWidth(font, chunk + ch, size) > maxWidth && chunk) {
          lines.push(chunk)
          chunk = ""
        }
        chunk += ch
      }
      line = chunk
    }
    lines.push(line)
  }
  return lines
}

/**
 * Yukarıdan aşağı çizim: `measure` modunda yalnız yükseklik hesaplanır,
 * böylece aynı kod hem sığdırma hem çizim için kullanılır.
 */
class Pen {
  constructor(
    private page: PDFPage | null,
    public y: number,
    private left: number,
    private right: number
  ) {}

  get width() {
    return this.right - this.left
  }

  text(text: string, font: PDFFont, size: number, opts: { x?: number; color?: typeof BLACK; align?: "right" } = {}) {
    const x =
      opts.align === "right"
        ? this.right - textWidth(font, text, size)
        : this.left + (opts.x ?? 0)
    this.page?.drawText(text, { x, y: this.y - size, size, font, color: opts.color ?? BLACK })
  }

  rule(thickness: number) {
    this.page?.drawLine({
      start: { x: this.left, y: this.y },
      end: { x: this.right, y: this.y },
      thickness,
      color: BLACK,
    })
  }

  box(height: number, thickness: number, x = 0, width = this.width) {
    this.page?.drawRectangle({
      x: this.left + x,
      y: this.y - height,
      width,
      height,
      borderColor: BLACK,
      borderWidth: thickness,
    })
  }
}

type SlipOptions = {
  fonts: Fonts
  /** Hazırlık fişi (gönderi yok): alıcı bloğu da basılır. */
  full: boolean
  scale: number
  /** Tabloda gösterilecek en fazla kalem; kalanlar "+N kalem" satırında. */
  maxLines: number
}

/** Fişi çizer (page null ise yalnız ölçer); kullanılan yüksekliği döner. */
function drawSlip(page: PDFPage | null, top: number, o: LabelPage, opts: SlipOptions): number {
  const { fonts, scale: k } = opts
  const pen = new Pen(page, top, MARGIN, LABEL_WIDTH - MARGIN)
  const order = o.order
  const title = order.shipment ? `SİPARİŞ FİŞİ · ${order.shipment.orderNumber}` : `#${order.displayId || order.id}`

  if (o.warning) {
    const size = 7.5 * k
    for (const line of wrapText(o.warning, fonts.medium, size, pen.width)) {
      pen.text(line, fonts.medium, size)
      pen.y -= size * 1.25
    }
    pen.y -= 1.5 * k
  }

  pen.text(title, fonts.medium, 11 * k)
  pen.text(formatLabelDate(order.createdAt), fonts.regular, 7.5 * k, { align: "right" })
  pen.y -= 11 * k * 1.25
  const meta = [order.carrier, order.trackingNumber ? `Takip no: ${order.trackingNumber}` : ""]
    .filter(Boolean)
    .join(" · ")
  if (meta) {
    pen.text(meta, fonts.regular, 7 * k, { color: GREY })
    pen.y -= 7 * k * 1.3
  }
  pen.y -= 1.5 * k

  if (opts.full) {
    const lines = [order.customerName || "—", ...order.addressLines, order.phone ? `Tel: ${order.phone}` : ""].filter(Boolean)
    const size = 8.5 * k
    const pad = 2 * k
    const wrapped = lines.flatMap((l, i) => wrapText(l, i === 0 ? fonts.medium : fonts.regular, size, pen.width - pad * 2))
    const height = pad * 2 + 7 * k * 1.3 + wrapped.length * size * 1.25
    pen.box(height, 1)
    pen.y -= pad
    pen.text("ALICI", fonts.medium, 6.5 * k, { x: pad })
    pen.y -= 7 * k * 1.3
    wrapped.forEach((l, i) => {
      pen.text(l, i === 0 ? fonts.medium : fonts.regular, size, { x: pad })
      pen.y -= size * 1.25
    })
    pen.y -= pad + 3 * k
  }

  // Ürün tablosu: Adet | Ürün / renk | Stok kodu
  const qtyW = 11 * MM * k
  const skuW = 24 * MM * k
  const pad = 1.5 * k
  const skuX = pen.width - skuW
  const titleW = skuX - qtyW - pad * 2
  const headSize = 6 * k
  const headH = headSize + pad * 2
  pen.box(headH, 0.6)
  pen.text("ADET", fonts.medium, headSize, { x: pad, color: GREY })
  pen.y -= pad
  pen.text("ÜRÜN / RENK", fonts.medium, headSize, { x: qtyW + pad, color: GREY })
  pen.text("STOK KODU", fonts.medium, headSize, { x: skuX + pad, color: GREY })
  pen.y -= headH - pad

  const shown = order.lines.slice(0, opts.maxLines)
  const hidden = order.lines.slice(opts.maxLines)
  for (const line of shown) {
    const tSize = 8 * k
    const vSize = 7.5 * k
    const titleLines = wrapText(line.title || "—", fonts.medium, tSize, titleW)
    const variantLines = line.variant ? wrapText(line.variant, fonts.regular, vSize, titleW) : []
    const skuLines = wrapText(line.sku || "—", fonts.medium, tSize, skuW - pad * 2)
    const textH = Math.max(
      titleLines.length * tSize * 1.2 + variantLines.length * vSize * 1.2,
      skuLines.length * tSize * 1.2,
      11 * k
    )
    const rowH = textH + pad * 2
    pen.box(rowH, 0.6)
    pen.box(rowH, 0.6, 0, qtyW)
    pen.box(rowH, 0.6, skuX, skuW)
    const rowTop = pen.y
    pen.y -= pad
    pen.text(String(line.quantity), fonts.medium, 11 * k, { x: (qtyW - textWidth(fonts.medium, String(line.quantity), 11 * k)) / 2 })
    titleLines.forEach((l) => {
      pen.text(l, fonts.medium, tSize, { x: qtyW + pad })
      pen.y -= tSize * 1.2
    })
    variantLines.forEach((l) => {
      pen.text(l, fonts.regular, vSize, { x: qtyW + pad })
      pen.y -= vSize * 1.2
    })
    pen.y = rowTop - pad
    skuLines.forEach((l) => {
      pen.text(l, fonts.medium, tSize, { x: skuX + pad })
      pen.y -= tSize * 1.2
    })
    pen.y = rowTop - rowH
  }

  const totalQty = order.lines.reduce((sum, l) => sum + l.quantity, 0)
  const totalText = o.continued
    ? hidden.length ? `+${hidden.length} kalem sonraki sayfada` : ""
    : `Toplam ${order.lines.length} kalem · ${totalQty} adet${hidden.length ? `  (+${hidden.length} kalem sonraki sayfada)` : ""}`
  if (totalText) {
    pen.y -= 2 * k
    pen.text(totalText, fonts.medium, 8 * k)
    pen.y -= 8 * k * 1.3
  }

  if (order.note) {
    const size = 8.5 * k
    const notePad = 2 * k
    const noteLines = wrapText(`Not: ${order.note}`, fonts.regular, size, pen.width - notePad * 2)
    const height = notePad * 2 + noteLines.length * size * 1.25
    pen.y -= 1.5 * k
    pen.box(height, 1.2)
    pen.y -= notePad
    noteLines.forEach((l) => {
      pen.text(l, fonts.regular, size, { x: notePad })
      pen.y -= size * 1.25
    })
    pen.y -= notePad
  }

  return top - pen.y
}

/** Fişin bu yüksekliğe sığması için yazı ölçeği ve kalem sayısı. */
function fitSlip(o: LabelPage, fonts: Fonts, full: boolean, available: number): { scale: number; maxLines: number } {
  const all = o.order.lines.length
  for (let scale = 1; scale >= MIN_SCALE - 1e-6; scale -= 0.05) {
    if (drawSlip(null, available, o, { fonts, full, scale, maxLines: all }) <= available) {
      return { scale, maxLines: all }
    }
  }
  // Kalem sayısı arttıkça yükseklik artar → sığan en çok kalem ikili aramayla.
  let lo = 1
  let hi = all - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (drawSlip(null, available, o, { fonts, full, scale: MIN_SCALE, maxLines: mid }) <= available) lo = mid
    else hi = mid - 1
  }
  return { scale: MIN_SCALE, maxLines: Math.max(1, lo) }
}

const COMPACT_SIZES = [8, 7.5, 7, 6.5, 6, 5.5]
const COMPACT_GAP = 1.5 * MM

/**
 * Kargo etiketinin altındaki kısa fiş (page null ise yalnız ölçer); yüksekliği döner.
 * Satırlar: sipariş no · tarih, her kalem "adet × ürün · renk · SKU", not.
 */
function drawCompactSlip(
  page: PDFPage | null,
  top: number,
  order: LabelOrder,
  fonts: Fonts,
  size: number,
  maxLines: number,
  maxNoteLines = Infinity
): number {
  const pen = new Pen(page, top, MARGIN, LABEL_WIDTH - MARGIN)
  const lineH = size * 1.2
  const write = (text: string, font: PDFFont) => {
    for (const line of wrapText(text, font, size, pen.width)) {
      pen.text(line, font, size)
      pen.y -= lineH
    }
  }

  pen.rule(0.5)
  pen.y -= 1 * MM
  const name = order.shipment?.orderNumber || `#${order.displayId || order.id}`
  pen.text(name, fonts.medium, size)
  pen.text(formatLabelDate(order.createdAt), fonts.regular, size, { align: "right" })
  pen.y -= lineH
  for (const line of order.lines.slice(0, maxLines)) {
    write([`${line.quantity} × ${line.title || "—"}`, line.variant, line.sku].filter(Boolean).join(" · "), fonts.regular)
  }
  const hidden = order.lines.length - maxLines
  if (hidden > 0) write(`+${hidden} kalem daha`, fonts.medium)
  if (order.note) {
    const noteLines = wrapText(`Not: ${order.note}`, fonts.medium, size, pen.width)
    const shown = noteLines.slice(0, maxNoteLines)
    if (shown.length < noteLines.length) shown[shown.length - 1] = `${shown[shown.length - 1].slice(0, -1)}…`
    for (const line of shown) {
      pen.text(line, fonts.medium, size)
      pen.y -= lineH
    }
  }
  return top - pen.y
}

type CompactFit = { size: number; maxLines: number; maxNoteLines: number }

/** Kısa fişin sığdığı en büyük yazı; sığmazsa önce not tek satıra, sonra kalemler kısaltılır. */
function fitCompactSlip(order: LabelOrder, fonts: Fonts, available: number): CompactFit {
  const all = order.lines.length
  const fits = (f: CompactFit) =>
    drawCompactSlip(null, available, order, fonts, f.size, f.maxLines, f.maxNoteLines) <= available
  for (const size of COMPACT_SIZES) {
    const fit = { size, maxLines: all, maxNoteLines: Infinity }
    if (fits(fit)) return fit
  }
  const size = COMPACT_SIZES[COMPACT_SIZES.length - 1]
  for (let maxLines = all; maxLines > 0; maxLines--) {
    const fit = { size, maxLines, maxNoteLines: 1 }
    if (fits(fit)) return fit
  }
  return { size, maxLines: 0, maxNoteLines: 1 }
}

async function drawLogo(doc: PDFDocument, page: PDFPage, top: number): Promise<number> {
  const png = await doc.embedPng(Buffer.from(BRAND_LOGO_PNG_DATA_URI.split(",")[1], "base64"))
  const height = 7 * MM
  const width = (png.width / png.height) * height
  page.drawImage(png, { x: MARGIN, y: top - height, width, height })
  return height + 2.5 * MM
}

/**
 * Siparişlerin etiketleri tek PDF'te: kargo etiketi olduğu gibi (`withSlip` ise
 * aynı sayfada altında kısa fiş), gönderi yoksa hazırlık fişi.
 */
export async function buildLabelsPdf(pages: LabelPage[], opts: { withSlip?: boolean } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  // subset: pdf-lib'in alt-kümelemesi Inter'de glifleri düşürüyor (harfler boş basılıyor),
  // font tam gömülür (~330 KB/PDF). calt: "-", ":", "+" rakam yanında genişliği
  // PDF'e yanlış yazılan alternatif glife dönüyor → araya boşluk giriyor.
  const embedOptions = { subset: false, features: { calt: false } }
  let fonts: Fonts | null = null
  const slipFonts = async (): Promise<Fonts> => {
    if (!fonts) {
      const bytes = loadFontBytes()
      fonts = {
        regular: await doc.embedFont(bytes.regular, embedOptions),
        medium: await doc.embedFont(bytes.medium, embedOptions),
      }
    }
    return fonts
  }

  for (const entry of pages) {
    if (entry.carrierPdf) {
      // Firma etiketi olduğu gibi: üstte, içerik genişliğine oranı korunarak
      // sığdırılır; üzerine hiçbir şey çizilmez. Fişliyse fiş altına, aşağı doğru.
      // Yazdırırken ölçek "Varsayılan".
      const carrier = await PDFDocument.load(entry.carrierPdf)
      const embedded = await doc.embedPdf(carrier, carrier.getPageIndices())
      for (const [i, label] of embedded.entries()) {
        const page = doc.addPage([LABEL_WIDTH, LABEL_HEIGHT])
        const top = LABEL_HEIGHT - MARGIN
        const scale = CONTENT_WIDTH / Math.max(label.width, label.height)
        const width = label.width * scale
        const height = label.height * scale
        page.drawPage(label, { x: (LABEL_WIDTH - width) / 2, y: top - height, width, height })
        if (opts.withSlip && i === 0) {
          const fonts = await slipFonts()
          const slipTop = top - height - COMPACT_GAP
          const fit = fitCompactSlip(entry.order, fonts, slipTop - MARGIN)
          drawCompactSlip(page, slipTop, entry.order, fonts, fit.size, fit.maxLines, fit.maxNoteLines)
        }
      }
      continue
    }

    // Gönderi yoksa (ya da etiket alınamadıysa) tam hazırlık fişi: logo + alıcı + tablo.
    const fonts = await slipFonts()
    const page = doc.addPage([LABEL_WIDTH, LABEL_HEIGHT])
    const top = LABEL_HEIGHT - MARGIN - (await drawLogo(doc, page, LABEL_HEIGHT - MARGIN))
    const fit = fitSlip(entry, fonts, true, top - MARGIN)
    drawSlip(page, top, entry, { fonts, full: true, ...fit })

    // Sığmayan kalemler: devam fiş sayfaları.
    let rest = entry.order.lines.slice(fit.maxLines)
    while (rest.length) {
      const extra = doc.addPage([LABEL_WIDTH, LABEL_HEIGHT])
      const cont: LabelPage = {
        carrierPdf: null,
        order: { ...entry.order, lines: rest, note: "" },
        warning: `#${entry.order.displayId || entry.order.id} — önceki sayfanın devamı`,
        continued: true,
      }
      const extraTop = LABEL_HEIGHT - MARGIN
      const extraFit = fitSlip(cont, fonts, false, extraTop - MARGIN)
      drawSlip(extra, extraTop, cont, { fonts, full: false, ...extraFit })
      rest = rest.slice(extraFit.maxLines)
    }
  }

  return Buffer.from(await doc.save())
}
