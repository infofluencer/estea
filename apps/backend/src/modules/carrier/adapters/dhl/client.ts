/**
 * DHL eCommerce Türkiye (Apizone, eski MNG Kargo) REST istemcisi.
 * Uçlar ve alanlar resmi swagger'dan (docs/dhl-apizone/*.json, docs/DHL-APIZONE.md).
 *
 * Kimlik: her istekte IBM API Connect başlıkları (`X-IBM-Client-Id` /
 * `X-IBM-Client-Secret`) + Identity API'den alınan JWT (`Authorization: Bearer`).
 * JWT ~8 saat → önbellek; 401'de bir kez yenilenir (abonelik hatasında değil).
 *
 * Yeniden deneme: yazma uçları ASLA körlemesine denenmez (CarrierAdapter kuralı);
 * belirsiz sonuçlu yazma (zaman aşımı/5xx) akış katmanında bir OKUMA ile çözülür.
 * Okuma uçları ağ hatası / 5xx / 429'da bir kez daha denenir.
 */
import { CarrierError } from "../../types"
import { classifyDhlError, readDhlErrorBody } from "./errors"

export type DhlTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

export type DhlClientOptions = {
  baseUrl: string
  clientId: string
  clientSecret: string
  customerNumber: string
  password: string
  timeoutMs?: number
  transport?: DhlTransport
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export function unwrapOne<T = Record<string, unknown>>(value: unknown): T {
  if (Array.isArray(value)) return (value[0] ?? {}) as T
  return (value ?? {}) as T
}

export function unwrapList<T = Record<string, unknown>>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  const data = (value as { data?: unknown } | null)?.data
  if (Array.isArray(data)) return data as T[]
  return value && typeof value === "object" ? [value as T] : []
}

const DEFAULT_TOKEN_TTL_MS = 7 * 60 * 60 * 1000
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000
const READ_RETRY_DELAY_MS = 1000

