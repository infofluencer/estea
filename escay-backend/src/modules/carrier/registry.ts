/**
 * Adaptör kaydı — SHIPPING_CARRIER env'i ile seçilen taşıyıcı.
 *
 * Yeni firma eklemek: `adapters/<firma>.ts` içinde CarrierAdapter uygula,
 * `adapters/index.ts`'te `registerCarrierAdapter(...)` çağır (README.md).
 */
import { EXCHANGE_ORDER_NO_SUFFIX, type CarrierAdapter } from "./types"

const adapters = new Map<string, CarrierAdapter>()

export function registerCarrierAdapter(adapter: CarrierAdapter): void {
  adapters.set(adapter.code.toLowerCase(), adapter)
}

/** Yalnızca testler için. */
export function resetCarrierAdapters(): void {
  adapters.clear()
}

export function listCarrierAdapters(): CarrierAdapter[] {
  return [...adapters.values()]
}

/** `SHIPPING_CARRIER` → kod; boş / "manual" / "none" → null (elle kargo). */
export function configuredCarrierCode(): string | null {
  const raw = (process.env.SHIPPING_CARRIER || "").trim().toLowerCase()
  if (!raw || raw === "manual" || raw === "none" || raw === "0" || raw === "false") return null
  return raw
}

export function getConfiguredCarrier(): CarrierAdapter | null {
  const code = configuredCarrierCode()
  return code ? adapters.get(code) ?? null : null
}

/** Kod verildi ama adaptörü yok → yapılandırma hatası (boot'ta uyar). */
export function isCarrierConfigured(): boolean {
  return getConfiguredCarrier() !== null
}

/** Mevcut fulfillment kaydını açan adaptör (data.carrier → owns()). */
export function getCarrierFor(
  data: Record<string, unknown> | null | undefined
): CarrierAdapter | null {
  const code = String((data || {}).carrier ?? "").trim().toLowerCase()
  if (code && adapters.has(code)) return adapters.get(code)!
  for (const a of adapters.values()) {
    if (a.owns(data)) return a
  }
  return null
}

/** `SHIPPING_CARRIER_TEST_MODE` — varsayılan true (gerçek kargo açılmasın). */
export function carrierTestMode(): boolean {
  const raw = (process.env.SHIPPING_CARRIER_TEST_MODE ?? "true").trim().toLowerCase()
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no")
}

/** Firmaya giden sipariş referansı öneki (ESC-). */
export function orderReferencePrefix(): string {
  return (process.env.ORDER_REF_PREFIX ?? "ESC-").trim()
}

export function buildOrderReference(
  displayId: number | string | null | undefined,
  opts: { exchange?: boolean } = {}
): string {
  const base = displayId === null || displayId === undefined || displayId === "" ? "UNKNOWN" : String(displayId)
  return `${orderReferencePrefix()}${base}${opts.exchange ? EXCHANGE_ORDER_NO_SUFFIX : ""}`
}

/**
 * Ödeme sonrası otomatik fulfillment açılsın mı?
 * Varsayılan: adaptör varsa true (gönderi/etiket otomatik), elle kargoda false
 * (kargo kaydı "Hazırlandı"/"Kargoya ver" ile admin'den açılır).
 */
export function autoFulfillOnPayment(): boolean {
  const raw = (process.env.SHIPPING_AUTO_FULFILL ?? "").trim().toLowerCase()
  if (raw === "1" || raw === "true" || raw === "on") return true
  if (raw === "0" || raw === "false" || raw === "off") return false
  return isCarrierConfigured()
}
