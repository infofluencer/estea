/**
 * DHL eCommerce Türkiye (Apizone) adaptörü — `SHIPPING_CARRIER=dhl` (K1, 2026-11-04).
 * Resmi swagger ve senaryo tablosu: docs/DHL-APIZONE.md.
 *
 * Ortam (Mareen dersi: staging ve prod aynı sunucu/IP → DHL prod IP yetkisi staging'i de kapsar):
 *  - Host yalnız `DHL_ENV=prod` AÇIKÇA yazılırsa prod; başka her değer sandbox.
 *  - Prod'da gönderi/iade ancak `SHIPPING_CARRIER_TEST_MODE=false` iken açılır;
 *    test modunda prod'a yalnız okuma (durum, CBS, healthCheck) gider.
 *
 * Etiket yalnız ZPL gelir (`label_zpl`). PDF: `DHL_LABEL_PDF=labelary` ise Labelary'ye
 * çevrilir — alıcı adı/adres/telefon üçüncü tarafa gider, bu yüzden bilerek açılır.
 *
 * Webhook yok → durum `getStatus` yoklamasıyla (jobs/track-shipments.ts, 30 dk). Aynı
 * yoklama "etiket bekliyor" (20001) gönderilerin barkodunu da tamamlar.
 */
import { COMPANY } from "../../../../emails/company"
import { CarrierError, type CarrierAdapter, type CarrierHealth, type CarrierStatus, type LabelRow, type Recipient } from "../../types"
import { DhlClient, isNotFoundDhlError, unwrapList, unwrapOne, type DhlTransport } from "./client"
import {
  buildCreateReturnOrderBody,
  buildParty,
  createDhlShipment,
  DHL_ENUM,
  DhlGeoResolver,
  parseShipmentStatus,
  toDhlReference,
  toDhlReturnReference,
  tryCreateBarcode,
  type DhlParty,
  type ServiceArea,
} from "./shipment"

export const DHL_CODE = "dhl"
export const DHL_NAME = "DHL eCommerce"

export const DHL_BASE_URLS = {
  sandbox: "https://testapi.mngkargo.com.tr",
  prod: "https://api.mngkargo.com.tr",
} as const
type DhlEnv = keyof typeof DHL_BASE_URLS

/** DHL durum yanıtındaki `trackingUrl` biçimi (sandbox 2026-11-11); yoklama gelen linkle değiştirir. */
export const DEFAULT_TRACKING_URL_TEMPLATE = "https://kargotakip.mngkargo.com.tr/?takipNo={code}"

/**
 * Labelary adresi, etiketin kendi boyutuyla (203 dpi = 8 nokta/mm). DHL etiketi ^PW831 ^LL959
 * (≈10,4 × 12 cm) gelir; sabit 4×6 inç sayfa sağ kenarı (~2,4 mm) keser ve altına boşluk ekler.
 */
export function labelaryUrlFor(zpl: string): string {
  const dots = (re: RegExp) => Number(zpl.match(re)?.[1] ?? NaN)
  const w = dots(/\^PW(\d+)/)
  const h = dots(/\^LL(\d+)/)
  const inch = (n: number) => Math.ceil((n / 203.2) * 100) / 100
  const size = Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 ? `${inch(w)}x${inch(h)}` : "4x6"
  return `https://api.labelary.com/v1/printers/8dpmm/labels/${size}/`
}

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function flag(value: unknown, fallback: boolean): boolean {
  const v = String(value ?? "").trim().toLowerCase()
  if (!v) return fallback
  return !(v === "0" || v === "false" || v === "off" || v === "no")
}

