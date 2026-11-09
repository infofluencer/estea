import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  recordStockSyncFailure,
  syncBizimhesapStock,
} from "../lib/bizimhesap-stock-sync"
import { errorText } from "../lib/ops-events"

/**
 * BizimHesap → Medusa stok eşitlemesi. BIZIMHESAP_TOKEN boşken çalışmaz;
 * BIZIMHESAP_STOCK_APPLY=true olmadan yalnız rapor üretir.
 */
export default async function syncBizimhesapStockJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    await syncBizimhesapStock(container)
  } catch (err) {
    const message = errorText(err)
    logger.error(`[bizimhesap-stock] ${message}`)
    await recordStockSyncFailure(container, message)
  }
}

export const config = {
  name: "sync-bizimhesap-stock",
  schedule: "*/5 * * * *",
}
