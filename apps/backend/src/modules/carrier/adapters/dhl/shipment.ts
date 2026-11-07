/**
 * DHL giden/iade gönderi akışı ve saf dönüşümler (resmi swagger: docs/DHL-APIZONE.md).
 *
 *   createRecipient (Plus, isteğe bağlı) → createOrder → createbarcode
 *
 * Senaryolar:
 *  - 20001 varış şubesi yok → AYNI siparişle bekle/tekrar; süre dolarsa "etiket bekliyor"
 *    olarak döner, yoklama job'u barkodu sonra alır (sipariş DHL'de açık kalır).
 *  - 3002 sipariş zaten var → barkoda geç (ikinci kayıt yok).
 *  - createOrder zaman aşımı/5xx (belirsiz) → POST tekrarlanmaz; getorder ile var mı bakılır.
 *  - createbarcode belirsiz / "zaten barkodlu" → getshipment ile gönderi no alınır; ZPL
 *    kaybolduysa etiket DHL Online Şube'den basılır (data.dhl_label_missing).
 *  - Servis dışı mahalle → alıcı şubeden alır (deliveryType 2) ya da engellenir (env).
 *  - Reship: iptal edilmiş referans tekrar kullanılmaz (ESC65 → ESC65R2).
 *
 * Mareen dersi: pakette DHL'nin "son barkod" etiketi (createbarcode ZPL'i) olmalı;
 * referans barkodlu etiket (printReferenceBarcodeOnError=1) şubede kabul edilmedi.
 */
import { CarrierError, type CarrierStatus, type FulfillmentAction, type Parcel, type Recipient } from "../../types"
import { foldTr } from "../../tr-geo"
import { isNotFoundDhlError, isTransientDhlError, unwrapList, unwrapOne, type DhlClient } from "./client"

/** Apizone enum değerleri (swagger). */
export const DHL_ENUM = {
  shipmentServiceType: { standard: 1, sameDay: 7, evening: 8 },
  packagingType: { file: 1, mi: 2, package: 3, box: 4 },
  paymentType: { senderPays: 1, recipientPays: 2 },
  deliveryType: { toAddress: 1, branchPickup: 2 },
} as const

/** DHL referenceId: büyük harf, alfasayısal, en fazla 20. */
const MAX_REFERENCE_LENGTH = 20

export function sanitizeDhlReference(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/**
 * ESC-65 → ESC65, ESC-65-D → ESC65D. Reship'te iptal edilmiş referans tekrar
 * kullanılmaz: ESC65 iptal → ESC65R2, ESC65R2 iptal → ESC65R3.
 */
export function toDhlReference(orderReference: string, canceledRefs: string[] = []): string {
  const base = sanitizeDhlReference(orderReference)
  if (!base) throw new CarrierError("DHL referenceId üretilemedi: sipariş referansı boş.", { code: "DHL_INVALID_REFERENCE" })
  const used = new Set(canceledRefs.map(sanitizeDhlReference))
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? "" : `R${n}`
    const ref = `${base.slice(0, MAX_REFERENCE_LENGTH - suffix.length)}${suffix}`
    if (!used.has(ref)) return ref
  }
  throw new CarrierError(`DHL referansı tükendi (${base}: 99 iptal).`, { code: "DHL_INVALID_REFERENCE" })
}

/** İade referansı: sipariş + "I" + iade kimliği kuyruğu — iade başına sabit (tekrar → 3002). */
export function toDhlReturnReference(orderReference: string, returnId: string): string {
  const base = sanitizeDhlReference(orderReference)
  const tail = sanitizeDhlReference(returnId.replace(/^return_/i, "")).slice(-6) || "X"
  return `${base.slice(0, MAX_REFERENCE_LENGTH - 1 - tail.length)}I${tail}`
}

/** 10 hane, başında 0 / ülke kodu olmadan. */
export function toDhlPhone(phone: string): string {
  let digits = String(phone ?? "").replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("90")) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1)
  return digits
}

/** Desi = en×boy×yükseklik / 3000, yukarı yuvarlanır; kg yukarı yuvarlanır. En az 1 (swagger: int32). */
export function parcelToPiece(parcel: Parcel): { desi: number; kg: number } {
  const desi = (parcel.length * parcel.width * parcel.height) / 3000
  return {
    desi: Math.max(1, Math.ceil((Number.isFinite(desi) ? desi : 1) - 1e-9)),
    kg: Math.max(1, Math.ceil((Number.isFinite(parcel.weight) ? parcel.weight : 1) - 1e-9)),
  }
}