export function readDhlOptions(env: Record<string, string | undefined> = process.env) {
  const dhlEnv: DhlEnv = String(env.DHL_ENV ?? "").trim().toLowerCase() === "prod" ? "prod" : "sandbox"
  const outOfService = String(env.DHL_OUT_OF_SERVICE ?? "").trim().toLowerCase()
  // Sandbox ve canlı kimlikleri aynı dosyada durabilsin: sandbox'ta DHL_SANDBOX_* önce gelir,
  // yoksa DHL_*. Canlıda DHL_SANDBOX_* hiç okunmaz.
  const cred = (name: string) => String((dhlEnv === "sandbox" && env[`DHL_SANDBOX_${name}`]?.trim() ? env[`DHL_SANDBOX_${name}`] : env[`DHL_${name}`]) ?? "")
  return {
    env: dhlEnv,
    // DHL_BASE_URL yalnız sandbox'ta ezilebilir: prod'a URL ile yanlışlıkla geçilmesin.
    baseUrl:
      dhlEnv === "sandbox" && env.DHL_BASE_URL?.trim() ? env.DHL_BASE_URL.trim().replace(/\/$/, "") : DHL_BASE_URLS[dhlEnv],
    clientId: cred("CLIENT_ID").trim(),
    clientSecret: cred("CLIENT_SECRET").trim(),
    customerNumber: cred("CUSTOMER_NUMBER").trim(),
    password: cred("PASSWORD"),
    timeoutMs: positiveInt(env.DHL_TIMEOUT_MS, 30000),
    barcodeRetryIntervalMs: positiveInt(env.DHL_BARCODE_RETRY_INTERVAL_MS, 10000),
    /** Gönderi açılırken barkod için en fazla bu kadar beklenir; sonra yoklama tamamlar. */
    barcodeRetryTimeoutMs: positiveInt(env.DHL_BARCODE_RETRY_TIMEOUT_MS, 60000),
    /** Barkod bu kadar dakikadır alınamıyorsa admin Logs'a uyarı. */
    barcodePendingAlertMinutes: positiveInt(env.DHL_BARCODE_PENDING_ALERT_MINUTES, 120),
    preRegisterRecipient: flag(env.DHL_CREATE_RECIPIENT, true),
    /** Servis dışı mahalle: "branch" = alıcı şubeden alır (deliveryType 2), "block" = gönderi açılmaz. */
    outOfServiceMode: (outOfService === "block" ? "block" : "branch") as "branch" | "block",
    /** SMS: varışta alıcıya / hazırlanınca alıcıya / teslimde bize. */
    sms: [flag(env.DHL_SMS_ON_ARRIVAL, true) ? 1 : 0, flag(env.DHL_SMS_ON_PREPARE, false) ? 1 : 0, flag(env.DHL_SMS_ON_DELIVERY, false) ? 1 : 0] as [
      0 | 1,
      0 | 1,
      0 | 1,
    ],
    /** İade kargo ücretini kim öder: 2 = alıcı (biz) — müşteri şubede ödemez. */
    returnPaymentType: String(env.DHL_RETURN_PAYMENT_TYPE ?? "").trim() === "1" ? 1 : 2,
    trackingUrlTemplate: String(env.DHL_TRACKING_URL_TEMPLATE ?? "").trim() || DEFAULT_TRACKING_URL_TEMPLATE,
    labelPdf: String(env.DHL_LABEL_PDF ?? "").trim().toLowerCase() === "labelary",
  }
}
export type DhlOptions = ReturnType<typeof readDhlOptions>

export function missingDhlCredentials(o: DhlOptions): string[] {
  const missing: string[] = []
  if (!o.clientId) missing.push("DHL_CLIENT_ID")
  if (!o.clientSecret) missing.push("DHL_CLIENT_SECRET")
  if (!o.customerNumber) missing.push("DHL_CUSTOMER_NUMBER")
  if (!o.password) missing.push("DHL_PASSWORD")
  return missing
}

export type DhlAdapterDeps = {
  /** Env yerine sabit ayar (testler). */
  options?: () => DhlOptions
  transport?: DhlTransport
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  fetchImpl?: typeof fetch
  logger?: { info: (m: string) => void; warn: (m: string) => void }
}

/** fulfillment.data'da saklanan alıcı özeti — iade siparişinde gönderici olur. */
type StoredParty = DhlParty & { neighbourhood?: string }

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "")

export const DHL_SIM_KEY = "dhl_sim"
/** Simülasyon kaydı: DHL durum kodu (1–8) ve isteğe bağlı teslim/iade ayrıntısı. */
export type DhlSimulatedStatus = { code: string; deliveredTo?: string; returnShipmentId?: string; at?: string }

