/**
 * BizimHesap seçenekleri. Tek kimlik `firmId` (hesaba özel, BizimHesap verir).
 *
 * firmId yoksa / yer tutucuysa → mock mod (gerçek HTTP yok).
 * BizimHesap'ın test ortamı yok: her gerçek istek hesaba kayıt yazar. Bu yüzden
 * canlı dışı işareti (PAYTR_OID_PREFIX) dry-run'ı zorlar.
 */

export type BizimhesapRawOptions = {
  firmId?: string
  baseUrl?: string
  defaultVatRate?: string | number
  shippingVatRate?: string | number
  timeoutMs?: string | number
  dryRun?: boolean | string
}

export type BizimhesapOptions = {
  firmId: string
  baseUrl: string
  defaultVatRate: number
  shippingVatRate: number
  timeoutMs: number
  dryRun: boolean
}

export const BIZIMHESAP_DEFAULT_BASE_URL = "https://bizimhesap.com/api/b2b"

const PLACEHOLDER = new Set([
  "",
  "changeme",
  "change-me",
  "placeholder",
  "todo",
  "your-bizimhesap-firm-id",
  // Dokümandaki örnek firmId
  "485e152158494be590b5f72403398765",
])

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim()
}

export function isPlaceholderFirmId(value?: string | null): boolean {
  return PLACEHOLDER.has((value ?? "").trim().toLowerCase())
}

export function parseFlag(value?: unknown): boolean {
  const s = text(value).toLowerCase()
  return s === "1" || s === "true" || s === "yes" || s === "on"
}

/** Canlı dışı ortam işareti: PAYTR_OID_PREFIX dolu (ör. staging "STG"). */
export function isNonProdDeployment(): boolean {
  return Boolean((process.env.PAYTR_OID_PREFIX || "").trim())
}

export function isBizimhesapDryRun(options?: { dryRun?: boolean }): boolean {
  if (options?.dryRun === true) return true
  if (isNonProdDeployment()) return true
  return parseFlag(process.env.BIZIMHESAP_DRY_RUN)
}

/**
 * Retry job yalnızca `error` durumunu dener: BizimHesap isteği açıkça reddetti,
 * kayıt oluşmadı. `pending` / `unknown` kayıt oluşmuş olabilir; API'de sorgu, silme
 * ve idempotency olmadığından otomatik tekrar çift fatura yazar.
 */
export function shouldRetryBizimhesapInvoice(status?: string | null): boolean {
  return status === "error"
}

export function isMockMode(options: Pick<BizimhesapOptions, "firmId">): boolean {
  return isPlaceholderFirmId(options.firmId)
}

export function normalizeOptions(raw: BizimhesapRawOptions = {}): BizimhesapOptions {
  const timeout = Number(raw.timeoutMs)
  const vat = Number(raw.defaultVatRate || process.env.KDV_RATE)
  const shipVat = Number(raw.shippingVatRate)

  return {
    firmId: text(raw.firmId),
    baseUrl: (text(raw.baseUrl) || BIZIMHESAP_DEFAULT_BASE_URL).replace(/\/$/, ""),
    // Yalnız tax_lines boş satırda kullanılır. Çay: K2 (mali müşavir teyidi bekliyor).
    defaultVatRate: Number.isFinite(vat) && vat > 0 ? vat : 1,
    shippingVatRate: Number.isFinite(shipVat) && shipVat >= 0 && text(raw.shippingVatRate) ? shipVat : 20,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
    dryRun:
      parseFlag(raw.dryRun) ||
      parseFlag(process.env.BIZIMHESAP_DRY_RUN) ||
      isNonProdDeployment(),
  }
}
