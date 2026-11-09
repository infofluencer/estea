import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { syncBizimhesapStock } from "../lib/bizimhesap-stock-sync"
import { BIZIMHESAP_MODULE } from "../modules/bizimhesap"
import type BizimhesapModuleService from "../modules/bizimhesap/service"

/**
 * İlk Token bağlantısı: gerçek yanıtın biçimini gösterir ve planı yazdırır.
 * Medusa stoğuna YAZMAZ. Kullanım: npm run test:bizimhesap:stock
 */
export default async function testBizimhesapStock({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const bizimhesap = container.resolve<BizimhesapModuleService>(BIZIMHESAP_MODULE)
  if (!bizimhesap.isStockConfigured()) {
    throw new Error("BIZIMHESAP_TOKEN boş.")
  }

  const warehouses = await bizimhesap.listWarehouses()
  logger.info(`[test-stock] depolar (${warehouses.length}): ${JSON.stringify(warehouses, null, 2)}`)

  const products = await bizimhesap.listProducts()
  logger.info(`[test-stock] ürün sayısı ${products.length}, ilk satır: ${JSON.stringify(products[0], null, 2)}`)

  const warehouseId = bizimhesap.getStockOptions().warehouseId
  if (warehouseId) {
    const inventory = await bizimhesap.listInventory(warehouseId)
    logger.info(`[test-stock] depo satırı ${inventory.length}, ilk satır: ${JSON.stringify(inventory[0], null, 2)}`)
  }

  const result = await syncBizimhesapStock(container, { apply: false })
  if (result.status === "disabled") return

  const { parsed, plan, skipped } = result
  logger.info(
    `[test-stock] ${result.status} depo=${result.warehouseId} bizimhesapSku=${parsed.bySku.size} eşleşen=${plan.matched} değişecek=${plan.changes.length}`
  )
  for (const c of plan.changes) {
    logger.info(`[test-stock] ${c.sku}: ${c.from} → ${c.to} (BizimHesap ${c.bizimhesap}, yolda ${c.inFlight})`)
  }
  logger.info(`[test-stock] BizimHesap'ta yok: ${plan.missing.join(", ") || "-"}`)
  logger.info(`[test-stock] miktar okunamadı: ${parsed.invalidQuantity.join(", ") || "-"}`)
  logger.info(`[test-stock] mükerrer: ${parsed.duplicates.join(", ") || "-"}`)
  logger.info(`[test-stock] SKU'suz satır: ${parsed.rowsWithoutSku}`)
  logger.info(`[test-stock] atlanan: ${skipped.map((s) => `${s.sku} (${s.reason})`).join(", ") || "-"}`)
}
