/**
 * Etiket modeli — siparişi 10×15 etiketin ihtiyaç duyduğu alanlara çevirir.
 * Çizim: `label-pdf.ts` (kargo firması etiketi + sipariş fişi).
 */

import { buildOrderReference } from "../modules/carrier/registry"
import { readFulfillmentData } from "../modules/carrier/types"

export type LabelLine = {
  title: string
  variant: string
  sku: string
  quantity: number
}

/** Kargo firmasında açılmış gönderi — `barcode` firmanın barkodu/referansı. */
export type LabelShipment = {
  barcode: string
  carrier: string
  /** Firmaya giden sipariş referansı (ESC-15) */
  orderNumber: string
}

export type LabelOrder = {
  id: string
  displayId: string
  createdAt: Date | null
  customerName: string
  phone: string
  email: string
  addressLines: string[]
  lines: LabelLine[]
  note: string
  carrier: string
  trackingNumber: string
  shipment: LabelShipment | null
  /** Kargo firmasının resmi etiketi (PDF URL). */
  carrierLabelUrl: string
  /** Bazı firmalar etiketi ZPL verir (adaptör getLabel ile PDF'e çevrilir). */
  carrierLabelZpl: string
}

type Dict = Record<string, unknown>

/** Çay varyantları: Gramaj / Paket / Aroma — seçenek adı olduğu gibi basılır. */
function optionLabel(name: string): string {
  return name.trim()
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""
}

/** Medusa BigNumber alanları sayı, string veya { value, numeric } olarak gelebilir. */
function num(value: unknown): number {
  if (value && typeof value === "object") {
    const v = value as Dict
    return num(v.numeric ?? v.value)
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function obj(value: unknown): Dict {
  return value && typeof value === "object" ? (value as Dict) : {}
}

/** Varyant seçenekleri "Gramaj: 500 g · Paket: Karton". */
function variantText(item: Dict): string {
  const options = Array.isArray(obj(item.variant).options)
    ? (obj(item.variant).options as Dict[])
    : []
  const parts = options
    .map((o) => ({ name: optionLabel(text(obj(o.option).title)), value: text(o.value) }))
    .filter((o) => o.value)
    .map((o) => (o.name ? `${o.name}: ${o.value}` : o.value))
  if (parts.length) return parts.join(" · ")

  const variantTitle = text(item.variant_title)
  return !variantTitle || /^default/i.test(variantTitle) ? "" : variantTitle
}

const CARRIER_NAMES: Record<string, string> = {
  DHL: "DHL eCommerce",
  MNG: "MNG Kargo",
  SURAT: "Sürat Kargo",
  ARAS: "Aras Kargo",
  YURTICI: "Yurtiçi Kargo",
  PTT: "PTT Kargo",
  HEPSIJET: "HepsiJET",
  KOLAYGELSIN: "Kolay Gelsin",
  MANUAL: "Elle kargo",
}

export function carrierName(code: string): string {
  const key = code.trim().toUpperCase()
  return CARRIER_NAMES[key] || code.trim()
}

function labelShipment(data: ReturnType<typeof readFulfillmentData>, orderNumber: string): LabelShipment | null {
  const barcode = data.barcode || data.tracking_number || ""
  if (!barcode || !data.shipment_ref) return null
  return { barcode, carrier: data.carrier_name || carrierName(data.carrier || ""), orderNumber: data.order_reference || orderNumber }
}

function httpsUrl(value: unknown): string {
  const url = text(value)
  return /^https:\/\//i.test(url) ? url : ""
}

function validDate(value: unknown): Date | null {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Medusa sipariş kaydını (query.graph / admin API) etiket modeline çevirir. */
export function toLabelOrder(
  order: Dict,
  opts: {
    orderPrefix?: string
    /** Belirli gönderi (değişim); yoksa kargoya verilmemiş aktif gönderi, o da yoksa son aktif */
    fulfillmentId?: string
    /** Yalnız bu sipariş kalemleri (değişimde yeni ürün) */
    itemIds?: string[]
  } = {}
): LabelOrder {
  const address = obj(order.shipping_address)
  const addressMeta = obj(address.metadata)
  const metadata = obj(order.metadata)

  const district = text(addressMeta.district)
  const neighbourhood = text(addressMeta.neighbourhood) || text(address.address_2)
  const cityLine = [district, text(address.city)].filter(Boolean).join(" / ")

  const allItems = Array.isArray(order.items) ? (order.items as Dict[]) : []
  const items = opts.itemIds ? allItems.filter((i) => opts.itemIds!.includes(text(i.id))) : allItems
  const lines = items.map((item) => ({
    title: text(item.product_title) || text(item.title),
    variant: variantText(item),
    sku: text(item.variant_sku) || text(obj(item.variant).sku),
    quantity: num(item.quantity) || num(obj(item.detail).quantity),
  }))

  const active = (Array.isArray(order.fulfillments) ? (order.fulfillments as Dict[]) : []).filter(
    (f) => !f.canceled_at
  )
  const fulfillment = opts.fulfillmentId
    ? active.find((f) => f.id === opts.fulfillmentId)
    : active.find((f) => !f.shipped_at && !f.delivered_at) || active[active.length - 1]
  const fData = readFulfillmentData(obj(fulfillment?.data))
  const fLabel = (Array.isArray(fulfillment?.labels) ? (fulfillment!.labels as Dict[]) : [])[0]

  const displayId = text(order.display_id)
  const orderNumber = opts.orderPrefix !== undefined
    ? `${opts.orderPrefix}${displayId || text(order.id)}`
    : buildOrderReference(displayId || text(order.id))

  return {
    id: text(order.id),
    displayId,
    createdAt: validDate(order.created_at),
    customerName: [text(address.first_name), text(address.last_name)].filter(Boolean).join(" "),
    phone: text(address.phone),
    email: text(order.email),
    addressLines: [
      text(address.address_1),
      neighbourhood,
      [cityLine, text(address.postal_code)].filter(Boolean).join(" "),
    ].filter(Boolean),
    lines,
    note: text(metadata.order_note),
    carrier: fData.carrier_name || (fData.carrier && fData.carrier !== "manual" ? carrierName(fData.carrier) : ""),
    trackingNumber: fData.tracking_number || text(fLabel?.tracking_number),
    shipment: labelShipment(fData, orderNumber),
    carrierLabelUrl: httpsUrl(fData.label_url) || httpsUrl(fLabel?.label_url),
    carrierLabelZpl: fData.label_zpl || "",
  }
}

export function formatLabelDate(date: Date | null): string {
  if (!date) return "—"
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}
