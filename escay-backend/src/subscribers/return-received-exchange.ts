import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { shipExchange } from "../lib/exchange"
import { isExchangeActive } from "../lib/exchange-plan"

type ReturnReceivedEvent = {
  order_id: string
  return_id: string
}

/**
 * Değişim iadesi teslim alınınca yeni ürünün gönderisi açılır (para iadesi
 * return-received-refund'da atlanır). Hata Logs'a düşer; admin "Yeni ürünü
 * gönder" ile tekrar dener.
 */
export default async function returnReceivedExchangeHandler({
  event: { data },
  container,
}: SubscriberArgs<ReturnReceivedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (!data?.return_id) return

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: returns } = await query.graph({
    entity: "return",
    fields: ["id", "metadata"],
    filters: { id: data.return_id },
  })
  const meta = (returns?.[0] as { metadata?: Record<string, unknown> | null } | undefined)?.metadata
  if (!isExchangeActive(meta)) return

  const result = await shipExchange(container, { return_id: data.return_id, actor: null })
  if (result.ok) {
    logger.info(
      `[return-received-exchange] return=${data.return_id} fulfillment=${result.fulfillment_id || "-"}${result.skipped ? ` (${result.skipped})` : ""}`
    )
  } else {
    logger.error(`[return-received-exchange] return=${data.return_id}: ${result.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.return_received",
}
