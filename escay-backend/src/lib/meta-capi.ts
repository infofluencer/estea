/**
 * Meta Conversions API — sunucu tarafı Purchase (WP'de PixelYourSite "server API" açıktı).
 *
 * - META_CAPI_TOKEN veya META_PIXEL_ID boşsa kapalı.
 * - Canlı dışı ortamda (PAYTR_OID_PREFIX dolu) gönderilmez.
 * - Yalnızca müşteri çerez "Pazarlama" onayı verdiyse (order.metadata.tracking_consent).
 * - event_id = "purchase-<orderId>": storefront Pixel'in eventID'si ile aynı → Meta tekilleştirir.
 */
import { createHash } from "crypto"

const GRAPH_VERSION = "v21.0"

type Logger = { info: (m: string) => void; warn: (m: string) => void }

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex")

function hashed(value?: string | null, normalize: (s: string) => string = (s) => s) {
  const v = normalize((value || "").trim().toLowerCase())
  return v ? [sha256(v)] : undefined
}

function phoneDigits(s: string) {
  let d = s.replace(/\D/g, "")
  if (d.startsWith("0")) d = `90${d.slice(1)}`
  else if (d.length === 10) d = `90${d}`
  return d
}

export function metaCapiSkipReason(order: {
  metadata?: Record<string, unknown> | null
}): string | null {
  if (!(process.env.META_CAPI_TOKEN || "").trim()) return "META_CAPI_TOKEN unset"
  if (!(process.env.META_PIXEL_ID || "").trim()) return "META_PIXEL_ID unset"
  if ((process.env.PAYTR_OID_PREFIX || "").trim()) return "non-prod environment"
  if (order.metadata?.tracking_consent !== true) return "no marketing cookie consent"
  return null
}

export async function sendMetaPurchase(
  logger: Logger,
  order: {
    id: string
    email?: string | null
    total?: number | string | null
    created_at?: string | Date | null
    metadata?: Record<string, unknown> | null
    shipping_address?: {
      first_name?: string | null
      last_name?: string | null
      phone?: string | null
      city?: string | null
      postal_code?: string | null
      country_code?: string | null
    } | null
    items?: {
      variant_id?: string | null
      quantity?: number | string | null
      variant?: { sku?: string | null } | null
    }[] | null
  }
): Promise<boolean> {
  const skip = metaCapiSkipReason(order)
  if (skip) {
    logger.info(`[meta-capi] skip order=${order.id}: ${skip}`)
    return false
  }

  const pixelId = (process.env.META_PIXEL_ID || "").trim()
  const storefront = (process.env.STOREFRONT_URL || "").replace(/\/$/, "")
  const a = order.shipping_address
  const contents = (order.items ?? []).map((i) => ({
    id: String(i.variant?.sku ?? i.variant_id ?? ""),
    quantity: Number(i.quantity ?? 1),
  }))

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(
          new Date(order.created_at ?? Date.now()).getTime() / 1000
        ),
        event_id: `purchase-${order.id}`,
        action_source: "website",
        event_source_url: `${storefront}/odeme/confirmation/${order.id}`,
        user_data: {
          em: hashed(order.email),
          ph: hashed(a?.phone, phoneDigits),
          fn: hashed(a?.first_name),
          ln: hashed(a?.last_name),
          ct: hashed(a?.city, (s) => s.replace(/\s+/g, "")),
          zp: hashed(a?.postal_code),
          country: hashed(a?.country_code || "tr"),
          external_id: hashed(order.email),
        },
        custom_data: {
          currency: "TRY",
          value: Number(order.total ?? 0),
          order_id: order.id,
          content_type: "product",
          content_ids: contents.map((c) => c.id),
          contents,
        },
      },
    ],
    ...(process.env.META_CAPI_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE }
      : {}),
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(
        process.env.META_CAPI_TOKEN!.trim()
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!res.ok) {
      logger.warn(
        `[meta-capi] order=${order.id} → ${res.status}: ${(await res.text()).slice(0, 300)}`
      )
      return false
    }
    logger.info(`[meta-capi] Purchase sent order=${order.id}`)
    return true
  } catch (err) {
    logger.warn(
      `[meta-capi] order=${order.id} failed: ${err instanceof Error ? err.message : String(err)}`
    )
    return false
  }
}
