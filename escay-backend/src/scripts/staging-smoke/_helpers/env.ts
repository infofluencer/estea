/**
 * Staging-only env guards. PROD URL'lerine asla istek atılmaz.
 */

const PROD_HOSTS = new Set([
  "market.esteacay.com",
  "www.market.esteacay.com",
  "api.esteacay.com",
])

/** Prod storefront port (user convention: prod 3015, staging 3016). */
const PROD_STOREFRONT_PORT = "3015"

export type StagingEnv = {
  backendUrl: string
  frontendUrl: string | null
  publishableKey: string
  regionId: string
  expectedProductCount: number
  adminEmail: string | null
  adminPassword: string | null
  verifiedEmail: string | null
  verifiedPassword: string | null
  redisUrl: string | null
  productHandle: string | null
}

function stripSlash(url: string) {
  return url.replace(/\/$/, "")
}

export function assertNotProdUrl(raw: string, label: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`${label} geçerli bir URL değil: ${raw}`)
  }

  const host = parsed.hostname.toLowerCase()
  if (PROD_HOSTS.has(host)) {
    throw new Error(
      `REFUSE: ${label} prod host (${host}). Staging URL kullanın (STAGING_*).`
    )
  }

  const port =
    parsed.port || (parsed.protocol === "https:" ? "443" : "80")

  // Frontend veya yanlışlıkla storefront URL'si verilmişse prod portunu engelle
  if (port === PROD_STOREFRONT_PORT) {
    throw new Error(
      `REFUSE: ${label} port ${PROD_STOREFRONT_PORT} (prod storefront). Staging için 3016 kullanın.`
    )
  }

  return parsed
}

export function loadStagingEnv(): StagingEnv {
  const backendRaw =
    process.env.STAGING_BACKEND_URL?.trim() ||
    process.env.MEDUSA_BACKEND_URL?.trim() ||
    ""

  if (!backendRaw) {
    throw new Error(
      "STAGING_BACKEND_URL gerekli (örn. http://STAGING_IP:9000). Prod URL kullanmayın."
    )
  }

  assertNotProdUrl(backendRaw, "STAGING_BACKEND_URL")

  const frontendRaw =
    process.env.STAGING_FRONTEND_URL?.trim() ||
    process.env.STOREFRONT_URL?.trim() ||
    null

  if (frontendRaw) {
    assertNotProdUrl(frontendRaw, "STAGING_FRONTEND_URL")
  }

  const publishableKey =
    process.env.STAGING_PUBLISHABLE_KEY?.trim() ||
    process.env.MEDUSA_PUBLISHABLE_KEY?.trim() ||
    process.env.TEST_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim() ||
    ""

  if (!publishableKey) {
    throw new Error(
      "STAGING_PUBLISHABLE_KEY (veya MEDUSA_PUBLISHABLE_KEY) gerekli."
    )
  }

  const expectedProductCount = Number(
    process.env.STAGING_EXPECTED_PRODUCT_COUNT || "45"
  )

  return {
    backendUrl: stripSlash(backendRaw),
    frontendUrl: frontendRaw ? stripSlash(frontendRaw) : null,
    publishableKey,
    regionId:
      process.env.STAGING_REGION_ID?.trim() ||
      process.env.NEXT_PUBLIC_MEDUSA_REGION_ID?.trim() ||
      "",
    expectedProductCount: Number.isFinite(expectedProductCount)
      ? expectedProductCount
      : 45,
    adminEmail:
      process.env.STAGING_ADMIN_EMAIL?.trim() ||
      process.env.TEST_ADMIN_EMAIL?.trim() ||
      null,
    adminPassword:
      process.env.STAGING_ADMIN_PASSWORD?.trim() ||
      process.env.TEST_ADMIN_PASSWORD?.trim() ||
      null,
    verifiedEmail: process.env.STAGING_VERIFIED_EMAIL?.trim() || null,
    verifiedPassword: process.env.STAGING_VERIFIED_PASSWORD?.trim() || null,
    redisUrl: process.env.STAGING_REDIS_URL?.trim() || null,
    productHandle: process.env.STAGING_PRODUCT_HANDLE?.trim() || null,
  }
}

export function uniqueEmail(prefix = "staging-smoke"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@escay.test`
}
