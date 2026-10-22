/**
 * Paraşüt (Parasut) e-fatura / e-arşiv seçenekleri.
 *
 * Kimlik bilgisi yoksa / yer tutucuysa → mock mod (gerçek HTTP yok).
 * Kimlik gelince aynı kod yolu canlı client'a geçer.
 */

export type ParasutEnv = "test" | "prod"

export type ParasutRawOptions = {
  clientId?: string
  clientSecret?: string
  username?: string
  password?: string
  companyId?: string
  baseUrl?: string
  oauthUrl?: string
  env?: string
  defaultVatRate?: string | number
  /** Kargo kalemi KDV % — canlı fatura kanıtı: 20 (ürün 10) */
  shippingVatRate?: string | number
  timeoutMs?: string | number
  maxRetries?: string | number
  /** true → taslak sales invoice; finalize / e-belge YOK */
  dryRun?: boolean | string
  /** Parasut'ta bulunamayan ürün/hizmet oluşturulsun mu. Boş → DRY-RUN'da kapalı, canlıda açık. */
  productCreate?: boolean | string
  /** Kargo kalemi için sabit Parasut ürün id (varsa arama yapılmaz) */
  shippingProductId?: string
  /** Kargo ürün/hizmet kodu — id yoksa bu code ile aranır */
  shippingProductCode?: string
}

export type ParasutOptions = {
  clientId: string
  clientSecret: string
  username: string
  password: string
  companyId: string
  baseUrl: string
  oauthUrl: string
  env: ParasutEnv
  defaultVatRate: number
  shippingVatRate: number
  timeoutMs: number
  maxRetries: number
  dryRun: boolean
  productCreate: boolean
  shippingProductId: string
  shippingProductCode: string
}

/** Parasut `currency` enum: TRL | USD | EUR | GBP (TRY kabul edilmez). */
export function toParasutCurrency(code?: string | null): string {
  const c = text(code).toUpperCase()
  if (!c || c === "TRY" || c === "TL" || c === "TRL") return "TRL"
  return c
}

export const PARASUT_DEFAULT_BASE_URL = "https://api.parasut.com/v4"
export const PARASUT_DEFAULT_OAUTH_URL = "https://api.parasut.com"

const PLACEHOLDER = new Set([
  "",
  "changeme",
  "change-me",
  "placeholder",
  "todo",
  "your-parasut-client-id",
  "your-parasut-client-secret",
  "your-parasut-username",
  "your-parasut-password",
  "your-parasut-company-id",
])

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim()
}

export function isPlaceholderCredential(value?: string | null): boolean {
  return PLACEHOLDER.has((value ?? "").trim().toLowerCase())
}

/**
 * PARASUT_DRY_RUN — taslak fatura, resmileştirme YOK.
 * Env VEYA options.dryRun. Default false (prod davranışı değişmez).
 */
export function parseDryRunFlag(value?: unknown): boolean {
  const s = text(value).toLowerCase()
  return s === "1" || s === "true" || s === "yes" || s === "on"
}

export function isParasutDryRun(options?: { dryRun?: boolean }): boolean {
  if (options?.dryRun === true) return true
  return parseDryRunFlag(process.env.PARASUT_DRY_RUN)
}

/** Test script: DRY-RUN kapalıysa çalışmayı REDDET (canlı fatura kesilmesin). */
export function assertParasutDryRunEnabled(): void {
  if (!isParasutDryRun()) {
    throw new Error(
      "REDDEDİLDİ: PARASUT_DRY_RUN=true zorunlu. Bu script taslak dışında fatura kesmez; env false/boş iken çalışmaz."
    )
  }
}

/** Retry job: yalnızca error/pending. draft_dryrun / issued / skipped dokunulmaz. */
export function shouldRetryParasutInvoice(status?: string | null): boolean {
  return status === "error" || status === "pending"
}

/**
 * Tüm OAuth kimlik alanları dolu ve yer tutucu değilse canlı mod.
 * Aksi halde mock — boot çökmez, gerçek HTTP atılmaz.
 */
export function isMockMode(
  options: Pick<
    ParasutOptions,
    "clientId" | "clientSecret" | "username" | "password" | "companyId"
  >
): boolean {
  return (
    isPlaceholderCredential(options.clientId) ||
    isPlaceholderCredential(options.clientSecret) ||
    isPlaceholderCredential(options.username) ||
    isPlaceholderCredential(options.password) ||
    isPlaceholderCredential(options.companyId)
  )
}

export function normalizeOptions(raw: ParasutRawOptions = {}): ParasutOptions {
  const envRaw = text(raw.env).toLowerCase()
  const env: ParasutEnv =
    envRaw === "prod" || envRaw === "production" ? "prod" : "test"

  const timeout = Number(raw.timeoutMs)
  const retries = Number(raw.maxRetries)
  const vat = Number(raw.defaultVatRate)
  const shipVat = Number(raw.shippingVatRate)
  const dryRun =
    parseDryRunFlag(raw.dryRun) || parseDryRunFlag(process.env.PARASUT_DRY_RUN)
  const productCreateRaw = text(raw.productCreate)

  return {
    clientId: text(raw.clientId),
    clientSecret: text(raw.clientSecret),
    username: text(raw.username),
    password: text(raw.password),
    companyId: text(raw.companyId),
    baseUrl: text(raw.baseUrl) || PARASUT_DEFAULT_BASE_URL,
    oauthUrl: text(raw.oauthUrl) || PARASUT_DEFAULT_OAUTH_URL,
    env,
    defaultVatRate: Number.isFinite(vat) && vat >= 0 ? vat : 10,
    // Canlı Parasut fatura: kargo KDV %20 (ürün %10)
    shippingVatRate: Number.isFinite(shipVat) && shipVat >= 0 ? shipVat : 20,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
    maxRetries: Number.isFinite(retries) && retries >= 0 ? retries : 2,
    dryRun,
    productCreate: productCreateRaw
      ? parseDryRunFlag(productCreateRaw)
      : !dryRun,
    shippingProductId: text(raw.shippingProductId),
    shippingProductCode: text(raw.shippingProductCode) || "KARGO",
  }
}
