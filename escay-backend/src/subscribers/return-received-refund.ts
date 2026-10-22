import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { processReturnRefund } from "../lib/return-refund"
import { isReturnRejected } from "../lib/return-rejection"

type ReturnReceivedEvent = {
  order_id: string
  return_id: string
}

/**
 * Admin return "received" onayından sonra PayTR refund.
 * İnsan onayı korunur — request aşamasında refund yok.
 * Reddedilmiş iadede ASLA refund yok.
 */
export default async function returnReceivedRefundHandler({
  event: { data },
  container,
}: SubscriberArgs<ReturnReceivedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!data?.return_id) {
    logger.warn("[return-received-refund] Missing return_id — skip")
    return
  }

  // Early guard: load metadata before processReturnRefund (also guards inside)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: returns } = await query.graph({
      entity: "return",
      fields: ["id", "metadata"],
      filters: { id: data.return_id },
    })
    const meta = (
      returns?.[0] as { metadata?: Record<string, unknown> } | undefined
    )?.metadata
    if (isReturnRejected(meta)) {
      logger.info(
        `[return-received-refund] Skip rejected return=${data.return_id}`
      )
      return
    }
  } catch (err) {
    logger.warn(
      `[return-received-refund] Rejection check failed — continuing to processReturnRefund: ${String(err)}`
    )
  }

  logger.info(
    `[return-received-refund] Processing — return=${data.return_id} order=${data.order_id}`
  )

  const result = await processReturnRefund(container, {
    return_id: data.return_id,
    order_id: data.order_id,
  })

  if (result.ok) {
    logger.info(
      `[return-received-refund] Done — return=${data.return_id} ` +
        `skipped=${Boolean(result.skipped)} amount=${result.meta.amount ?? 0}`
    )
  } else if (!result.skipped) {
    logger.error(
      `[return-received-refund] Failed — return=${data.return_id}: ${result.meta.error || "unknown"}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.return_received",
}
