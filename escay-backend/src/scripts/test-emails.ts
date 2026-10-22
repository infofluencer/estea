/**
 * Smoke-test email notifications via Mailpit.
 *
 * Usage: npm run test:emails
 * Requires: docker compose mailpit running, backend .env SMTP_* pointing to localhost:1025
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { buildOrderConfirmationEmail } from "../emails/order-confirmation"
import { buildPasswordResetEmail } from "../emails/password-reset"

export default async function testEmails({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const notificationService = container.resolve(Modules.NOTIFICATION)

  const testTo = process.env.SMTP_TEST_TO || "test@example.com"

  const storefrontUrl = (
    process.env.STOREFRONT_URL || "http://localhost:3015"
  ).replace(/\/$/, "")
  const orderEmail = buildOrderConfirmationEmail({
    displayId: "10042",
    email: testTo,
    trackingUrl: `${storefrontUrl}/order-tracking/order_test?email=${encodeURIComponent(testTo)}`,
    trackingFormUrl: `${storefrontUrl}/order-tracking`,
    currencyCode: "TRY",
    items: [
      {
        title: "Es Çay Oversize Tişört",
        quantity: 2,
        unit_price: 599,
        variant_title: "Siyah / M",
      },
      {
        title: "Es Çay Basic Hoodie",
        quantity: 1,
        unit_price: 1299,
        variant_title: "Bej / L",
      },
    ],
    itemTotal: 2497,
    shippingTotal: 49,
    taxTotal: 0,
    total: 2546,
    shippingAddress: {
      first_name: "Ayşe",
      last_name: "Yılmaz",
      address_1: "Atatürk Cad. No: 12",
      city: "İstanbul",
      postal_code: "34000",
      country_code: "tr",
      phone: "+905551234567",
    },
  })

  await notificationService.createNotifications({
    to: testTo,
    channel: "email",
    template: "order-confirmation",
    content: orderEmail,
  })
  logger.info(`[test-emails] Order confirmation sent to ${testTo}`)

  const resetEmail = buildPasswordResetEmail({
    email: testTo,
    resetUrl: `${process.env.STOREFRONT_URL || "http://localhost:8000"}/reset-password?token=sample-token&email=${encodeURIComponent(testTo)}`,
  })

  await notificationService.createNotifications({
    to: testTo,
    channel: "email",
    template: "password-reset",
    content: resetEmail,
  })
  logger.info(`[test-emails] Password reset sent to ${testTo}`)
  logger.info("[test-emails] Check Mailpit at http://localhost:8025")
}