/** Etiket/içerik metni: kısa, tek satır. */
function clip(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

// ── CBS Info: il/ilçe kodları, servis dışı ve mobil bölgeler ─────────────────

type CbsEntry = { code: number; name: string }

/** "ADANA 11" / "Adana" → katlanmış ad (sondaki plaka eki atılır). */
function geoKey(name: string): string {
  return foldTr(name.replace(/\s+\d+\s*$/, ""))
}

function readCbsList(json: unknown): CbsEntry[] {
  const out: CbsEntry[] = []
  for (const row of unwrapList<Record<string, unknown>>(json)) {
    if (!row || typeof row !== "object") continue
    const code = Number(row.code ?? row.cityCode ?? row.districtCode ?? row.id)
    const name = String(row.name ?? row.cityName ?? row.districtName ?? "")
    if (Number.isFinite(code) && name) out.push({ code, name })
  }
  return out
}

/** Mahalle listesi (servis dışı / mobil) → katlanmış ad kümesi. */
function readNeighbourhoods(json: unknown): Set<string> {
  const out = new Set<string>()
  for (const row of unwrapList<Record<string, unknown>>(json)) {
    const name = String(row?.neighborhood ?? row?.neighbourhood ?? row?.name ?? "")
    if (name) out.add(neighbourhoodKey(name))
  }
  return out
}

export function neighbourhoodKey(name: string): string {
  return foldTr(name.replace(/\b(mahallesi|mahalle|mah\.?|mh\.?)\s*$/i, ""))
}

const CBS_TTL_MS = 24 * 60 * 60 * 1000

export type ResolvedGeo = { cityCode: number; districtCode: number; warnings: string[] }
export type ServiceArea = "normal" | "out_of_service" | "mobile" | "unknown"

/** İl/ilçe adı → DHL kodu; servis dışı/mobil mahalle (24 saat önbellek). */
export class DhlGeoResolver {
  private cities: { at: number; list: CbsEntry[] } | null = null
  private districts = new Map<number, { at: number; list: CbsEntry[] }>()
  private areas = new Map<string, { at: number; out: Set<string>; mobile: Set<string> }>()

  constructor(
    private readonly client: Pick<DhlClient, "getCities" | "getDistricts" | "getOutOfServiceAreas" | "getMobileAreas">,
    private readonly now: () => number = Date.now
  ) {}

  private fresh(entry: { at: number } | null | undefined): boolean {
    return Boolean(entry && this.now() - entry.at < CBS_TTL_MS)
  }

  /** Bulunamayan kod 0 döner (+ uyarı); çağıran adları da gönderir. */
  async resolve(recipient: Pick<Recipient, "cityName" | "cityCode" | "districtName">): Promise<ResolvedGeo> {
    const warnings: string[] = []
    if (!this.fresh(this.cities)) {
      this.cities = { at: this.now(), list: readCbsList(await this.client.getCities()) }
    }
    const cityKey = geoKey(recipient.cityName)
    const plate = Number(recipient.cityCode)
    const city =
      this.cities!.list.find((c) => geoKey(c.name) === cityKey) ??
      (Number.isFinite(plate) && plate > 0 ? this.cities!.list.find((c) => c.code === plate) : undefined)
    if (!city) {
      warnings.push(`DHL il kodu bulunamadı: ${recipient.cityName}`)
      return { cityCode: 0, districtCode: 0, warnings }
    }

    let districts = this.districts.get(city.code)
    if (!this.fresh(districts)) {
      districts = { at: this.now(), list: readCbsList(await this.client.getDistricts(city.code)) }
      this.districts.set(city.code, districts)
    }
    const dKey = geoKey(recipient.districtName)
    const district =
      districts!.list.find((d) => geoKey(d.name) === dKey) ??
      // Yazım farkı ("Merkez" eki vb.): yalnız TEK aday içerme ile eşleşirse kabul.
      (() => {
        const partial = districts!.list.filter((d) => geoKey(d.name).includes(dKey) || dKey.includes(geoKey(d.name)))
        return partial.length === 1 ? partial[0] : undefined
      })()
    if (!district) warnings.push(`DHL ilçe kodu bulunamadı: ${recipient.cityName}/${recipient.districtName}`)
    return { cityCode: city.code, districtCode: district?.code ?? 0, warnings }
  }

  /** Mahalle servis dışı mı / mobil mi? Bilinmiyorsa "unknown" (gönderi engellenmez). */
  async serviceArea(cityCode: number, districtCode: number, neighbourhood?: string): Promise<ServiceArea> {
    if (!cityCode || !districtCode || !neighbourhood) return "unknown"
    const key = `${cityCode}/${districtCode}`
    let entry = this.areas.get(key)
    if (!this.fresh(entry)) {
      const list = async (fn: () => Promise<unknown>) => {
        try {
          return readNeighbourhoods(await fn())
        } catch (error) {
          if (isNotFoundDhlError(error)) return new Set<string>() // 404 = bu ilçede yok
          throw error
        }
      }
      entry = {
        at: this.now(),
        out: await list(() => this.client.getOutOfServiceAreas(cityCode, districtCode)),
        mobile: await list(() => this.client.getMobileAreas(cityCode, districtCode)),
      }
      this.areas.set(key, entry)
    }
    const n = neighbourhoodKey(neighbourhood)
    if (entry!.out.has(n)) return "out_of_service"
    if (entry!.mobile.has(n)) return "mobile"
    return "normal"
  }
}

// ── İstek gövdeleri ─────────────────────────────────────────────────────────

export type DhlParty = {
  cityCode: number
  districtCode: number
  cityName: string
  districtName: string
  address: string
  fullName: string
  email: string
  mobilePhoneNumber: string
  homePhoneNumber: string
}

/**
 * Alıcı/gönderici kişi — gönderilmeden önce doğrulanır (DHL'in 400'ünü beklemeden
 * anlaşılır hata). Swagger: customerId YOKSA FullName, CityCode, DistrictCode,
 * Address ve telefonlardan biri zorunlu; customerId ile fullName birlikte gönderilmez.
 */
export function buildParty(recipient: Recipient, geo: { cityCode: number; districtCode: number }, fallbackEmail: string): DhlParty {
  const problems: string[] = []
  const fullName = clip(recipient.name, 100)
  if (!fullName) problems.push("ad soyad boş")

  const parts = [recipient.address1, recipient.address2]
  if (recipient.neighbourhood && !foldTr(parts.join(" ")).includes(neighbourhoodKey(recipient.neighbourhood))) {
    parts.unshift(`${recipient.neighbourhood}${/mah/i.test(recipient.neighbourhood) ? "" : " Mah."}`)
  }
  const address = clip(parts.filter(Boolean).join(" "), 250)
  if (address.length < 5) problems.push("açık adres boş/çok kısa")

  const phone = toDhlPhone(recipient.phone)
  if (phone.length !== 10) problems.push(`telefon 10 hane olmalı (${recipient.phone || "boş"})`)
  if (!recipient.cityName && !geo.cityCode) problems.push("il boş")
  if (!recipient.districtName && !geo.districtCode) problems.push("ilçe boş")

  if (problems.length) {
    throw new CarrierError(`DHL alıcı bilgisi eksik/hatalı: ${problems.join("; ")}. Sipariş adresini düzeltip tekrar deneyin.`, {
      code: "DHL_INVALID_RECIPIENT",
      context: { problems },
    })
  }
  const mobile = phone.startsWith("5")
  return {
    cityCode: geo.cityCode,
    districtCode: geo.districtCode,
    cityName: recipient.cityName,
    districtName: recipient.districtName,
    address,
    fullName,
    email: (recipient.email || "").trim() || fallbackEmail,
    mobilePhoneNumber: mobile ? phone : "",
    homePhoneNumber: mobile ? "" : phone,
  }
}

function partyBody(p: DhlParty) {
  return {
    refCustomerId: "",
    cityCode: p.cityCode,
    cityName: p.cityName,
    districtCode: p.districtCode,
    districtName: p.districtName,
    address: p.address,
    bussinessPhoneNumber: "",
    email: p.email,
    taxOffice: "",
    taxNumber: "",
    fullName: p.fullName,
    homePhoneNumber: p.homePhoneNumber,
    mobilePhoneNumber: p.mobilePhoneNumber,
  }
}

export type DhlOrderInput = {
  referenceId: string
  party: DhlParty
  parcel: Parcel
  /** Etikette görünen içerik özeti. */
  content: string
  deliveryType: number
  paymentType: number
  /** SMS tercihleri: varışta alıcıya, hazırlanınca alıcıya, teslimde göndericiye. */
  sms: [0 | 1, 0 | 1, 0 | 1]
}

function pieceList(input: Pick<DhlOrderInput, "referenceId" | "parcel" | "content">) {
  const { desi, kg } = parcelToPiece(input.parcel)
  return [{ barcode: `${input.referenceId}_PARCA1`, desi, kg, content: clip(input.content, 100) }]
}

function orderBlock(input: DhlOrderInput) {
  return {
    referenceId: input.referenceId,
    barcode: input.referenceId,
    billOfLandingId: "",
    isCOD: 0,
    codAmount: 0,
    shipmentServiceType: DHL_ENUM.shipmentServiceType.standard,
    packagingType: DHL_ENUM.packagingType.package,
    content: clip(input.content, 100),
    smsPreference1: input.sms[0],
    smsPreference2: input.sms[1],
    smsPreference3: input.sms[2],
    paymentType: input.paymentType,
    deliveryType: input.deliveryType,
    description: clip(input.content, 100),
    marketPlaceShortCode: "",
    marketPlaceSaleCode: "",
    pudoId: "",
  }
}

export function buildCreateOrderBody(input: DhlOrderInput) {
  return { order: orderBlock(input), orderPieceList: pieceList(input), recipient: partyBody(input.party) }
}

/** İade: gönderici = müşteri; alıcı = sözleşmeli müşteri (biz). */
export function buildCreateReturnOrderBody(input: DhlOrderInput) {
  return { order: orderBlock(input), orderPieceList: pieceList(input), shipper: partyBody(input.party) }
}

export function buildCreateRecipientBody(party: DhlParty) {
  return { recipient: partyBody(party) }
}

export function buildCreateBarcodeBody(input: Pick<DhlOrderInput, "referenceId" | "parcel" | "content">) {
  return {
    referenceId: input.referenceId,
    billOfLandingId: "",
    isCOD: 0,
    codAmount: 0,
    // 0: hata olursa referans barkodlu (şubede geçersiz) etiket basma, hatayı dön.
    printReferenceBarcodeOnError: 0,
    message: "",
    additionalContent1: "",
    additionalContent2: "",
    additionalContent3: "",
    additionalContent4: "",
    orderPieceList: pieceList(input),
    packagingType: DHL_ENUM.packagingType.package,
  }
}

// ── Yanıtlar ────────────────────────────────────────────────────────────────

export type DhlBarcodeResult = {
  /** DHL gönderi no (takip). */
  shipmentId: string
  invoiceId: string
  /** Paket barkodu (okunur), varsa. */
  barcode: string
  /** Etiket (ZPL), çok parçalıysa satır satır. Boş → etiket Online Şube'den. */
  zpl: string
}

/**
 * Swagger: `barcodes[{ pieceNumber, value }]`; sahada `value` = ZPL (`^XA…^XZ`) ve
 * ayrıca `barcode` (okunur). Değer ZPL değilse barkod metni sayılır.
 */
export function parseBarcodeResponse(json: unknown): DhlBarcodeResult {
  const data = unwrapOne<Record<string, unknown>>(json)
  const pieces = (Array.isArray(data.barcodes) ? data.barcodes : []) as Record<string, unknown>[]
  const values = pieces.map((p) => String(p.value ?? ""))
  const zpl = values.filter((v) => v.includes("^XA")).join("\n")
  const barcode = String(pieces[0]?.barcode ?? (values[0] && !values[0].includes("^XA") ? values[0] : ""))
  return { shipmentId: String(data.shipmentId ?? ""), invoiceId: String(data.invoiceId ?? ""), barcode, zpl }
}

/** getshipment → gönderi no (barkod alınmış mı?). */
export function parseShipmentInfo(json: unknown): { shipmentId: string; statusCode: string } {
  const data = unwrapOne<Record<string, unknown>>(json)
  const s = (data.shipment && typeof data.shipment === "object" ? data.shipment : data) as Record<string, unknown>
  return { shipmentId: String(s.shipmentId ?? ""), statusCode: String(s.shipmentStatusCode ?? "") }
}

// ── Gönderi akışı ───────────────────────────────────────────────────────────

export type DhlLogger = { info: (m: string) => void; warn: (m: string) => void }

export type CreateDhlShipmentOptions = {
  /** createRecipient ile alıcıyı önceden kaydet (şube çözümlemesini hızlandırır). */
  preRegisterRecipient: boolean
  retryIntervalMs: number
  /** Bu süre içinde barkod alınamazsa "etiket bekliyor" döner (hata değil). */
  retryTimeoutMs: number
  logger?: DhlLogger
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export type DhlShipmentResult = Partial<DhlBarcodeResult> & {
  /** Barkod henüz alınamadı (20001) — yoklama tamamlar. */
  barcodePending: boolean
  /** Barkod alındı ama ZPL elde yok (yanıt kayboldu / zaten barkodlu). */
  labelMissing: boolean
  orderAlreadyExisted: boolean
  barcodeAttempts: number
  recipientPreRegistered: boolean
  lastError?: string
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type FlowClient = Pick<DhlClient, "createOrder" | "createBarcode" | "createRecipient" | "getOrder" | "getShipment">

async function orderExists(client: FlowClient, referenceId: string): Promise<boolean> {
  try {
    await client.getOrder(referenceId)
    return true
  } catch (error) {
    if (isNotFoundDhlError(error)) return false
    throw error
  }
}

/** Barkod alınmış mı? (yanıtı kaybolan/zaten barkodlu sipariş) */
async function existingShipment(client: FlowClient, referenceId: string): Promise<string | null> {
  try {
    const info = parseShipmentInfo(await client.getShipment(referenceId))
    return info.shipmentId || null
  } catch (error) {
    if (isNotFoundDhlError(error)) return null
    throw error
  }
}

const kindOf = (error: unknown) => (error instanceof CarrierError ? String(error.context.kind ?? "") : "")

/**
 * Tek deneme barkod: başarı → sonuç; 20001 → null (bekle); belirsiz/zaten barkodlu →
 * getshipment ile gönderi no (ZPL'siz); diğer hata → throw.
 */
export async function tryCreateBarcode(
  client: FlowClient,
  input: Pick<DhlOrderInput, "referenceId" | "parcel" | "content">
): Promise<{ result: DhlBarcodeResult; labelMissing: boolean } | { pending: true; error: CarrierError }> {
  try {
    const result = parseBarcodeResponse(await client.createBarcode(buildCreateBarcodeBody(input)))
    if (!result.shipmentId && !result.zpl) {
      throw new CarrierError("DHL createbarcode boş yanıt döndü (gönderi no ve etiket yok).", {
        code: "DHL_EMPTY_BARCODE",
        context: { path: "barcodecmdapi/createbarcode" },
      })
    }
    return { result, labelMissing: !result.zpl }
  } catch (error) {
    if (kindOf(error) === "branch_not_ready") return { pending: true, error: error as CarrierError }
    if (isTransientDhlError(error) || kindOf(error) === "already_invoiced") {
      const shipmentId = await existingShipment(client, input.referenceId)
      if (shipmentId) return { result: { shipmentId, invoiceId: "", barcode: "", zpl: "" }, labelMissing: true }
    }
    throw error
  }
}

export async function createDhlShipment(
  client: FlowClient,
  input: DhlOrderInput,
  options: CreateDhlShipmentOptions
): Promise<DhlShipmentResult> {
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const log = options.logger

  let recipientPreRegistered = false
  if (options.preRegisterRecipient) {
    try {
      await client.createRecipient(buildCreateRecipientBody(input.party))
      recipientPreRegistered = true
    } catch (error) {
      // İsteğe bağlı adım (Plus Command aboneliği gerekir) — gönderiyi durdurmaz.
      log?.warn(`[dhl] createRecipient atlandı (${input.referenceId}): ${String((error as Error)?.message ?? error)}`)
    }
  }

  let orderAlreadyExisted = false
  try {
    await client.createOrder(buildCreateOrderBody(input))
    log?.info(`[dhl] Sipariş oluşturuldu: ${input.referenceId}`)
  } catch (error) {
    if (kindOf(error) === "order_exists") {
      orderAlreadyExisted = true
      log?.info(`[dhl] Sipariş zaten var (3002): ${input.referenceId} → barkoda geçiliyor`)
    } else if (isTransientDhlError(error)) {
      // Belirsiz: POST ulaştı mı? Tekrar YOK — okuma ile bak.
      if (!(await orderExists(client, input.referenceId))) throw error
      orderAlreadyExisted = true
      log?.warn(`[dhl] createOrder yanıtı alınamadı ama sipariş DHL'de var: ${input.referenceId}`)
    } else {
      throw error
    }
  }

  const startedAt = now()
  let attempts = 0
  for (;;) {
    attempts++
    const r = await tryCreateBarcode(client, input)
    if (!("pending" in r)) {
      log?.info(`[dhl] Barkod alındı: ${input.referenceId} → ${r.result.shipmentId || "(gönderi no yok)"} (deneme ${attempts})`)
      return { ...r.result, barcodePending: false, labelMissing: r.labelMissing, orderAlreadyExisted, barcodeAttempts: attempts, recipientPreRegistered }
    }
    if (now() - startedAt + options.retryIntervalMs > options.retryTimeoutMs) {
      log?.warn(`[dhl] Varış şubesi ${attempts} denemede atanmadı (${input.referenceId}) — etiket yoklamada alınacak`)
      return {
        barcodePending: true,
        labelMissing: false,
        orderAlreadyExisted,
        barcodeAttempts: attempts,
        recipientPreRegistered,
        lastError: r.error.message,
      }
    }
    await sleep(options.retryIntervalMs)
  }
}

// ── Durum ───────────────────────────────────────────────────────────────────

/**
 * Swagger shipmentStatusCode: 1 Gönderi_Hazırlandı, 2 Transfer_Aşamasında,
 * 3 Teslimat_Birimine_Ulaştı, 4 Alıcı_Adresine_Yönlendirildi, 5 Teslim_Edildi,
 * 6 Teslim_Edilemedi, 7 Geri_Geliyor, 8 Destek_Gerekiyor.
 * "Hazırlandı" = kayıt var, kurye almadı → `none` (takip no "kargoya verildi" sayılmaz).
 */
const CODE_TO_ACTION: Record<string, FulfillmentAction> = {
  "1": "none",
  "2": "shipped",
  "3": "shipped",
  "4": "shipped",
  "5": "delivered",
  "6": "failed",
  "7": "returned",
  "8": "failed",
}

const CODE_TO_TEXT: Record<string, string> = {
  "1": "Gönderi hazırlandı",
  "2": "Transfer aşamasında",
  "3": "Teslimat birimine ulaştı",
  "4": "Alıcı adresine yönlendirildi",
  "5": "Teslim edildi",
  "6": "Teslim edilemedi",
  "7": "Geri geliyor",
  "8": "Destek gerekiyor",
}

const TEXT_TO_ACTION: [RegExp, FulfillmentAction][] = [
  [/teslim\s*edilemedi/i, "failed"],
  [/destek/i, "failed"],
  [/teslim\s*edildi/i, "delivered"],
  [/geri\s*geliyor|iade/i, "returned"],
  [/transfer|teslimat birimi|yonlendirildi|yönlendirildi|dagitim|dağıtım/i, "shipped"],
]

export type DhlStatus = CarrierStatus & {
  shipmentId: string
  trackingUrl: string
  deliveredTo: string
  deliveredAt: string
  /** İade edildiyse geri gönderi no. */
  returnShipmentId: string
}

function normalizeUrl(url: string): string {
  const u = url.trim()
  if (!u) return ""
  return /^https?:\/\//i.test(u) ? u : `https://${u.replace(/^\/+/, "")}`
}

export function parseShipmentStatus(json: unknown): DhlStatus {
  const data = unwrapOne<Record<string, unknown>>(json)
  const nested = data.shipmentStatus && typeof data.shipmentStatus === "object" ? (data.shipmentStatus as Record<string, unknown>) : null
  const code = String(data.shipmentStatusCode ?? nested?.code ?? data.statusCode ?? "").trim()
  const rawText = String(
    (typeof data.shipmentStatus === "string" ? data.shipmentStatus : "") || nested?.description || data.statusDescription || ""
  )
    .replace(/_/g, " ")
    .trim()
  const description = rawText || CODE_TO_TEXT[code] || ""
  const returnShipmentId = String(data.retrieveShipmentId ?? "").trim()

  let action: FulfillmentAction = CODE_TO_ACTION[code] ?? "none"
  if (!CODE_TO_ACTION[code] && description) action = TEXT_TO_ACTION.find(([re]) => re.test(description))?.[1] ?? "none"
  // Bayraklar kodu ezer: teslim bilgisi kesin; geri gönderi no iade demektir.
  if (Number(data.isDelivered) === 1 && action !== "returned") action = "delivered"
  if (returnShipmentId && action !== "delivered") action = "returned"

  return {
    code,
    description,
    action,
    shipmentId: String(data.shipmentId ?? ""),
    trackingUrl: normalizeUrl(String(data.trackingUrl ?? "")),
    deliveredTo: String(data.deliveryTo ?? "").trim(),
    deliveredAt: String(data.deliveryDateTime ?? "").trim(),
    returnShipmentId,
  }
}
