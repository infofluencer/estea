import Medusa from "@medusajs/js-sdk"

/** Dynamic key lookup — Next.js must not inline these at build time (Docker runtime env). */
function env(key: string): string | undefined {
  return process.env[key]
}

export function backendUrl(): string {
  return (
    env("MEDUSA_BACKEND_URL") ||
    env("NEXT_PUBLIC_MEDUSA_BACKEND_URL") ||
    "http://localhost:9000"
  )
}

function createSdk(): Medusa {
  return new Medusa({
    baseUrl: backendUrl(),
    debug: process.env.NODE_ENV === "development",
    publishableKey: env("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY"),
  })
}

let sdkInstance: Medusa | undefined

/** Lazy singleton — env is read on first request, not at `next build` time. */
export const sdk: Medusa = new Proxy({} as Medusa, {
  get(_target, prop, receiver) {
    if (!sdkInstance) sdkInstance = createSdk()
    const value = Reflect.get(sdkInstance, prop, receiver)
    return typeof value === "function" ? value.bind(sdkInstance) : value
  },
})

export function regionId(): string {
  return env("NEXT_PUBLIC_MEDUSA_REGION_ID") || ""
}

/**
 * Pricing context for store **product** list/retrieve (calculated_price).
 * Includes country_code — valid on /store/products, NOT on cart create.
 */
export function storePricingParams(): {
  region_id?: string
  country_code: "tr"
} {
  const rid = regionId()
  return {
    ...(rid ? { region_id: rid } : {}),
    country_code: "tr",
  }
}

/**
 * Body for POST /store/carts — CreateCart is .strict() and rejects country_code.
 * Region alone is enough for TRY pricing on the cart.
 */
export function storeCartCreateParams(): { region_id?: string } {
  const rid = regionId()
  return rid ? { region_id: rid } : {}
}

type CalculatedPriceLike = {
  calculated_amount?: number | string | null
  calculated_amount_with_tax?: number | string | null
  original_amount?: number | string | null
} | null | undefined

function coercePriceAmount(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === "number" ? value : Number(String(value))
  return Number.isFinite(n) ? n : null
}

/** Major-unit TRY amount from Medusa variant calculated_price (null if unavailable). */
export function variantPriceAmount(price: CalculatedPriceLike): number | null {
  if (!price) return null
  return (
    coercePriceAmount(price.calculated_amount) ??
    coercePriceAmount(price.calculated_amount_with_tax)
  )
}

export function variantOriginalAmount(price: CalculatedPriceLike): number | null {
  if (!price) return null
  return coercePriceAmount(price.original_amount)
}

/** Public S3 base for catalog images (no trailing slash). */
export function s3BaseUrl(): string {
  return (
    env("NEXT_PUBLIC_S3_FILE_URL") ||
    // Yerel geliştirme: Medusa file-local (static/) — prod'da NEXT_PUBLIC_S3_FILE_URL şart.
    `${env("NEXT_PUBLIC_MEDUSA_BACKEND_URL") || env("MEDUSA_BACKEND_URL") || "http://localhost:9000"}/static`
  ).replace(/\/$/, "")
}

/** @deprecated Prefer s3BaseUrl() */
export const S3_FILE_URL = s3BaseUrl()

export function s3FileUrl(filename: string) {
  return `${s3BaseUrl()}/files/${filename}`
}

/**
 * Storefront static media migrated from `public/media/*` → S3 `files/site/*`.
 * Accepts `/media/foo.jpg`, `media/foo.jpg`, or `foo.jpg`.
 */
export function siteMediaUrl(path: string) {
  const cleaned = path
    .trim()
    .replace(/^\//, "")
    .replace(/^media\//, "")
    .replace(/[?].*$/, "")
  return s3FileUrl(`site/${cleaned}`)
}

/** Temporary stand-in until real product media is uploaded in Medusa. */
export const PRODUCT_IMAGE = siteMediaUrl("products/default.png")

export function formatTry(amount: number | string | undefined | null) {
  if (amount == null || amount === "") return ""
  const value = typeof amount === "string" ? Number(amount) : amount
  if (!Number.isFinite(value)) return ""
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}