const SIM_TEXT: Record<string, string> = {
  "1": "Gönderi Hazırlandı",
  "2": "Transfer Aşamasında",
  "3": "Gönderi Teslimat Biriminde",
  "4": "Teslimat Adresine Yönlendirildi",
  "5": "Teslim Edildi",
  "6": "Teslim Edilemedi",
  "7": "Göndericiye Geri Geliyor",
  "8": "Destek Gerekiyor",
}

/** `data.dhl_sim` varsa DHL durum yanıtı biçiminde gövde üretir (yalnız sandbox'ta çağrılır). */
export function simulatedStatusResponse(data: Record<string, unknown>, shipmentId: string): Record<string, unknown> | null {
  const sim = data[DHL_SIM_KEY] as DhlSimulatedStatus | undefined
  const code = str(sim?.code)
  if (!SIM_TEXT[code]) return null
  return {
    shipmentId: shipmentId || str(data.dhl_shipment_id),
    shipmentStatusCode: Number(code),
    shipmentStatus: SIM_TEXT[code],
    isDelivered: code === "5" ? 1 : 0,
    deliveryTo: code === "5" ? sim?.deliveredTo || "ALICI KENDİSİ" : "",
    deliveryDateTime: code === "5" ? sim?.at || "" : "",
    retrieveShipmentId: code === "7" ? sim?.returnShipmentId || "" : "",
  }
}

