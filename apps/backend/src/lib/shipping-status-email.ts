import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { formatOrderNumber } from "@escay/shared/order-number"
import {
  buildOrderDeliveredEmail,
  buildOrderShippedEmail,
} from "../emails/shipping-notifications"
import { getCarrierFor } from "../modules/carrier/registry"
import { readFulfillmentData } from "../modules/carrier/types"
import { createNotificationIdempotent } from "./notify"

type ShippingMailKind = "shipped" | "delivered"

/**
 * Load order + fulfillment tracking bits and send customer shipping email.
 */
export async function sendShippingStatusEmail(
  container: MedusaContainer,
  input: {
    orderId: string
    fulfillmentId: string
    kind: ShippingMailKind
  }
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "display_id",
      "custom_display_id",
      "fulfillments.id",
      "fulfillments.labels.tracking_number",
      "fulfillments.labels.tracking_url",
      "fulfillments.data",
    ],
    filters: { id: input.orderId },
  })

  const order = data?.[0] as
    | {
        id: string
        email?: string | null
        display_id?: number | string | null
        custom_display_id?: string | null
        fulfillments?:
          | {
              id: string
              labels?:
                | {
                    tracking_number?: string | null
                    tracking_url?: string | null
                  }[]
                | null
              data?: Record<string, unknown> | null
            }[]
          | null
      }
    | undefined

  if (!order?.id) {
    logger.warn(
      `[shipping-email] Order missing — order=${input.orderId} kind=${input.kind}`
    )
    return
  }

  const email = order.email?.trim()
  if (!email) {
    logger.warn(
      `[shipping-email] No email — order=${input.orderId} kind=${input.kind}`
    )
    return
  }

  const fulfillment = (order.fulfillments || []).find(
    (f) => f.id === input.fulfillmentId
  )
  const label = fulfillment?.labels?.[0]
  const fdata = readFulfillmentData(fulfillment?.data)
  const adapter = getCarrierFor(fulfillment?.data)

  const trackingNumber = label?.tracking_number || fdata.tracking_number || null
  const carrierCode = fdata.carrier_name || adapter?.name || null
  const trackingUrl =
    label?.tracking_url ||
    fdata.tracking_url ||
    (trackingNumber && adapter ? adapter.trackingUrl(trackingNumber) : null) ||
    null

  const orderDisplayId =
    formatOrderNumber(order.display_id) ||
    String(order.custom_display_id ?? order.display_id ?? order.id)

  const storefrontUrl = (
    process.env.STOREFRONT_URL || "http://localhost:3025"
  ).replace(/\/$/, "")
  const trackingPageUrl = `${storefrontUrl}/order-tracking/${encodeURIComponent(order.id)}?email=${encodeURIComponent(email)}`

  const mail =
    input.kind === "shipped"
      ? buildOrderShippedEmail({
          orderDisplayId,
          email,
          trackingNumber,
          trackingUrl,
          carrierCode,
          trackingPageUrl,
        })
      : buildOrderDeliveredEmail({
          orderDisplayId,
          email,
          trackingNumber,
          trackingUrl,
          carrierCode,
          trackingPageUrl,
        })

  const notificationService = container.resolve(Modules.NOTIFICATION)
  const template =
    input.kind === "shipped" ? "order-shipped" : "order-delivered"

  await createNotificationIdempotent(notificationService, {
    to: email,
    channel: "email",
    template,
    content: {
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    },
    resource_id: input.fulfillmentId,
    resource_type: "fulfillment",
    idempotency_key: `${template}:${input.fulfillmentId}`,
  })

  logger.info(
    `[shipping-email] Sent ${input.kind} — order=${order.id} ful=${input.fulfillmentId} to=${email}`
  )
}
