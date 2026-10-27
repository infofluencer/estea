/**
 * Omnisend REST API v5 — contacts + recommended events.
 *
 * - OMNISEND_API_KEY boşsa tamamen kapalı (no-op).
 * - Canlı dışı ortam (PAYTR_OID_PREFIX dolu, ör. staging "STG"): yalnızca
 *   OMNISEND_TEST_EMAILS listesindeki adreslere gönderilir; liste boşsa hiçbiri.
 *   Omnisend'in sandbox'ı yok — e2e adresleri gerçek hesaba düşmemeli.
 * - Hatalar yutulur (log); checkout / ödeme akışını asla kırmaz.
 *
 * Docs: https://api-docs.omnisend.com/v5/docs/started-checkout
 *       https://api-docs.omnisend.com/v5/docs/placed-order
 */

import { createHash, randomUUID } from "crypto"

const BASE_URL = "https://api.omnisend.com/v5"

type Logger = {
  info: (m: string) => void
  warn: (m: string) => void
}

export type OmnisendLineItem = {
  productID: string
  productTitle: string
  productPrice: number
  productQuantity: number
  productVariantID?: string
  productVariantTitle?: string
  productSKU?: string
  productImageURL?: string
  productURL?: string
  productDiscount?: number
}

function apiKey(): string {
  return (process.env.OMNISEND_API_KEY || "").trim()
}

function isNonProdEnvironment(): boolean {
  return Boolean((process.env.PAYTR_OID_PREFIX || "").trim())
}

function testEmailAllowlist(): Set<string> {
  return new Set(
    (process.env.OMNISEND_TEST_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  )
}

/** Gönderim yapılır mı? Neden yapılmadığını döner (log için). */
export function omnisendSkipReason(email?: string | null): string | null {
  if (!apiKey()) return "OMNISEND_API_KEY unset"
  const normalized = (email || "").trim().toLowerCase()
  if (!normalized) return "no email"
  if (isNonProdEnvironment() && !testEmailAllowlist().has(normalized)) {
    return "non-prod environment and email not in OMNISEND_TEST_EMAILS"
  }
  return null
}

async function post(
  path: string,
  body: unknown,
  logger: Logger
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      logger.warn(
        `[omnisend] POST ${path} → ${res.status}: ${text.slice(0, 500)}`
      )
      return false
    }
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`[omnisend] POST ${path} failed: ${message}`)
    return false
  }
}

export function storefrontBaseUrl(): string {
  return (process.env.STOREFRONT_URL || "http://localhost:3025").replace(
    /\/$/,
    ""
  )
}

export function productUrl(handle?: string | null): string | undefined {
  return handle ? `${storefrontBaseUrl()}/products/${handle}` : undefined
}

/** Sepeti geri yükleyen link (storefront: app/sepet/recover/[cartId]/route.ts). */
export function abandonedCheckoutUrl(cartId: string): string {
  return `${storefrontBaseUrl()}/sepet/recover/${encodeURIComponent(cartId)}`
}

export async function upsertOmnisendContact(
  logger: Logger,
  input: {
    email: string
    subscribed: boolean
    firstName?: string | null
    lastName?: string | null
    city?: string | null
    countryCode?: string | null
    consentSource: string
  }
): Promise<boolean> {
  const skip = omnisendSkipReason(input.email)
  if (skip) {
    logger.info(`[omnisend] contact skip (${input.email}): ${skip}`)
    return false
  }
  // İzin yoksa kişi kaydı GÖNDERİLMEZ: Omnisend /contacts e-posta kanalı
  // olmadan 400 döner ("Provide email channel for email identifier"), kanalı
  // "nonSubscribed" göndermek de mevcut bir aboneyi düşürür. Kişi zaten
  // event'lerle (contact.email) Omnisend'e geçer.
  if (!input.subscribed) {
    return false
  }
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  const identifier: Record<string, unknown> = {
    type: "email",
    id: input.email.trim().toLowerCase(),
    channels: { email: { status: "subscribed", statusDate: now } },
    consent: { source: input.consentSource, createdAt: now },
  }
  return post(
    "/contacts",
    {
      identifiers: [identifier],
      firstName: input.firstName || undefined,
      lastName: input.lastName || undefined,
      city: input.city || undefined,
      countryCode: input.countryCode?.toUpperCase() || undefined,
    },
    logger
  )
}

export async function sendOmnisendEvent(
  logger: Logger,
  input: {
    eventName: "started checkout" | "placed order"
    email: string
    properties: Record<string, unknown>
    eventID?: string
  }
): Promise<boolean> {
  const skip = omnisendSkipReason(input.email)
  if (skip) {
    logger.info(`[omnisend] event "${input.eventName}" skip: ${skip}`)
    return false
  }
  const ok = await post(
    "/events",
    {
      eventName: input.eventName,
      eventID: input.eventID || randomUUID(),
      // started checkout: eventVersion boş; placed order: "v2"
      eventVersion: input.eventName === "placed order" ? "v2" : "",
      origin: "api",
      eventTime: new Date().toISOString(),
      contact: { email: input.email.trim().toLowerCase() },
      properties: input.properties,
    },
    logger
  )
  if (ok) {
    logger.info(`[omnisend] event "${input.eventName}" sent`)
  }
  return ok
}

/** Aynı kaynak → aynı eventID (tekrarlanan event'lerde Omnisend tarafı tekilleştirebilsin). */
export function deterministicEventId(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex")
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "5" + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) +
      hex.slice(18, 20),
    hex.slice(20, 32),
  ].join("-")
}

type MedusaLineItem = {
  id?: string
  product_id?: string | null
  variant_id?: string | null
  product_title?: string | null
  variant_title?: string | null
  title?: string | null
  variant_sku?: string | null
  product_handle?: string | null
  thumbnail?: string | null
  unit_price?: number | string | null
  quantity?: number | string | null
  discount_total?: number | string | null
}

export function toOmnisendLineItems(
  items: MedusaLineItem[] | null | undefined
): OmnisendLineItem[] {
  return (items ?? []).map((item) => {
    const discount = Number(item.discount_total ?? 0)
    return {
      productID: String(item.product_id || item.variant_id || item.id || ""),
      productTitle: String(item.product_title || item.title || ""),
      productPrice: Number(item.unit_price ?? 0),
      productQuantity: Number(item.quantity ?? 1),
      productVariantID: item.variant_id || undefined,
      productVariantTitle: item.variant_title || undefined,
      productSKU: item.variant_sku || undefined,
      productImageURL: item.thumbnail || undefined,
      productURL: productUrl(item.product_handle),
      productDiscount: discount > 0 ? discount : undefined,
    }
  })
}
