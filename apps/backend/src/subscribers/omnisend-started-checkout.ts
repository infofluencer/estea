import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  CartWorkflowEvents,
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { createHash } from "crypto"

import {
  abandonedCheckoutUrl,
  omnisendSkipReason,
  sendOmnisendEvent,
  toOmnisendLineItems,
  upsertOmnisendContact,
} from "../lib/omnisend"

/**
 * cart.updated (checkout'ta e-posta + adres kaydı) → Omnisend "started checkout".
 * Abandoned Checkout otomasyonunu başlatır; "placed order" (payment.captured) durdurur.
 * Aynı sepet içeriği için tekrar göndermez (cache imzası).
 */
export default async function omnisendStartedCheckoutHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const cartId = data?.id
  if (!cartId) return

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "email",
        "currency_code",
        "total",
        "completed_at",
        "metadata",
        "shipping_address.first_name",
        "shipping_address.last_name",
        "shipping_address.city",
        "shipping_address.country_code",
        "items.*",
      ],
      filters: { id: cartId },
    })
    const cart = carts?.[0] as
      | {
          id: string
          email?: string | null
          currency_code?: string
          total?: number | string
          completed_at?: string | Date | null
          metadata?: Record<string, unknown> | null
          shipping_address?: {
            first_name?: string | null
            last_name?: string | null
            city?: string | null
            country_code?: string | null
          } | null
          items?: Parameters<typeof toOmnisendLineItems>[0]
        }
      | undefined

    // Checkout'a henüz gelinmedi (e-posta yok) veya sepet boş / tamamlandı
    if (!cart?.email || !cart.items?.length || cart.completed_at) return
    if (omnisendSkipReason(cart.email)) return

    const consent = cart.metadata?.marketing_consent === true
    const signature = createHash("sha256")
      .update(
        JSON.stringify([
          cart.email.toLowerCase(),
          consent,
          cart.items
            .map((i) => `${i.variant_id}:${i.quantity}`)
            .sort()
            .join(","),
        ])
      )
      .digest("hex")
      .slice(0, 16)
    const cacheKey = `omnisend:started-checkout:${cart.id}`

    const cache = container.resolve(Modules.CACHE) as {
      get: <T>(key: string) => Promise<T | null>
      set: (key: string, value: unknown, ttl?: number) => Promise<void>
    }
    if ((await cache.get<string>(cacheKey)) === signature) return
    await cache.set(cacheKey, signature, 60 * 60 * 24)

    const address = cart.shipping_address
    await upsertOmnisendContact(logger, {
      email: cart.email,
      subscribed: consent,
      firstName: address?.first_name,
      lastName: address?.last_name,
      city: address?.city,
      countryCode: address?.country_code,
      consentSource: "checkout",
    })

    await sendOmnisendEvent(logger, {
      eventName: "started checkout",
      email: cart.email,
      properties: {
        abandonedCheckoutURL: abandonedCheckoutUrl(cart.id),
        cartID: cart.id,
        currency: (cart.currency_code || "try").toUpperCase(),
        value: Number(cart.total ?? 0),
        lineItems: toOmnisendLineItems(cart.items),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`[omnisend-started-checkout] cart=${cartId}: ${message}`)
  }
}

export const config: SubscriberConfig = {
  event: CartWorkflowEvents.UPDATED,
}
