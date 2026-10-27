/**
 * Kargo katmanı sözleşmesi (blueprint §4.13).
 *
 * Medusa tarafında TEK generic fulfillment provider vardır (`carrier_carrier`,
 * bkz. service.ts). Hangi kargo firmasıyla konuşulacağı `SHIPPING_CARRIER`
 * env'i ile seçilen bir `CarrierAdapter` ile belirlenir (registry.ts).
 * Adaptör yoksa (varsayılan) kargo Medusa'nın yerleşik `manual_manual`
 * provider'ı ile elle yürür: admin "Kargoya ver (takip no)" → mailler.
 *
 * Bu dosya saf tiptir: HTTP yok, container yok.
 */

/** Shipping option / fulfillment `provider_id` (identifier "carrier" + id "carrier"). */
export const CARRIER_PROVIDER_ID = "carrier_carrier"
/** Medusa yerleşik elle kargo provider'ı. */
export const MANUAL_PROVIDER_ID = "manual_manual"

/** Admin kargo seçeneğinin `data.id` değeri — getFulfillmentOptions ile eşleşir. */
export const CARRIER_FULFILLMENT_OPTION_ID = "carrier-standard"
export const CARRIER_RETURN_OPTION_ID = "carrier-standard-return"

/** Değişim gönderisinin sipariş referansı eki: ESC-65 → ESC-65-D */
export const EXCHANGE_ORDER_NO_SUFFIX = "-D"

export type Parcel = {
  /** kg */
  weight: number
  /** cm */
  length: number
  width: number
  height: number
}

export type Recipient = {
  name: string
  email: string
  /** +90… (shared/tr-address normalizeTrPhone) */
  phone: string
  address1: string
  address2?: string
  countryCode: string
  /** Plaka kodu, "34" */
  cityCode: string
  cityName: string
  districtName: string
  zip?: string
}

/** Medusa fulfillment `labels[]` satırı. */
export type LabelRow = {
  tracking_number: string
  tracking_url: string
  label_url: string
}

/**
 * Medusa tarafında tetiklenmesi gereken aksiyon.
 *  - `none`      : sadece takip verisini güncelle
 *  - `shipped`   : kurye paketi aldı → "Kargoya verildi" maili
 *  - `delivered` : teslim edildi → "Teslim edildi" maili
 *  - `canceled`  : gönderi iptal
 *  - `returned`  : iade süreci
 *  - `failed`    : kargo tarafında hata
 */
export type FulfillmentAction =
  | "none"
  | "shipped"
  | "delivered"
  | "canceled"
  | "returned"
  | "failed"

export type ShipmentItem = {
  title: string
  sku?: string
  quantity: number
  /** TL, KDV dahil birim fiyat (bazı firmalar sigorta/ödeme bilgisi ister). */
  unitPrice?: number | null
}

export type CreateShipmentInput = {
  order: {
    id: string
    displayId: number | string | null
    /** Firmaya giden SABİT referans: ORDER_REF_PREFIX + display_id (+ "-D" değişimde). */
    reference: string
    isExchange: boolean
    currencyCode: string
    total?: number | null
  }
  fulfillmentId?: string
  recipient: Recipient
  parcel: Parcel
  items: ShipmentItem[]
  /** SHIPPING_CARRIER_TEST_MODE — sandbox / gerçek kargo oluşturma. */
  testMode: boolean
}

export type CarrierStatus = {
  code: string
  description: string
  action: FulfillmentAction
}

/** Webhook ayrıştırma sonucu (adaptör üretir, route işler). */
export type CarrierWebhook = {
  /** fulfillment.data.shipment_ref ile eşleşir. */
  shipmentRef: string
  /** Varsa sipariş referansı (ESC-65) — fulfillment'ı hızlı bulmak için. */
  orderReference?: string | null
  action: FulfillmentAction
  /** fulfillment.data'ya birleştirilecek güncel alanlar. */
  patch: Partial<FulfillmentData>
  labels?: LabelRow[]
  /** Logs satırı için kısa özet ("SHIPPED / TRANSIT"). */
  summary?: string
}

export type WebhookRequest = {
  headers: Record<string, string | string[] | undefined>
  query: Record<string, unknown>
  body: unknown
  rawBody?: string | Buffer
}

export type CreateReturnResult = {
  returnCode?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  labelUrl?: string | null
  data: Record<string, unknown>
}

