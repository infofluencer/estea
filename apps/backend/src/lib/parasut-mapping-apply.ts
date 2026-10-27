/**
 * product-mapping.json → Medusa variant.metadata.parasut_product_id seçimi (saf fonksiyon).
 * Yazma script'i: src/scripts/parasut-apply-mapping.ts
 */

import type { MatchEntry } from "./parasut-product-match"

export const PARASUT_PRODUCT_META_KEY = "parasut_product_id"

export type MappingReportFile = {
  generated_at?: string
  company_id?: string
  mapping?: Record<string, string>
  entries?: MatchEntry[]
}

export type MappingSelectOptions = {
  /** name_family (eski nesil, en çok faturalı) şüphelileri de al */
  includeFamily: boolean
  /** Hariç tutulacak SKU'lar (büyük/küçük harf duyarsız) */
  excludeSkus: string[]
}

export type SelectedMapping = {
  variant_id: string
  sku: string | null
  parasut_product_id: string
  parasut_name: string | null
  method: MatchEntry["method"]
  tier: MatchEntry["tier"]
}

export type MappingSelection = {
  selected: SelectedMapping[]
  skipped: { variant_id: string; sku: string | null; reason: string }[]
}

export function parseSkuList(raw: string | undefined | null): string[] {
  return (raw || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function selectMappingToApply(
  report: MappingReportFile,
  opts: MappingSelectOptions
): MappingSelection {
  const exclude = new Set(opts.excludeSkus.map((s) => s.toLowerCase()))
  const mapping = report.mapping || {}
  const selected: SelectedMapping[] = []
  const skipped: MappingSelection["skipped"] = []

  for (const e of report.entries || []) {
    const base = { variant_id: e.variant_id, sku: e.sku }
    if (!e.parasut_product_id) {
      skipped.push({ ...base, reason: `eşleşme yok (${e.method})` })
      continue
    }
    if (e.sku && exclude.has(e.sku.toLowerCase())) {
      skipped.push({ ...base, reason: "hariç tutuldu (PARASUT_APPLY_EXCLUDE_SKUS)" })
      continue
    }
    const inMapping = mapping[e.variant_id] === e.parasut_product_id
    const family = opts.includeFamily && e.method === "name_family"
    if (!inMapping && !family) {
      skipped.push({ ...base, reason: `onaysız ${e.method}/${e.tier}` })
      continue
    }
    selected.push({
      ...base,
      parasut_product_id: e.parasut_product_id,
      parasut_name: e.parasut_name,
      method: e.method,
      tier: e.tier,
    })
  }
  return { selected, skipped }
}

/** Varyant metadata'sındaki Parasut ürün id'si (string/number kabul). */
export function parasutProductIdFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const raw = metadata?.[PARASUT_PRODUCT_META_KEY]
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw)
  if (typeof raw === "string" && raw.trim()) return raw.trim()
  return null
}