function jwtExpiryMs(jwt: string): number | null {
  const part = jwt.split(".")[1]
  if (!part) return null
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"))
    return typeof payload?.exp === "number" ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/** Identity yanıtındaki `jwtExpireDate`: "10.03.2020 16:05:00" (Türkiye saati). */
export function parseDhlDateTime(value: unknown): number | null {
  const m = String(value ?? "").trim().match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const [, dd, mm, yyyy, hh, mi, ss] = m
  const t = Date.parse(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss ?? "00"}+03:00`)
  return Number.isFinite(t) ? t : null
}

/** HTTP durumu (`context.status`). */
export function dhlStatus(error: unknown): number | null {
  if (!(error instanceof CarrierError)) return null
  const s = Number(error.context.status)
  return Number.isFinite(s) && s > 0 ? s : null
}

export class DhlClient {
  readonly baseUrl: string

  private readonly options: DhlClientOptions
  private readonly transport: DhlTransport
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private token: { jwt: string; expiresAt: number } | null = null
  private tokenPromise: Promise<string> | null = null

  constructor(options: DhlClientOptions) {
    this.options = options
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.transport = options.transport ?? (globalThis.fetch as unknown as DhlTransport)
  }

  private ibmHeaders(): Record<string, string> {
    return {
      "X-IBM-Client-Id": this.options.clientId,
      "X-IBM-Client-Secret": this.options.clientSecret,
      "Content-Type": "application/json",
      Accept: "application/json",
    }
  }

  private async send(method: string, path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
    const url = `${this.baseUrl}/mngapi/api/${path.replace(/^\//, "")}`
    const controller = new AbortController()
    const timeoutMs = this.options.timeoutMs ?? 30000
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Awaited<ReturnType<DhlTransport>>
    try {
      response = await this.transport(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      const timedOut = controller.signal.aborted || (error as { name?: string })?.name === "AbortError"
      const code = timedOut ? "DHL_TIMEOUT" : "DHL_NETWORK"
      const c = classifyDhlError({ code, status: null, path, text: String(error) })
      throw new CarrierError(
        `DHL ${method} ${path}: ${timedOut ? `${timeoutMs} ms içinde yanıt yok` : `bağlantı hatası (${String(error)})`} — ${c.hint}`,
        { code, context: { method, path, kind: c.kind }, cause: error }
      )
    } finally {
      clearTimeout(timer)
    }

    const text = await response.text()
    let json: unknown = undefined
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = text
      }
    }

    if (!response.ok) {
      const parsed = readDhlErrorBody(json)
      const c = classifyDhlError({ code: parsed.code ?? null, status: response.status, path, text: parsed.message })
      throw new CarrierError(
        `DHL ${method} ${path} → HTTP ${response.status}` +
          (parsed.code ? ` [${parsed.code}]` : "") +
          (parsed.message ? `: ${parsed.message}` : "") +
          (c.hint ? ` — ${c.hint}` : ""),
        {
          code: parsed.code || `DHL_HTTP_${response.status}`,
          context: { method, path, status: response.status, kind: c.kind, errorType: parsed.errorType ?? null, body: json },
        }
      )
    }
    return json
  }

  /** Identity API → JWT. Eşzamanlı çağrılar tek isteği paylaşır. */
  async getToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) {
      return this.token.jwt
    }
    if (this.tokenPromise) return this.tokenPromise

    this.tokenPromise = (async () => {
      const json = await this.send(
        "POST",
        "token",
        { customerNumber: this.options.customerNumber, password: this.options.password, identityType: 1 },
        this.ibmHeaders()
      )
      const data = unwrapOne<Record<string, unknown>>(json)
      const jwt = String(data.jwt ?? data.token ?? data.accessToken ?? "")
      if (!jwt) throw new CarrierError("DHL Identity API boş JWT döndü.", { code: "DHL_TOKEN", context: { path: "token", body: json } })
      const expiresAt = jwtExpiryMs(jwt) ?? parseDhlDateTime(data.jwtExpireDate) ?? this.now() + DEFAULT_TOKEN_TTL_MS
      this.token = { jwt, expiresAt }
      return jwt
    })()

    try {
      return await this.tokenPromise
    } finally {
      this.tokenPromise = null
    }
  }

  private async authed(method: string, path: string, body?: unknown): Promise<unknown> {
    const call = async (jwt: string) => this.send(method, path, body, { ...this.ibmHeaders(), Authorization: `Bearer ${jwt}` })
    try {
      return await call(await this.getToken())
    } catch (error) {
      // Süresi dolmuş/iptal JWT → bir kez yenile. Abonelik/IP hatasında yenilemek işe yaramaz.
      if (dhlStatus(error) === 401 && (error as CarrierError).context.kind === "auth") {
        return call(await this.getToken(true))
      }
      throw error
    }
  }

  /** Okuma: ağ hatası / zaman aşımı / 5xx / 429'da bir kez daha. */
  private async read(path: string): Promise<unknown> {
    try {
      return await this.authed("GET", path)
    } catch (error) {
      if (!isTransientDhlError(error)) throw error
      await this.sleep(READ_RETRY_DELAY_MS)
      return this.authed("GET", path)
    }
  }

  // ── Standard Command ──
  createOrder(body: unknown): Promise<unknown> {
    return this.authed("POST", "standardcmdapi/createOrder", body)
  }
  createReturnOrder(body: unknown): Promise<unknown> {
    return this.authed("POST", "standardcmdapi/createReturnOrder", body)
  }
  cancelOrder(referenceId: string): Promise<unknown> {
    return this.authed("PUT", `standardcmdapi/cancelorder/${encodeURIComponent(referenceId)}`)
  }

  // ── Plus Command ──
  createRecipient(body: unknown): Promise<unknown> {
    return this.authed("POST", "pluscmdapi/createRecipient", body)
  }
  /** Kabul edilmiş gönderinin teslimatını iptal (geri dönüş) — açıklama zorunlu. */
  cancelOrderDelivery(referenceId: string, description: string): Promise<unknown> {
    return this.authed("POST", "pluscmdapi/cancelOrderDelivery", { referenceId, description })
  }

  // ── Barcode Command ──
  createBarcode(body: unknown): Promise<unknown> {
    return this.authed("POST", "barcodecmdapi/createbarcode", body)
  }
  cancelShipment(referenceId: string, shipmentId: string): Promise<unknown> {
    return this.authed("PUT", "barcodecmdapi/cancelshipment", { referenceId, shipmentId })
  }

  // ── Standard Query ──
  getOrder(referenceId: string): Promise<unknown> {
    return this.read(`standardqueryapi/getorder/${encodeURIComponent(referenceId)}`)
  }
  /** Sipariş faturalaşmışsa (barkod alınmışsa) gönderi bilgisi. */
  getShipment(referenceId: string): Promise<unknown> {
    return this.read(`standardqueryapi/getshipment/${encodeURIComponent(referenceId)}`)
  }
  getShipmentStatus(referenceId: string): Promise<unknown> {
    return this.read(`standardqueryapi/getshipmentstatus/${encodeURIComponent(referenceId)}`)
  }
  /** Gönderi no ile — şubede açılmış / dışarıdan bağlanmış kayıtlar. */
  getShipmentStatusByShipmentId(shipmentId: string): Promise<unknown> {
    return this.read(`standardqueryapi/getshipmentstatusByShipmentId/${encodeURIComponent(shipmentId)}`)
  }
  trackShipment(referenceId: string): Promise<unknown> {
    return this.read(`standardqueryapi/trackshipment/${encodeURIComponent(referenceId)}`)
  }

  // ── CBS Info ──
  getCities(): Promise<unknown> {
    return this.read("cbsinfoapi/getcities")
  }
  getDistricts(cityCode: string | number): Promise<unknown> {
    return this.read(`cbsinfoapi/getdistricts/${encodeURIComponent(String(cityCode))}`)
  }
  getOutOfServiceAreas(cityCode: string | number, districtCode: string | number): Promise<unknown> {
    return this.read(`cbsinfoapi/getoutofserviceareas/${encodeURIComponent(String(cityCode))}/${encodeURIComponent(String(districtCode))}`)
  }
  getMobileAreas(cityCode: string | number, districtCode: string | number): Promise<unknown> {
    return this.read(`cbsinfoapi/getmobileareas/${encodeURIComponent(String(cityCode))}/${encodeURIComponent(String(districtCode))}`)
  }

  // ── Utility ──
  getApiStatuses(): Promise<unknown> {
    return this.read("utilityapi/getapistatuses")
  }
  getApiErrorCodes(): Promise<unknown> {
    return this.read("utilityapi/getapierrorcodes")
  }
}

/** Ağ / zaman aşımı / 5xx / 429 — okuma tekrarı ve belirsiz yazma kontrolü için. */
export function isTransientDhlError(error: unknown): boolean {
  if (!(error instanceof CarrierError)) return false
  if (error.code === "DHL_NETWORK" || error.code === "DHL_TIMEOUT") return true
  const s = dhlStatus(error)
  return s === 429 || (s !== null && s >= 500 && error.context.kind === "transient")
}

export function isNotFoundDhlError(error: unknown): boolean {
  return error instanceof CarrierError && error.context.kind === "not_found"
}
