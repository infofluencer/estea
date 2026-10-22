import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { issueRefundInvoiceForReturn } from "../lib/parasut-refund-invoice"
import type { ReturnRefundedEvent } from "./return-refunded-email"

/**
 * escay.return_refunded → Parasut iade faturası.
 * Reddedilen iadede bu event emit edilmez; yine de lib rejected guard içerir.
 */
export default async function returnRefundedParasutHandler({
  event: { data },
  container,
}: SubscriberArgs<ReturnRefundedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!data?.return_id || !data?.order_id) {
    logger.warn(
      "[return-refunded-parasut] Missing return_id/order_id — skip"
    )
    return
  }

  try {
    const result = await issueRefundInvoiceForReturn(container, {
      return_id: data.return_id,
      order_id: data.order_id,
      amount: data.amount,
    })
    if (result.skipped) {
      logger.info(
        `[return-refunded-parasut] Skipped return=${data.return_id} status=${result.meta.status}`
      )
      return
    }
    if (!result.ok) {
      logger.error(
        `[return-refunded-parasut] Failed return=${data.return_id}: ${result.meta.error || result.meta.status}`
      )
      return
    }
    logger.info(
      `[return-refunded-parasut] Refund invoice issued return=${data.return_id} no=${result.meta.invoice_number}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[return-refunded-parasut] Error return=${data.return_id}: ${message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "escay.return_refunded",
}