export function createDhlAdapter(deps: DhlAdapterDeps = {}): CarrierAdapter {
  const options = deps.options ?? (() => readDhlOptions())
  const logger = deps.logger ?? { info: (m: string) => console.info(m), warn: (m: string) => console.warn(m) }
  const now = deps.now ?? Date.now

  // Ayar değişirse (kimlik/host) yeni istemci; aynı ayarla JWT ve CBS önbelleği paylaşılır.
  let cached: { key: string; client: DhlClient; geo: DhlGeoResolver } | null = null
  function connect(): { o: DhlOptions; client: DhlClient; geo: DhlGeoResolver } {
    const o = options()
    const missing = missingDhlCredentials(o)
    if (missing.length) throw new CarrierError(`DHL kimlikleri eksik: ${missing.join(", ")}`, { code: "DHL_CONFIG" })
    const key = [o.baseUrl, o.clientId, o.clientSecret, o.customerNumber, o.password, o.timeoutMs].join("|")
    if (!cached || cached.key !== key) {
      const client = new DhlClient({ ...o, transport: deps.transport, now: deps.now, sleep: deps.sleep })
      cached = { key, client, geo: new DhlGeoResolver(client, deps.now) }
    }
    return { o, client: cached.client, geo: cached.geo }
  }

  function guardWrite(o: DhlOptions, testMode: boolean) {
    if (o.env === "prod" && testMode) {
      throw new CarrierError("DHL_ENV=prod iken test modunda gönderi açılmaz — gerçek gönderi için SHIPPING_CARRIER_TEST_MODE=false.", {
        code: "DHL_TEST_MODE_PROD",
      })
    }
  }

  const trackingUrl = (code: string) => (code ? options().trackingUrlTemplate.replace("{code}", encodeURIComponent(code)) : "")

  /** Bizim açtığımız gönderide DHL referansı; dışarıdan bağlananda yok. */
  const referenceOf = (data: Record<string, unknown>) => str(data.dhl_reference_id)

  const content = (orderReference: string) => `Es Cay siparis ${orderReference}`

  /** Alıcı → il/ilçe kodu + servis bölgesi + doğrulanmış kişi. */
  async function prepareParty(geo: DhlGeoResolver, recipient: Recipient) {
    const warnings: string[] = []
    let codes = { cityCode: 0, districtCode: 0 }
    try {
      const g = await geo.resolve(recipient)
      codes = { cityCode: g.cityCode, districtCode: g.districtCode }
      warnings.push(...g.warnings)
    } catch (error) {
      // CBS erişilemezse il = plaka kodu (DHL il kodları plakayla aynı), ilçe adla.
      const plate = Number(recipient.cityCode)
      codes = { cityCode: Number.isFinite(plate) ? plate : 0, districtCode: 0 }
      warnings.push(`CBS il/ilçe kodu alınamadı, adlarla gönderiliyor: ${(error as Error)?.message ?? error}`)
    }
    let area: ServiceArea = "unknown"
    try {
      area = await geo.serviceArea(codes.cityCode, codes.districtCode, recipient.neighbourhood)
    } catch (error) {
      warnings.push(`Servis dışı bölge kontrolü yapılamadı: ${(error as Error)?.message ?? error}`)
    }
    const party = buildParty(recipient, codes, COMPANY.emailOps)
    for (const w of warnings) logger.warn(`[dhl] ${w}`)
    return { party, area, warnings }
  }

  /** Gönderi/etiket alanları — createShipment ve gecikmeli barkod aynı biçimi yazar. */
  function shipmentFields(r: { shipmentId?: string; barcode?: string; zpl?: string; invoiceId?: string; labelMissing: boolean }, referenceId: string) {
    const trackingNumber = r.shipmentId || r.barcode || ""
    const data: Record<string, unknown> = {
      tracking_number: trackingNumber,
      tracking_url: trackingUrl(trackingNumber),
      barcode: r.barcode,
      label_zpl: r.zpl,
      dhl_shipment_id: r.shipmentId,
      dhl_invoice_id: r.invoiceId,
      dhl_barcode_pending: false,
      dhl_label_missing: r.labelMissing,
    }
    const labels: LabelRow[] = trackingNumber ? [{ tracking_number: trackingNumber, tracking_url: trackingUrl(trackingNumber), label_url: "" }] : []
    if (!trackingNumber) logger.warn(`[dhl] ${referenceId}: barkod yanıtında gönderi no yok`)
    return { data, labels }
  }

  async function cancelStrict(data: Record<string, unknown>): Promise<void> {
    const ref = referenceOf(data)
    if (!ref) {
      throw new CarrierError("DHL referansı yok (şubede açılmış/bağlanmış gönderi) — iptal DHL Online Şube'den yapılmalı.", {
        code: "DHL_NO_REFERENCE",
        shipmentRef: str(data.shipment_ref) || null,
      })
    }
    const { client } = connect()
    const shipmentId = str(data.dhl_shipment_id)
    if (shipmentId) {
      // Barkodlu: önce gönderi (yalnız basıldığı gün ve şube kabulünden önce), sonra sipariş.
      try {
        await client.cancelShipment(ref, shipmentId)
      } catch (error) {
        if (!isNotFoundDhlError(error)) {
          throw new CarrierError(
            `DHL gönderisi ${shipmentId} iptal edilemedi: ${(error as Error).message}. Şube kabul ettiyse ya da gün geçtiyse iptal DHL'den istenmeli.`,
            { code: (error as CarrierError).code ?? "DHL_CANCEL", context: (error as CarrierError).context ?? {}, shipmentRef: ref }
          )
        }
      }
    }
    try {
      await client.cancelOrder(ref)
    } catch (error) {
      // Kayıt yoksa iptal edilmiş sayılır; barkodlu gönderi iptal edildiyse sipariş iptali en iyi çaba.
      if (isNotFoundDhlError(error) || shipmentId) {
        logger.warn(`[dhl] cancelorder ${ref}: ${(error as Error).message} (yok sayıldı)`)
        return
      }
      throw error
    }
  }

  async function statusFor(data: Record<string, unknown>): Promise<CarrierStatus> {
    const { o, client } = connect()
    const ref = referenceOf(data)

    // 1) Etiket bekleyen gönderi: barkodu şimdi almayı dene.
    if (ref && data.dhl_barcode_pending === true) {
      const parcel = (data.dhl_parcel as { weight: number; length: number; width: number; height: number } | undefined) ?? {
        weight: 1,
        length: 30,
        width: 20,
        height: 10,
      }
      const r = await tryCreateBarcode(client, { referenceId: ref, parcel, content: content(str(data.order_reference) || ref) })
      if (!("pending" in r)) {
        const f = shipmentFields({ ...r.result, labelMissing: r.labelMissing }, ref)
        logger.info(`[dhl] Gecikmeli barkod alındı: ${ref} → ${r.result.shipmentId}`)
        return {
          code: "1",
          description: "Gönderi hazırlandı (etiket alındı)",
          action: "none",
          patch: f.data,
          labels: f.labels,
          ...(r.labelMissing
            ? { alert: { level: "warning" as const, title: "DHL etiketi alınamadı, Online Şube'den basın", detail: `Gönderi no ${r.result.shipmentId}` } }
            : {}),
        }
      }
      const since = Date.parse(str(data.dhl_created_at))
      const ageMin = Number.isFinite(since) ? (now() - since) / 60000 : 0
      return {
        code: "BARCODE_PENDING",
        description: "DHL varış şubesi atanmadı, etiket bekleniyor",
        action: "none",
        patch: { dhl_barcode_last_error: r.error.message },
        ...(ageMin >= o.barcodePendingAlertMinutes
          ? {
              alert: {
                level: "error" as const,
                title: "DHL etiketi saatlerdir alınamıyor (varış şubesi yok)",
                detail: `${ref}: ${Math.round(ageMin)} dk. Adres/ilçe DHL'de eşleşmiyor olabilir — adresi kontrol edin, entegrasyon.tr@dhl.com'a yazın; düzelince yoklama etiketi kendisi alır.`,
              },
            }
          : {}),
      }
    }

    // 2) Durum sorgusu: referansla; dışarıdan bağlananda gönderi no ile.
    const shipmentId = str(data.dhl_shipment_id) || (!ref ? str(data.shipment_ref) || str(data.tracking_number) : "")
    if (!ref && !shipmentId) throw new CarrierError("DHL durum sorgusu için referans/gönderi no yok.", { code: "DHL_NO_REFERENCE" })
    let json: unknown
    try {
      // Sandbox'ta gönderi fiziksel olarak ilerlemez; simülasyon (scripts/dhl-simulate.ts) durumu
      // kayda yazar ve gerçek yanıt yerine o kullanılır. Canlıda bu alan hiç okunmaz.
      json =
        (o.env === "sandbox" ? simulatedStatusResponse(data, shipmentId) : null) ??
        (ref ? await client.getShipmentStatus(ref) : await client.getShipmentStatusByShipmentId(shipmentId))
    } catch (error) {
      if (!isNotFoundDhlError(error)) throw error
      return {
        code: "NOT_FOUND",
        description: "DHL'de gönderi bulunamadı",
        action: "none",
        alert: {
          level: "warning",
          title: "DHL gönderisi bulunamadı",
          detail: `${ref || shipmentId}: DHL'de iptal edilmiş ya da hiç barkodlanmamış olabilir. Online Şube'den kontrol edin.`,
        },
      }
    }
    const s = parseShipmentStatus(json)
    const patch: Record<string, unknown> = {}
    if (s.trackingUrl && s.trackingUrl !== data.tracking_url) patch.tracking_url = s.trackingUrl
    if (s.shipmentId && !data.dhl_shipment_id) patch.dhl_shipment_id = s.shipmentId
    if (s.deliveredTo) patch.dhl_delivered_to = s.deliveredTo
    if (s.deliveredAt) patch.dhl_delivered_at = s.deliveredAt
    if (s.returnShipmentId) patch.dhl_return_shipment_id = s.returnShipmentId
    return {
      code: s.code,
      description: s.description,
      action: s.action,
      ...(Object.keys(patch).length ? { patch } : {}),
      ...(s.code === "8"
        ? { alert: { level: "error" as const, title: "DHL gönderide destek istiyor", detail: `${ref || shipmentId}: Online Şube → teslimat problemleri.` } }
        : {}),
    }
  }

  return {
    code: DHL_CODE,
    name: DHL_NAME,

    owns: (data) => data?.carrier === DHL_CODE || typeof data?.dhl_reference_id === "string",

    async createShipment(input) {
      const { o, client, geo } = connect()
      guardWrite(o, input.testMode)
      const referenceId = toDhlReference(input.order.reference, input.order.canceledShipmentRefs)
      const { party, area, warnings } = await prepareParty(geo, input.recipient)

      if (area === "out_of_service" && o.outOfServiceMode === "block") {
        throw new CarrierError(
          `${input.recipient.neighbourhood} (${input.recipient.districtName}/${input.recipient.cityName}) DHL servis dışı bölge — gönderi açılmadı. Müşteriyle şubeden teslim için konuşun ya da DHL_OUT_OF_SERVICE=branch.`,
          { code: "DHL_OUT_OF_SERVICE" }
        )
      }
      const deliveryType = area === "out_of_service" ? DHL_ENUM.deliveryType.branchPickup : DHL_ENUM.deliveryType.toAddress
      if (area === "out_of_service") logger.warn(`[dhl] ${referenceId}: servis dışı mahalle → alıcı şubeden alacak (deliveryType 2)`)

      const result = await createDhlShipment(
        client,
        {
          referenceId,
          party,
          parcel: input.parcel,
          content: content(input.order.reference),
          deliveryType,
          paymentType: DHL_ENUM.paymentType.senderPays,
          sms: o.sms,
        },
        {
          preRegisterRecipient: o.preRegisterRecipient,
          retryIntervalMs: o.barcodeRetryIntervalMs,
          retryTimeoutMs: o.barcodeRetryTimeoutMs,
          logger,
          sleep: deps.sleep,
          now: deps.now,
        }
      )

      const base: Record<string, unknown> = {
        shipment_ref: referenceId,
        dhl_env: o.env,
        dhl_reference_id: referenceId,
        dhl_created_at: new Date(now()).toISOString(),
        dhl_order_already_existed: result.orderAlreadyExisted,
        dhl_barcode_attempts: result.barcodeAttempts,
        dhl_recipient_pre_registered: result.recipientPreRegistered,
        dhl_delivery_type: deliveryType,
        dhl_service_area: area,
        dhl_parcel: input.parcel,
        dhl_party: { ...party, neighbourhood: input.recipient.neighbourhood ?? "" } satisfies StoredParty,
        ...(warnings.length ? { dhl_warnings: warnings } : {}),
      }
      if (result.barcodePending) {
        return {
          data: { ...base, dhl_barcode_pending: true, dhl_barcode_last_error: result.lastError, status: "Etiket bekleniyor (DHL varış şubesi)" },
          labels: [],
        }
      }
      const f = shipmentFields({ ...result, labelMissing: result.labelMissing }, referenceId)
      return { data: { ...base, ...f.data }, labels: f.labels }
    },

    async cancelShipment(data) {
      const ref = referenceOf(data)
      if (!ref) return {}
      try {
        await cancelStrict(data)
        logger.info(`[dhl] İptal edildi: ${ref}`)
        return { dhl_canceled: true }
      } catch (error) {
        logger.warn(`[dhl] İptal başarısız (${ref}): ${(error as Error).message}`)
        return { dhl_canceled: false, dhl_cancel_error: (error as Error).message }
      }
    },

    cancelShipmentStrict: cancelStrict,

    getStatus: statusFor,

    async getLabel(data, format) {
      const zpl = str(data.label_zpl)
      if (!zpl) {
        const why = data.dhl_barcode_pending
          ? "etiket henüz alınmadı (varış şubesi bekleniyor; yoklama alınca gelir)"
          : data.dhl_label_missing
            ? `DHL etiketi kaydedilemedi — Online Şube'den gönderi no ${str(data.dhl_shipment_id)} ile basın`
            : "kayıtta DHL etiketi (ZPL) yok"
        throw new CarrierError(`DHL etiketi: ${why}.`, { code: "DHL_NO_LABEL" })
      }
      if (format === "zpl") return zpl
      if (!options().labelPdf) {
        throw new CarrierError(
          "DHL etiketi ZPL; PDF için DHL_LABEL_PDF=labelary açılmalı (etiket verisi Labelary'ye gider) ya da Zebra yazıcıya ZPL basılmalı.",
          { code: "DHL_LABEL_PDF_DISABLED" }
        )
      }
      const fetchImpl = deps.fetchImpl ?? fetch
      const response = await fetchImpl(labelaryUrlFor(zpl), {
        method: "POST",
        headers: { Accept: "application/pdf", "Content-Type": "application/x-www-form-urlencoded" },
        body: zpl,
      })
      if (!response.ok) {
        throw new CarrierError(`Labelary PDF çevrimi başarısız: HTTP ${response.status}`, {
          code: "DHL_LABEL_PDF",
          context: { body: (await response.text()).slice(0, 300) },
        })
      }
      const pdf = Buffer.from(await response.arrayBuffer())
      if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new CarrierError("Labelary PDF döndürmedi.", { code: "DHL_LABEL_PDF" })
      return pdf
    },

    /**
     * Kodlu iade: DHL'de iade siparişi (gönderici = müşteri, ücret varsayılan bizde).
     * Müşteri şubede firma no (RETURN_CUSTOMER_NUMBER) + iade kodunu söyler; DHL
     * etiket linki de dönerse mailde gider. İade başına sabit referans → tekrar 3002.
     */
    async createReturn(originalData, returnId) {
      const { o, client } = connect()
      guardWrite(o, Boolean(originalData.test_mode))
      const party = originalData.dhl_party as StoredParty | undefined
      if (!party?.fullName) {
        throw new CarrierError("Orijinal DHL gönderisinde alıcı özeti yok (eski/dış gönderi) — iade kodunu elle açın.", {
          code: "DHL_NO_PARTY",
        })
      }
      const orderRef = str(originalData.order_reference) || referenceOf(originalData)
      const referenceId = toDhlReturnReference(orderRef, returnId)
      const parcel = (originalData.dhl_parcel as { weight: number; length: number; width: number; height: number }) ?? {
        weight: 1,
        length: 30,
        width: 20,
        height: 10,
      }
      let labelUrl: string | null = null
      let existed = false
      try {
        const res = unwrapOne<Record<string, unknown>>(
          await client.createReturnOrder(
            buildCreateReturnOrderBody({
              referenceId,
              party,
              parcel,
              content: `Es Cay iade ${orderRef}`,
              deliveryType: DHL_ENUM.deliveryType.toAddress,
              paymentType: o.returnPaymentType,
              sms: [0, 0, 0],
            })
          )
        )
        labelUrl = str(res.returnOrderLabelURL) || null
      } catch (error) {
        if ((error as CarrierError)?.context?.kind !== "order_exists") throw error
        existed = true
      }
      logger.info(`[dhl] İade siparişi ${existed ? "zaten vardı" : "açıldı"}: ${referenceId}`)
      return {
        returnCode: referenceId,
        trackingNumber: referenceId,
        trackingUrl: null,
        labelUrl,
        data: { dhl_return_reference_id: referenceId, dhl_return_label_url: labelUrl, dhl_return_existed: existed },
      }
    },

    trackingUrl,

    async healthCheck(): Promise<CarrierHealth> {
      const o = options()
      const missing = missingDhlCredentials(o)
      if (missing.length) return { ok: false, warnings: [`DHL kimlikleri eksik: ${missing.join(", ")}`] }
      const { client } = connect()
      const warnings: string[] = []
      if (o.env === "sandbox") warnings.push("DHL sandbox (DHL_ENV=prod değil)")
      try {
        await client.getToken(true)
      } catch (error) {
        warnings.push(`DHL token alınamadı: ${(error as Error).message}`)
        return { ok: false, warnings }
      }
      // Abonelik yoklaması — yalnız okuma uçları (yazma uçları yan etkisiz denenemez).
      const probes: [string, () => Promise<unknown>][] = [
        ["CBS Info", () => client.getCities()],
        ["Standard Query", () => client.getShipmentStatus("ESCHEALTHCHECK0")],
      ]
      let ok = true
      for (const [name, probe] of probes) {
        try {
          await probe()
        } catch (error) {
          if (isNotFoundDhlError(error)) continue // uç erişilebilir, kayıt yok — beklenen
          const kind = (error as CarrierError)?.context?.kind
          if (kind === "subscription" || kind === "forbidden") ok = false
          warnings.push(`${name}: ${(error as Error).message}`)
        }
      }
      try {
        for (const row of unwrapList<Record<string, unknown>>(await client.getApiStatuses())) {
          const st = str(row.status)
          if (st && !/operational/i.test(st)) warnings.push(`DHL ${str(row.apiName)}: ${st}`)
        }
      } catch {
        // Utility aboneliği isteğe bağlı.
      }
      return { ok, warnings }
    },
  }
}

export const dhlAdapter = createDhlAdapter()
