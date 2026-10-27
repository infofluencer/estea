/**
 * Yeni sistem (Medusa) sipariş sözleşmeleri — sipariş anında, o siparişin
 * bilgileriyle doldurulmuş ön bilgilendirme formu + mesafeli satış sözleşmesi.
 *
 * PDF private S3'e `contracts/<order_id>/<tür>.pdf` olarak yazılır. Eski sistemden
 * kalan, sonradan yeniden üretilmiş PDF'ler ayrı önekte durur
 * taşınan sözleşmeler ayrı önekte tutulurdu — karışmasın diye hem
 * önek hem PDF dipnotu hem de order.metadata.contracts.source = "medusa"
 * bu belgelerin yeni sistemin kendi kaydı olduğunu söyler.
 *
 * Metin shared/legal-contracts.ts'ten gelir (tek kaynak);
 * storefront /legal sayfaları da aynı kaynağı kullanır.
 *
 * Yazı tipi: data/fonts/Inter (Türkçe karakterler için gömülü).
 */

import { readFileSync } from "fs"
import { join } from "path"

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import fontkit from "@pdf-lib/fontkit"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"
import { formatOrderNumber } from "@escay/shared/order-number"
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import {
  CONTRACT_TEXT_VERSION,
  CONTRACT_TITLES,
  contractSections,
  type ContractOrderData,
} from "@escay/shared/legal-contracts"

import { COMPANY } from "../emails/company"
import { coerceAmount, formatMoneyExact } from "../emails/format"
import { wrapText } from "./label-pdf"

export const ORDER_CONTRACTS = (["on-bilgilendirme-formu", "mesafeli-satis-sozlesmesi"] as const).map(
  (kind) => ({ kind, label: CONTRACT_TITLES[kind] })
)

export type OrderContractKind = (typeof ORDER_CONTRACTS)[number]["kind"]

/** order.metadata.contracts */
export type OrderContractsMeta = {
  source: "medusa"
  generated_at: string
  legal_accepted_at: string | null
  /** Sipariş anında değil, sonradan (admin / eski sipariş) üretildi. */
  backfilled: boolean
  text_version: string
  keys: Record<OrderContractKind, string>
}

/** Bucket policy yalnızca files/* public → bu önek private. */
export const orderContractKey = (orderId: string, kind: OrderContractKind) =>
  `contracts/${orderId}/${kind}.pdf`

export function isOrderContractKind(kind: string): kind is OrderContractKind {
  return ORDER_CONTRACTS.some((c) => c.kind === kind)
}

function s3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  })
}

/** Admin "PDF'i aç" — 5 dk geçerli imzalı link. */
export async function signedOrderContractUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3Client(),
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    { expiresIn: 300 }
  )
}

// ---------------------------------------------------------------------------
// Sözleşme verisi
// ---------------------------------------------------------------------------

type Address = {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  phone?: string | null
  metadata?: Record<string, unknown> | null
} | null

export type ContractOrder = {
  id: string
  display_id?: number | null
  email?: string | null
  currency_code?: string | null
  created_at?: string | Date | null
  total?: unknown
  item_total?: unknown
  shipping_total?: unknown
  discount_total?: unknown
  tax_total?: unknown
  metadata?: Record<string, unknown> | null
  shipping_address?: Address
  billing_address?: Address
  items?: {
    title?: string | null
    product_title?: string | null
    variant_title?: string | null
    variant_sku?: string | null
    quantity?: unknown
    unit_price?: unknown
    total?: unknown
  }[] | null
}

const fullName = (a: Address) => [a?.first_name, a?.last_name].filter(Boolean).join(" ").trim()

/** Checkout: address_2 = mahalle, metadata.district = ilçe, city = il (province çoğu zaman boş). */
const addressLine = (a: Address) => {
  const district = typeof a?.metadata?.district === "string" ? a.metadata.district : ""
  const ilIlce = [district, a?.city || a?.province].map((s) => String(s ?? "").trim()).filter(Boolean)
  return [a?.address_1, a?.address_2, [...new Set(ilIlce)].join(" / "), a?.postal_code]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ")
}

const formatDateTime = (d: Date) =>
  d.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

