import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { pendingBankTransferForOrder } from "../lib/bank-transfer"
import { getBankTransferOrderState } from "../lib/bank-transfer-confirm"
import { errorText, recordOpsEvent } from "../lib/ops-events"
import { generateOrderContracts } from "../lib/order-contracts"
import { sendOrderConfirmationEmail } from "../lib/order-confirmation-email"

type OrderPlacedEvent = {
  id: string
}

/**
 * order.placed fires at cart.complete — BEFORE PayTR capture.
 * Confirmation email moved to payment.captured (see payment-captured-email.ts).
 * Kart siparişinde mail yok → unpaid/fail never get "Alındı".
 *
 * Havale / EFT: ödeme müşterinin elinde → IBAN'lı "Ödemeniz Bekleniyor" maili.
 * Ödeme admin'den onaylanınca payment.captured → normal "Siparişiniz Alındı".
 */
export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderId = data?.id
  if (!orderId) return

  // Sözleşmeler sipariş anındaki hâliyle saklanır (kart / havale fark etmez).
  let contractError: string | null = null
  try {
    const result = await generateOrderContracts(container, orderId)
    if (!result.ok) contractError = result.error
  } catch (error) {
    contractError = errorText(error)
  }
  if (contractError) {
    logger.error(`[order-placed] Sözleşme PDF'leri üretilemedi order=${orderId}: ${contractError}`)
    await recordOpsEvent(container, {
      kind: "contract.failed",
      level: "error",
      title: "Sözleşme PDF'leri oluşturulamadı",
      detail: `${contractError} — sipariş sayfasındaki Sözleşmeler kutusundan "Sözleşmeleri oluştur"a basın.`,
      orderId,
      once: true,
    }).catch(() => undefined)
  }

  try {
    const bankTransfer = await pendingBankTransferForOrder(container, orderId)
    if (bankTransfer) {
      await sendOrderConfirmationEmail(container, orderId, { bankTransfer })
    } else {
      logger.info(
        `[order-placed] No confirmation email on place — wait for payment.captured (order=${orderId})`
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/idempotenc|duplicate|unique/i.test(message)) {
      logger.error(`[order-placed] Havale maili gönderilemedi order=${orderId}: ${message}`)
    }
  }

  // Admin'e "Havale bekleniyor" kaydı — maili engellemesin diye ayrı; IBAN env'i
  // boş olsa bile (mail gidemez) havale siparişi görünür kalsın.
  try {
    const state = await getBankTransferOrderState(container, orderId)
    if (!state.is_bank_transfer || state.state !== "pending") return
    const amount = Number(state.amount)
    await recordOpsEvent(container, {
      kind: "payment.pending",
      level: "warning",
      title: `Yeni havale / EFT siparişi — ${Number.isFinite(amount) ? `${amount.toFixed(2)} TL` : "tutar ?"} bekleniyor`,
      detail: "Para hesaba geçince sipariş sayfasındaki Havale / EFT kutusundan \"Havale alındı\"ya basın.",
      orderId,
      data: { method: "bank_transfer", amount: Number.isFinite(amount) ? amount : null },
      once: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`[order-placed] Havale olayı yazılamadı order=${orderId}: ${message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
