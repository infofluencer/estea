import type { MedusaContainer } from "@medusajs/framework/types"
import { reconcilePaytrCheckouts } from "../lib/paytr-checkout"

/**
 * PayTR bildirimi gelmeyen ya da sipariş oluşturulamayan ödemeleri toplar
 * (ayrıntı: lib/paytr-checkout.ts). Bildirim adresi bozulsa bile para kaçmaz.
 */
export default async function reconcilePaytrCheckoutsJob(container: MedusaContainer) {
  const logger = container.resolve("logger") as { info: (m: string) => void }
  const summary = await reconcilePaytrCheckouts(container)
  if (Object.values(summary).some((n) => n > 0)) {
    logger.info(`[paytr-checkout] reconcile ${JSON.stringify(summary)}`)
  }
}

export const config = {
  name: "reconcile-paytr-checkouts",
  schedule: "*/5 * * * *",
}