/** Sipariş → ortak sözleşme metninin (shared/legal-contracts) beklediği veri. */
export function contractDataFromOrder(o: ContractOrder, legalAcceptedAt: Date | null): ContractOrderData {
  const currency = (o.currency_code || "TRY").toUpperCase()
  const money = (v: unknown) => formatMoneyExact(Number(coerceAmount(v) ?? 0), currency)
  const ship = o.shipping_address ?? null
  const bill = o.billing_address ?? ship
  const discount = Number(coerceAmount(o.discount_total) ?? 0)
  const placedAt = o.created_at ? new Date(o.created_at) : new Date()

  const recipient = {
    name: fullName(ship) || fullName(bill),
    address: addressLine(ship) || addressLine(bill),
    phone: ship?.phone || bill?.phone || "",
    email: o.email || "",
  }
  const billing = {
    name: [bill?.company, fullName(bill)].filter(Boolean).join(" — ") || recipient.name,
    address: addressLine(bill) || recipient.address,
    phone: bill?.phone || recipient.phone,
    email: o.email || "",
  }

  const items = (o.items ?? []).map((i) => {
    const qty = Number(coerceAmount(i.quantity) ?? 0)
    const name = [i.product_title || i.title, i.variant_title && i.variant_title !== "Default" ? i.variant_title : null]
      .filter(Boolean)
      .join(" - ")
    const line = i.total != null ? i.total : Number(coerceAmount(i.unit_price) ?? 0) * qty
    return { name: i.variant_sku ? `${name} (${i.variant_sku})` : name, quantity: qty, total: money(line) }
  })

  const totals = [{ label: "Ara Toplam", value: money(o.item_total) }]
  if (discount > 0) totals.push({ label: "İndirim", value: `-${money(discount)}` })
  totals.push({ label: "Kargo", value: Number(coerceAmount(o.shipping_total) ?? 0) > 0 ? money(o.shipping_total) : "Ücretsiz" })
  totals.push({ label: "Toplam (KDV dahil)", value: money(o.total) })

  return {
    orderNo: formatOrderNumber(o.display_id) || o.id,
    date: formatDateTime(legalAcceptedAt ?? placedAt),
    recipient,
    billing,
    items,
    totals,
    paymentMethod: o.metadata?.payment_method === "bank_transfer" ? "bank_transfer" : "card",
  }
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const MM = 72 / 25.4
const PAGE_W = 210 * MM
const PAGE_H = 297 * MM
const MARGIN_X = 18 * MM
const MARGIN_TOP = 18 * MM
const MARGIN_BOTTOM = 22 * MM
const CONTENT_W = PAGE_W - 2 * MARGIN_X
const BLACK = rgb(0.07, 0.07, 0.07)
const GREY = rgb(0.4, 0.4, 0.4)

/** Sipariş anından 1 saatten geç üretildiyse (eski sipariş / elle üretim) "sonradan" yazılır. */
const isBackfill = (placedAt: Date, generatedAt: Date) =>
  generatedAt.getTime() - placedAt.getTime() > 60 * 60 * 1000

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

export async function renderOrderContractPdf(
  kind: OrderContractKind,
  order: ContractOrder,
  opts: { generatedAt: Date; legalAcceptedAt: Date | null }
): Promise<Buffer> {
  const label = CONTRACT_TITLES[kind]
  const sections = contractSections(kind, contractDataFromOrder(order, opts.legalAcceptedAt))
  const orderNo = formatOrderNumber(order.display_id) || order.id
  const placedAt = order.created_at ? new Date(order.created_at) : opts.generatedAt

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const bytes = loadFontBytes()
  // label-pdf.ts ile aynı: subset Inter'de glifleri düşürüyor; calt ":" "-" "(" yanında boşluk açıyor.
  const embedOptions = { subset: false, features: { calt: false } }
  const regular = await doc.embedFont(bytes.regular, embedOptions)
  const medium = await doc.embedFont(bytes.medium, embedOptions)
  doc.setTitle(`${label} — Sipariş ${orderNo}`)
  doc.setAuthor(COMPANY.legalName)
  doc.setCreator("Es Çay (Medusa) — sipariş anında oluşturuldu")
  doc.setCreationDate(opts.generatedAt)

  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H])
    pages.push(page)
    y = PAGE_H - MARGIN_TOP
  }
  const ensure = (h: number) => {
    if (y - h < MARGIN_BOTTOM) newPage()
  }
  const lines = (text: string, font: PDFFont, size: number, x: number, width: number, color = BLACK) => {
    const lh = size * 1.4
    for (const line of wrapText(text, font, size, width)) {
      ensure(lh)
      page.drawText(line, { x, y: y - size, size, font, color })
      y -= lh
    }
  }

  newPage()
  lines("ES ÇAY", medium, 8, MARGIN_X, CONTENT_W, GREY)
  y -= 2
  lines(label, medium, 16, MARGIN_X, CONTENT_W)
  y -= 2
  lines(
    `Sipariş ${orderNo} · Sipariş tarihi: ${formatDateTime(placedAt)}` +
      (opts.legalAcceptedAt ? ` · Alıcı onayı: ${formatDateTime(opts.legalAcceptedAt)}` : ""),
    regular,
    8.5,
    MARGIN_X,
    CONTENT_W,
    GREY
  )
  y -= 4
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_W - MARGIN_X, y }, thickness: 0.5, color: GREY })
  y -= 10

  const BODY = 9.5
  const TABLE = 9
  for (const section of sections) {
    y -= 6
    ensure(40)
    lines(section.heading, medium, 10.5, MARGIN_X, CONTENT_W)
    y -= 3
    for (const b of section.blocks) {
      if (b.type === "p") {
        lines(b.text, regular, BODY, MARGIN_X, CONTENT_W)
        y -= 4
      } else if (b.type === "lines") {
        for (const l of b.lines) lines(l, regular, BODY, MARGIN_X, CONTENT_W)
        y -= 4
      } else {
        // Ürün tablosu: sol sütun ürün × adet, sağ sütun tutar (sağa yaslı)
        const PRICE_W = 38 * MM
        const lh = TABLE * 1.4
        const row = (left: string, right: string, font: PDFFont) => {
          const leftLines = wrapText(left, font, TABLE, CONTENT_W - PRICE_W - 6)
          ensure(leftLines.length * lh + 4)
          const top = y
          leftLines.forEach((l, i) => page.drawText(l, { x: MARGIN_X, y: top - TABLE - i * lh, size: TABLE, font, color: BLACK }))
          page.drawText(right, {
            x: PAGE_W - MARGIN_X - font.widthOfTextAtSize(right, TABLE),
            y: top - TABLE,
            size: TABLE,
            font,
            color: BLACK,
          })
          y = top - leftLines.length * lh - 3
          page.drawLine({ start: { x: MARGIN_X, y: y + 1 }, end: { x: PAGE_W - MARGIN_X, y: y + 1 }, thickness: 0.3, color: GREY })
          y -= 3
        }
        row("Ürün", "Tutar", medium)
        for (const [l, r] of b.rows) row(l, r, regular)
        for (const [l, r] of b.totals) row(l, r, medium)
        y -= 4
      }
    }
  }

  // Dipnot: belgenin sipariş anında mı yoksa sonradan mı üretildiği
  const footer = isBackfill(placedAt, opts.generatedAt)
    ? `Bu belge Es Çay yeni sipariş sistemi tarafından, sipariş kaydındaki bilgilerden ${formatDateTime(opts.generatedAt)} ` +
      `tarihinde sonradan oluşturulmuştur (metin sürümü ${CONTRACT_TEXT_VERSION}).`
    : `Bu belge Es Çay yeni sipariş sistemi tarafından ${formatDateTime(opts.generatedAt)} tarihinde, ` +
      `sipariş anında siparişin kendi bilgileriyle oluşturulmuştur (metin sürümü ${CONTRACT_TEXT_VERSION}).`
  pages.forEach((p, i) => {
    const size = 7
    const footerLines = wrapText(footer, regular, size, CONTENT_W - 30)
    footerLines.forEach((l, j) =>
      p.drawText(l, { x: MARGIN_X, y: 12 * MM - j * size * 1.4, size, font: regular, color: GREY })
    )
    const num = `${i + 1}/${pages.length}`
    p.drawText(num, {
      x: PAGE_W - MARGIN_X - regular.widthOfTextAtSize(num, size),
      y: 12 * MM,
      size,
      font: regular,
      color: GREY,
    })
  })

  return Buffer.from(await doc.save())
}

