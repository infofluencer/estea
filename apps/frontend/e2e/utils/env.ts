/**
 * Staging-only env for Playwright. Prod URL'lere asla gitmez.
 */

/** TODO(K8): nihai domain; lib/site.ts SITE_HOST ile aynı tutun. */
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_HOST || "market.esteacay.com").replace(/^www\./, "")
const PROD_HOSTS = new Set([SITE_HOST, `www.${SITE_HOST}`, `api.${SITE_HOST.replace(/^market\./, "")}`, `api.${SITE_HOST}`])

export function stagingFrontendUrl(): string {
  const raw =
    process.env.STAGING_FRONTEND_URL?.trim() ||
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
    ""
  if (!raw) {
    throw new Error(
      "STAGING_FRONTEND_URL gerekli (örn. http://STAGING_IP:3016). Prod (:3025 / canlı domain) yasak."
    )
  }
  return assertStagingFrontendUrl(raw)
}

export function assertStagingFrontendUrl(raw?: string): string {
  const url = (raw || process.env.STAGING_FRONTEND_URL || "").replace(/\/$/, "")
  if (!url) throw new Error("STAGING_FRONTEND_URL gerekli")
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`STAGING_FRONTEND_URL geçersiz: ${url}`)
  }
  const host = parsed.hostname.toLowerCase()
  if (PROD_HOSTS.has(host)) {
    throw new Error(`REFUSE: prod host ${host}`)
  }
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80")
  if (port === "3025") {
    throw new Error(
      "REFUSE: port 3025 = prod storefront. Staging için 3016 kullanın."
    )
  }
  return url.replace(/\/$/, "")
}

export function stagingBackendUrl(): string | null {
  const raw = process.env.STAGING_BACKEND_URL?.trim()
  if (!raw) return null
  const parsed = new URL(raw)
  if (PROD_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("REFUSE: STAGING_BACKEND_URL prod host")
  }
  if ((parsed.port || "") === "3025") {
    throw new Error("REFUSE: STAGING_BACKEND_URL port 3025")
  }
  return raw.replace(/\/$/, "")
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@escay.test`
}

/** Seed welcome coupon; override with STAGING_PROMO_CODE if staging uses another. */
export function stagingPromoCode(): string {
  return process.env.STAGING_PROMO_CODE?.trim() || "hosgeldin10"
}
