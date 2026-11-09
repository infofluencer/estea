import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BIZIMHESAP_MODULE } from "../modules/bizimhesap"
import type BizimhesapModuleService from "../modules/bizimhesap/service"
import {
  buildStockBySku,
  computeInFlightBySku,
  computeStockPlan,
  describeWarehouses,
  findWarehouseId,
  toTrackedVariants,
  type OrderGraphRow,
  type ParsedStock,
  type StockPlan,
  type VariantGraphRow,
} from "../modules/bizimhesap/stock"
import { recordOpsEvent } from "./ops-events"

/** Kargoda kalma + fatura gecikmesini rahat aşan pencere. */
const IN_FLIGHT_LOOKBACK_DAYS = 45
const REPORT_LIST_LIMIT = 40

export type StockSyncResult =
  | { status: "disabled" }
  | {
      status: "applied" | "dry_run" | "guarded"
      warehouseId: string
      parsed: ParsedStock
      plan: StockPlan
      skipped: { sku: string; reason: string }[]
    }

type LockingLike = {
  execute: <T>(
    keys: string | string[],
    job: () => Promise<T>,
    args?: { timeout?: number; ttl?: number }
  ) => Promise<T>
}

function dayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function listText(values: string[]): string {
  const shown = values.slice(0, REPORT_LIST_LIMIT).join(", ")
  return values.length > REPORT_LIST_LIMIT ? `${shown} (+${values.length - REPORT_LIST_LIMIT})` : shown
}

async function resolveWarehouseId(
  bizimhesap: BizimhesapModuleService,
  configured: string
): Promise<string> {
  if (configured) return configured
  const warehouses = await bizimhesap.listWarehouses()
  const id = warehouses.length === 1 ? findWarehouseId(warehouses) : ""
  if (!id) {
    throw new Error(
      `BIZIMHESAP_WAREHOUSE_ID gerekli (${warehouses.length} depo geldi): ${describeWarehouses(warehouses)}`
    )
  }
  return id
}

/** Günde bir kez düşen, siparişe bağlı olmayan uyarı. */
async function warnDaily(
  container: MedusaContainer,
  title: string,
  values: string[]
): Promise<void> {
  if (!values.length) return
  await recordOpsEvent(container, {
    kind: "stock.sync",
    level: "warning",
    title: `${title} (${dayStamp()})`,
    detail: listText(values),
    oncePerTitle: true,
  })
}

async function runSync(
  container: MedusaContainer,
  bizimhesap: BizimhesapModuleService,
  applyOverride?: boolean
): Promise<StockSyncResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const options = bizimhesap.getStockOptions()
  const apply = applyOverride ?? options.apply

  const warehouseId = await resolveWarehouseId(bizimhesap, options.warehouseId)
  const [inventoryRows, productRows] = await Promise.all([
    bizimhesap.listInventory(warehouseId),
    bizimhesap.listProducts(),
  ])
  // Boş liste "her şey tükendi" değil, büyük olasılıkla hatalı yanıttır.
  if (!inventoryRows.length) {
    throw new Error(`Depo ${warehouseId} için boş stok listesi geldi`)
  }
  const parsed = buildStockBySku(inventoryRows, productRows, options)

  const { data: variantRows } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "sku",
      "manage_inventory",
      "inventory_items.required_quantity",
      "inventory_items.inventory_item_id",
      "inventory_items.inventory.location_levels.location_id",
      "inventory_items.inventory.location_levels.stocked_quantity",
      "inventory_items.inventory.location_levels.reserved_quantity",
    ],
  })
  const { tracked, skipped } = toTrackedVariants(
    variantRows as unknown as VariantGraphRow[],
    options.locationId
  )

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "status",
      "metadata",
      "items.variant_sku",
      "items.detail.fulfilled_quantity",
      "items.detail.return_received_quantity",
    ],
    filters: {
      created_at: { $gte: new Date(Date.now() - IN_FLIGHT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) },
      status: { $nin: ["canceled"] },
    },
  })

  const plan = computeStockPlan({
    variants: tracked,
    stockBySku: parsed.bySku,
    inFlightBySku: computeInFlightBySku(orders as unknown as OrderGraphRow[]),
    maxZeroRatio: options.maxZeroRatio,
  })

  await warnDaily(container, "BizimHesap'ta bulunmayan SKU'lar", plan.missing)
  await warnDaily(container, "BizimHesap'ta miktarı okunamayan SKU'lar", parsed.invalidQuantity)
  await warnDaily(container, "BizimHesap'ta birden çok satırı olan SKU'lar", parsed.duplicates)
  await warnDaily(
    container,
    "Eşitlenemeyen varyantlar",
    skipped.map((s) => `${s.sku}: ${s.reason}`)
  )
  await warnDaily(
    container,
    "Rezerve adedin altına düşen stok",
    plan.oversold.map((o) => `${o.sku}: stok ${o.target}, ayrılmış ${o.reserved}`)
  )

  if (tracked.length && !plan.matched) {
    throw new Error("Hiçbir SKU BizimHesap ile eşleşmedi; alan adı ya da SKU eşlemesi hatalı")
  }

  const summary = `depo=${warehouseId} eşleşen=${plan.matched} değişecek=${plan.changes.length} sıfırlanacak=${plan.newlyZero} eksik=${plan.missing.length} atlanan=${skipped.length}`

  if (plan.zeroGuardTripped) {
    await recordOpsEvent(container, {
      kind: "stock.sync",
      level: "error",
      title: `Toplu sıfırlama engellendi, stok yazılmadı (${dayStamp()})`,
      detail: `${summary}. Bilinçliyse BIZIMHESAP_STOCK_MAX_ZERO_RATIO=1.`,
      oncePerTitle: true,
    })
    return { status: "guarded", warehouseId, parsed, plan, skipped }
  }

  if (!apply) {
    logger.info(`[bizimhesap-stock] DRY-RUN ${summary}`)
    return { status: "dry_run", warehouseId, parsed, plan, skipped }
  }

  if (plan.changes.length) {
    const inventory = container.resolve(Modules.INVENTORY)
    await inventory.updateInventoryLevels(
      plan.changes.map((c) => ({
        inventory_item_id: c.inventoryItemId,
        location_id: c.locationId,
        stocked_quantity: c.to,
      }))
    )
  }
  logger.info(`[bizimhesap-stock] ${summary}`)
  return { status: "applied", warehouseId, parsed, plan, skipped }
}

/**
 * BizimHesap → Medusa tek yönlü stok eşitlemesi. Stok sahibi BizimHesap'tır.
 * `apply` verilmezse BIZIMHESAP_STOCK_APPLY belirler; kapalıyken yalnız rapor üretir.
 */
export async function syncBizimhesapStock(
  container: MedusaContainer,
  input?: { apply?: boolean }
): Promise<StockSyncResult> {
  const bizimhesap = container.resolve<BizimhesapModuleService>(BIZIMHESAP_MODULE)
  if (!bizimhesap.isStockConfigured()) return { status: "disabled" }

  const locking = container.resolve(Modules.LOCKING) as LockingLike
  return locking.execute(
    "bizimhesap-stock-sync",
    () => runSync(container, bizimhesap, input?.apply),
    { timeout: 30, ttl: 240 }
  )
}

export async function recordStockSyncFailure(
  container: MedusaContainer,
  message: string
): Promise<void> {
  await recordOpsEvent(container, {
    kind: "stock.sync",
    level: "error",
    title: `Stok eşitlemesi başarısız (${dayStamp()})`,
    detail: message,
    oncePerTitle: true,
  })
}
