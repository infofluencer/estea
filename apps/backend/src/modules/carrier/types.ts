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

/**
 * Fulfillment metadata anahtarı (auto-fulfill yazar): siparişin iptal edilmiş eski kargo
 * kayıtlarının `shipment_ref`'leri → `CreateShipmentInput.order.canceledShipmentRefs`.
 */
export const CANCELED_SHIPMENT_REFS_METADATA_KEY = "escay_canceled_carrier_refs"

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
  /** Mahalle (checkout metadata.neighbourhood) — servis dışı bölge kontrolü için. */
  neighbourhood?: string
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
    /**
     * Bu siparişin daha önce firmada açılıp İPTAL edilmiş gönderi kimlikleri
     * (reship / yeniden aç). Referansı benzersiz isteyen firmada adaptör yeni
     * gönderi için bunlardan farklı bir referans üretir.
     */
    canceledShipmentRefs?: string[]
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
  /** fulfillment.data'ya birleştirilecek alanlar (takip linki, sonradan gelen etiket…). */
  patch?: Partial<FulfillmentData> & Record<string, unknown>
  /** Doluysa fulfillment etiket satırları bununla değişir (gecikmeli etiket). */
  labels?: LabelRow[]
  /** Admin Logs'a bir kez düşecek uyarı (ör. etiket saatlerdir alınamıyor). */
  alert?: { level: "warning" | "error"; title: string; detail?: string }
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
 * Taşıyıcıdan dönen hata — kod, mesaj ve istek bağlamı birlikte kaydedilsin
 * (log'a "[object Object]" düşmesin). Adaptörler HTTP/iş hatalarını bununla fırlatır.
 *
 * `shipmentRef`: gönderi firmada açıldı ama akış sonradan (teklif/kabul/etiket)
 * çöktü → yarım kalan kaydın kimliği. Service bunu hata mesajına ve log'a yazar;
 * adaptör mümkünse kaydı kendisi iptal eder (bkz. CarrierAdapter kuralları).
 */
export class CarrierError extends Error {
  readonly code: string
  readonly context: Record<string, unknown>
  readonly shipmentRef: string | null

  constructor(
    message: string,
    opts: { code?: string; context?: Record<string, unknown>; shipmentRef?: string | null; cause?: unknown } = {}
  ) {
    super(message)
    this.name = "CarrierError"
    this.code = opts.code || "CARRIER_ERROR"
    this.context = opts.context || {}
    this.shipmentRef = opts.shipmentRef || null
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 2000)
  } catch {
    return String(value)
  }
}

/** Hatanın log/olay satırı: `[KOD] mesaj (firmadaki kayıt: ref) {bağlam}` — düz obje gelirse de okunur. */
export function carrierErrorText(error: unknown): string {
  if (error instanceof CarrierError) {
    const ref = error.shipmentRef ? ` (firmadaki kayıt: ${error.shipmentRef})` : ""
    const ctx = Object.keys(error.context).length ? ` ${safeJson(error.context)}` : ""
    return `[${error.code}] ${error.message}${ref}${ctx}`
  }
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>
    const msg = o.message ?? (o.error as Record<string, unknown> | undefined)?.message
    if (typeof msg === "string" && msg) return msg
    return safeJson(error)
  }
  return String(error)
}

/**
 * Hesap sağlığı — cutover öncesi canlı test (scripts/smoke-carrier.ts) ve günlük
 * denetim (jobs/shipment-audit.ts). `balance` bakiye tabanlı aracılar için;
 * `warnings` pasif hesap, IP yetkisi, düşük bakiye gibi uyarılar (olay kaydına düşer).
 */
export type CarrierHealth = {
  ok: boolean
  /** TL — bakiye tabanlı aracıda; yoksa null. */
  balance?: number | null
  /** Bu eşiğin altında "bakiye düşük" uyarısı (TL). */
  lowBalanceThreshold?: number | null
  warnings: string[]
}

/**
 * Kargo firması adaptörü — firma API'si ile konuşan tek yer.
 *
 * Kurallar (blueprint §11/34-35, docs/KARGO-DERSLERI.md):
 *  - `createShipment` sipariş başına SABİT referans gönderir; POST'u körlemesine
 *    retry ETMEZ (5xx'te çoklu kayıt açılmasın). Yalnız okuma (getStatus, getLabel,
 *    quote, healthCheck) ve iptal istekleri yeniden denenebilir. "Satın al/onayla"
 *    adımından önce shipment ref'i `data`ya yazılmış olmalı.
 *  - Çok adımlı akış (aç → teklif → kabul → etiket) ara adımda çökerse adaptör
 *    firmadaki yarım kaydı İPTAL eder; edemiyorsa `CarrierError({ shipmentRef })`
 *    fırlatır: kimlik log/olay kaydına düşer, sonraki deneme ikinci kayıt açmaz.
 *  - Firmaya giden gövde şemayla doğrulanır (adet number, string değil); hatalar
 *    `CarrierError` ile kod + mesaj + istek bağlamı taşır.
 *  - `cancelShipment` throw etmez (Medusa iptali engellenmesin);
 *    `cancelShipmentStrict` reship/elle bağlama için reddedilirse throw eder.
 *  - `getStatus` ve `parseWebhook` birlikte çalışabilir; `applyCarrierAction`
 *    "already shipped/delivered" yarışını yutar. Webhook hızlandırıcıdır; durum
 *    takibi `getStatus` yoklamasıyla da tam çalışmalıdır.
 *  - Takip numarasının varlığı "kargoya verildi" sayılmaz; `shipped` yalnız
 *    firmanın "alındı" olayıyla (ya da admin onayıyla) döner.
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
  /** Hesap / yetki / bakiye kontrolü (smoke-carrier + günlük denetim). Yoksa adım atlanır. */
  healthCheck?(): Promise<CarrierHealth>
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
