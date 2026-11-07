import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  FulfillmentWorkflowEvents,
} from "@medusajs/framework/utils"
import { issueSalesInvoiceForOrder } from "../lib/bizimhesap-invoice"

type DeliveryCreatedEvent = {
  id: string
}

function asNumber(value: unknown): number {
  if (value != null && typeof value === "object" && "value" in value) {
    return asNumber((value as { value: unknown }).value)
  }
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * delivery.created → BizimHesap satış faturası (teslimden sonra kesilir).
 * Kargo takibi ve admin "Teslim edildi" aynı olayı yayar; payload.id = fulfillment id.
 * Değişim gönderisinin teslimi de gelir: fatura zaten varsa idempotent atlanır.
 * Tahsilatı olmayan sipariş faturalanmaz. firmId yoksa mock; hata metadata'ya yazılır.
 */
export default async function deliveryCreatedBizimhesapHandler({
  event: { data },
  container,
}: SubscriberArgs<DeliveryCreatedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillmentId = data?.id

  if (!fulfillmentId) {
    logger.warn("[delivery-created-bizimhesap] Missing fulfillment id — skip")
    return
  }

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: links } = await query.graph({
      entity: "order_fulfillment",
      fields: ["order_id"],
      filters: { fulfillment_id: fulfillmentId },
    })
    const orderId = (links?.[0] as { order_id?: string } | undefined)?.order_id
    if (!orderId) {
      logger.warn(
        `[delivery-created-bizimhesap] No order linked to ful=${fulfillmentId}`
      )
      return
    }

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "payment_collections.status",
        "payment_collections.captured_amount",
      ],
      filters: { id: orderId },
    })
    const collections =
      (orders?.[0] as
        | {
            payment_collections?: {
              status?: string | null
              captured_amount?: unknown
            }[]
          }
        | undefined)?.payment_collections || []
    const paid = collections.some(
      (pc) => pc.status === "completed" || asNumber(pc.captured_amount) > 0
    )
    if (!paid) {
      logger.warn(
        `[delivery-created-bizimhesap] Skip — order=${orderId} tahsilat yok, fatura kesilmedi`
      )
      return
    }

    const result = await issueSalesInvoiceForOrder(container, orderId)
    if (result.skipped) {
      logger.info(
        `[delivery-created-bizimhesap] Skipped order=${orderId} status=${result.meta.status}`
      )
      return
    }
    if (!result.ok) {
      logger.error(
        `[delivery-created-bizimhesap] Invoice failed order=${orderId}: ${result.meta.error || result.meta.status}`
      )
      return
    }
    logger.info(
      `[delivery-created-bizimhesap] order=${orderId} status=${result.meta.status} guid=${result.meta.guid || "-"}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[delivery-created-bizimhesap] Error ful=${fulfillmentId}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: FulfillmentWorkflowEvents.DELIVERY_CREATED,
}
