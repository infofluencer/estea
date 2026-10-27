/** Shared storefront stock helpers (Medusa Store API). */

export type StockVariant = {
  inventory_quantity?: number | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
}

/** Show urgency when tracked stock is at or below this (inclusive). */
export const LOW_STOCK_THRESHOLD = 5
/** Within low band: show exact count ("Son n adet") at or below this. */
export const CRITICAL_STOCK_THRESHOLD = 3

export type LowStockLabel =
  | { kind: "critical"; count: number; text: string }
  | { kind: "low"; text: string }

/**
 * In stock unless inventory is managed and quantity is explicitly <= 0.
 * If quantity is missing (field not requested / not computed), assume available
 * to avoid false "Tükendi" badges.
 */
export function isVariantInStock(variant?: StockVariant | null): boolean {
  if (!variant) return false
  if (variant.manage_inventory === false) return true
  if (variant.allow_backorder) return true
  if (variant.inventory_quantity == null) return true
  return variant.inventory_quantity > 0
}

export function isProductSoldOut(
  variants: StockVariant[] | null | undefined
): boolean {
  const list = variants || []
  if (!list.length) return false
  return !list.some((v) => isVariantInStock(v))
}

/**
 * Tracked sellable qty for urgency labels, or null when stock is not tracked /
 * backorderable / unknown (no low-stock badge).
 */
export function trackedStockQuantity(
  variant?: StockVariant | null
): number | null {
  if (!variant) return null
  if (variant.manage_inventory === false) return null
  if (variant.allow_backorder) return null
  if (variant.inventory_quantity == null) return null
  return variant.inventory_quantity
}

/** Map a tracked quantity to label text. qty ≤ 0 → null (use sold-out UI). */
export function lowStockLabelForQuantity(
  qty: number | null | undefined
): LowStockLabel | null {
  if (qty == null || qty <= 0) return null
  if (qty <= CRITICAL_STOCK_THRESHOLD) {
    return { kind: "critical", count: qty, text: `Son ${qty} adet` }
  }
  if (qty <= LOW_STOCK_THRESHOLD) {
    return { kind: "low", text: "Tükeniyor" }
  }
  return null
}

/** PDP: selected variant only. */
export function lowStockLabelForVariant(
  variant?: StockVariant | null
): LowStockLabel | null {
  return lowStockLabelForQuantity(trackedStockQuantity(variant))
}

/**
 * Product / list card total: sum tracked qtys across variants.
 * Any unmanaged or backorderable variant → null (unlimited path → no badge).
 * Any missing quantity on a managed variant → null (avoid false urgency).
 */
export function productTrackedStockTotal(
  variants: StockVariant[] | null | undefined
): number | null {
  const list = variants || []
  if (!list.length) return null

  let total = 0
  for (const v of list) {
    if (v.manage_inventory === false || v.allow_backorder) return null
    if (v.inventory_quantity == null) return null
    total += Math.max(0, v.inventory_quantity)
  }
  return total
}

/** List cards: urgency from product-wide total (never a single thin variant). */
export function lowStockLabelForProduct(
  variants: StockVariant[] | null | undefined
): LowStockLabel | null {
  return lowStockLabelForQuantity(productTrackedStockTotal(variants))
}