// ---------------------------------------------------------------------------
// Sipariş → S3
// ---------------------------------------------------------------------------

const CONTRACT_ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "currency_code",
  "created_at",
  "metadata",
  "total",
  "item_total",
  "shipping_total",
  "discount_total",
  "tax_total",
  "item_subtotal",
  "original_item_total",
  // Toplamlar satır/kargo/vergi/indirim kayıtlarından hesaplanır — bunlar olmadan
  // item_total/total 0 veya yalnız kargo döner (query.graph ile denendi).
  "items.*",
  "items.tax_lines.*",
  "items.adjustments.*",
  "shipping_methods.*",
  "shipping_methods.tax_lines.*",
  "shipping_methods.adjustments.*",
  "shipping_address.*",
  "billing_address.*",
]

/** Sözleşmeye basılacak sipariş — tutarlar getOrderDetailWorkflow ile (onay maili gibi). */
export async function loadContractOrder(container: MedusaContainer, orderId: string): Promise<ContractOrder | null> {
  try {
    const { result } = await getOrderDetailWorkflow(container).run({
      input: { fields: CONTRACT_ORDER_FIELDS, order_id: orderId, filters: { is_draft_order: false } },
    })
    return result as unknown as ContractOrder
  } catch {
    return null
  }
}

/**
 * Siparişin iki sözleşmesini üretip S3'e yazar, order.metadata.contracts'ı
 * doldurur. Zaten üretilmişse (metadata var) dokunmaz — sözleşme sipariş
 * anındaki hâliyle kalmalı.
 */
