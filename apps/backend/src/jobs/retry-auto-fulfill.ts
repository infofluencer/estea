import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { autoFulfillOnPayment } from "../modules/carrier/registry"
import { retryPaidUnfulfilled } from "../lib/shipping/retry-auto-fulfill"

/**
 * Ödendi ama kargo kaydı açılamamış siparişleri 30 dk'da bir yeniden dener
 * (lib/shipping/retry-auto-fulfill.ts). Kargo gecikmesi siparişi iptal etmez.
 * Otomatik kargo kapalıyken (elle kargo) no-op.
 */
export default async function retryAutoFulfillJob(container: MedusaContainer) {
  if (!autoFulfillOnPayment()) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const s = await retryPaidUnfulfilled(container)
  if (s.candidates) logger.info(`[retry-auto-fulfill] ${JSON.stringify(s)}`)
}

export const config = {
  name: "retry-auto-fulfill",
  // track-shipments (*/30) ile aynı dakikaya denk gelmesin
  schedule: "10,40 * * * *",
}