/**
 * Kargo firması adaptörü — firma API'si ile konuşan tek yer.
 *
 * Kurallar (blueprint §11/34-35):
 *  - `createShipment` sipariş başına SABİT referans gönderir; POST'u körlemesine
 *    retry ETMEZ (5xx'te çoklu kayıt açılmasın). "Satın al/onayla" adımından
 *    önce shipment ref'i `data`ya yazılmış olmalı.
 *  - `cancelShipment` throw etmez (Medusa iptali engellenmesin);
 *    `cancelShipmentStrict` reship/elle bağlama için reddedilirse throw eder.
 *  - `getStatus` ve `parseWebhook` birlikte çalışabilir; `applyCarrierAction`
 *    "already shipped/delivered" yarışını yutar.
 */
export interface CarrierAdapter {
  /** data.carrier değeri ve SHIPPING_CARRIER env anahtarı (küçük harf, ör. "aras"). */
  readonly code: string
  /** Müşteriye görünen ad ("Aras Kargo"). */
  readonly name: string
  /** Mevcut fulfillment kaydını bu adaptör mü açtı? */
  owns(data: Record<string, unknown> | null | undefined): boolean
  createShipment(input: CreateShipmentInput): Promise<{ data: Partial<FulfillmentData> & Record<string, unknown>; labels: LabelRow[] }>
  cancelShipment(data: Record<string, unknown>): Promise<Record<string, unknown>>
  cancelShipmentStrict?(data: Record<string, unknown>): Promise<void>
  /** Checkout `price_type: calculated` için teklif; null → flat yedek. */
  quote?(parcel: Parcel, recipientCityCode?: string | null): Promise<number | null>
  /** Polling job'u için güncel durum. */
  getStatus?(data: Record<string, unknown>): Promise<CarrierStatus>
  /** Webhook gövdesini ayrıştırır; imza/sır tutmazsa null (route 200 döner, işlem yok). */
  parseWebhook?(req: WebhookRequest): CarrierWebhook | null
  /** Etiket dosyası; yoksa data.label_url PDF olarak çekilir. */
  getLabel?(data: Record<string, unknown>, format: "pdf" | "zpl"): Promise<Buffer | string>
  /** Kodlu iade / iade etiketi; yoksa iade kodu admin'den elle girilir. */
  createReturn?(originalData: Record<string, unknown>, returnId: string): Promise<CreateReturnResult>
  /** Müşteri takip linki şablonu. */
  trackingUrl(trackingNumber: string): string
}

/**
 * Normalize `fulfillment.data` sözleşmesi — mailler, etiketler, admin widget'ları,
 * storefront OrderDetail ve shared/order-timeline yalnızca bu anahtarları okur.
 */
export type FulfillmentData = {
  /** Adaptör kodu ("aras", "manual"). */
  carrier?: string
  /** Müşteriye görünen firma adı. */
  carrier_name?: string
  tracking_number?: string
  tracking_url?: string
  label_url?: string
  label_zpl?: string
  /** Firmadaki gönderi kimliği (webhook/polling eşleşmesi). */
  shipment_ref?: string
  /** Firmaya giden sipariş referansı (ESC-65 / ESC-65-D). */
  order_reference?: string
  barcode?: string
  status_code?: string
  status?: string
  status_at?: string
  test_mode?: boolean
  updated_at?: string
  [key: string]: unknown
}

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : typeof value === "number"
      ? String(value)
      : ""
}

/** Ham `fulfillment.data`'yı normalize alanlara indirger (boşlar atlanır). */
export function readFulfillmentData(
  data: Record<string, unknown> | null | undefined
): FulfillmentData {
  const d = (data || {}) as Record<string, unknown>
  const out: FulfillmentData = {}
  for (const key of [
    "carrier",
    "carrier_name",
    "tracking_number",
    "tracking_url",
    "label_url",
    "label_zpl",
    "shipment_ref",
    "order_reference",
    "barcode",
    "status_code",
    "status",
    "status_at",
    "updated_at",
  ] as const) {
    const v = text(d[key])
    if (v) out[key] = v
  }
  if (typeof d.test_mode === "boolean") out.test_mode = d.test_mode
  return out
}

/** Firmada açılmış gerçek bir gönderi var mı (manuel takip no girişi sayılmaz)? */
export function hasCarrierShipment(data: Record<string, unknown> | null | undefined): boolean {
  const d = readFulfillmentData(data)
  return Boolean(d.shipment_ref) && (d.carrier || "") !== "manual"
}

/** Adaptör çıktısındaki boş alanları atarak data'ya birleştirir. */
export function mergeFulfillmentData(
  previous: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(previous || {}) }
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null || v === undefined || v === "") continue
    out[k] = v
  }
  out.updated_at = new Date().toISOString()
  return out
}