export async function generateOrderContracts(
  container: MedusaContainer,
  orderId: string
): Promise<{ ok: true; skipped?: string; meta?: OrderContractsMeta } | { ok: false; error: string }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (!process.env.S3_BUCKET) return { ok: false, error: "S3 yapılandırılmamış" }

  const order = await loadContractOrder(container, orderId)
  if (!order) return { ok: false, error: "Sipariş bulunamadı" }
  if ((order.metadata?.contracts as OrderContractsMeta | undefined)?.source === "medusa") {
    return { ok: true, skipped: "zaten var" }
  }

  const generatedAt = new Date()
  const acceptedRaw = order.metadata?.legal_accepted_at
  const accepted = typeof acceptedRaw === "string" ? new Date(acceptedRaw) : null
  const legalAcceptedAt = accepted && !Number.isNaN(accepted.getTime()) ? accepted : null
  const orderNo = formatOrderNumber(order.display_id) || order.id

  const s3 = s3Client()
  const keys = {} as Record<OrderContractKind, string>
  for (const c of ORDER_CONTRACTS) {
    const pdf = await renderOrderContractPdf(c.kind, order, { generatedAt, legalAcceptedAt })
    const key = orderContractKey(order.id, c.kind)
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: pdf,
        ContentType: "application/pdf",
        ContentDisposition: `inline; filename="${c.kind}-${orderNo}.pdf"`,
        ServerSideEncryption: "AES256",
        Metadata: { source: "medusa", "order-id": order.id, "text-version": CONTRACT_TEXT_VERSION },
      })
    )
    keys[c.kind] = key
  }

  const meta: OrderContractsMeta = {
    source: "medusa",
    generated_at: generatedAt.toISOString(),
    legal_accepted_at: legalAcceptedAt?.toISOString() ?? null,
    backfilled: isBackfill(order.created_at ? new Date(order.created_at) : generatedAt, generatedAt),
    text_version: CONTRACT_TEXT_VERSION,
    keys,
  }
  // Medusa metadata güncellemesi anahtarları birleştirir — yalnız contracts yazılır.
  await (container.resolve(Modules.ORDER) as {
    updateOrders: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }).updateOrders(order.id, { metadata: { contracts: meta } })

  logger.info(`[order-contracts] ${ORDER_CONTRACTS.length} PDF yazıldı order=${order.id} (${orderNo})`)
  return { ok: true, meta }
}
