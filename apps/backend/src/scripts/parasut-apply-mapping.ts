/**
 * product-mapping.json → Medusa variant.metadata.parasut_product_id.
 * Parasut'a istek atmaz. Varsayılan DENEME: hiçbir şey yazmaz, planı loglar.
 *
 *   npx medusa exec ./src/scripts/parasut-apply-mapping.ts
 *   (Docker: ./src/scripts/parasut-apply-mapping.js)
 *
 * Env:
 *   PARASUT_MAPPING_IN=product-mapping.json
 *   PARASUT_APPLY_EXCLUDE_SKUS=MK2513-13 → virgülle ayrılmış SKU listesi
 *   PARASUT_APPLY_CONFIRM=yes           → gerçekten yaz
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  PARASUT_PRODUCT_META_KEY,
  parasutProductIdFromMetadata,
  parseSkuList,
  selectMappingToApply,
  type MappingReportFile,
} from "../lib/parasut-mapping-apply"

const VARIANT_CHUNK = 100

export default async function parasutApplyMapping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as any

  const confirm = process.env.PARASUT_APPLY_CONFIRM === "yes"
  const excludeSkus = parseSkuList(process.env.PARASUT_APPLY_EXCLUDE_SKUS)
  const input = resolve(process.env.PARASUT_MAPPING_IN || "product-mapping.json")

  const report = JSON.parse(readFileSync(input, "utf8")) as MappingReportFile
  if (!Array.isArray(report.entries)) {
    throw new Error(`REDDEDİLDİ: ${input} geçerli bir eşleştirme raporu değil (entries yok)`)
  }
  logger.info(
    `[parasut-apply] ${confirm ? "YAZMA" : "DENEME (yazma yok)"} rapor=${input} generated_at=${report.generated_at} company=${report.company_id} exclude=${excludeSkus.join(",") || "-"}`
  )

  const { selected, skipped } = selectMappingToApply(report, { excludeSkus })

  const current = new Map<string, { sku: string | null; metadata: Record<string, unknown> | null }>()
  const ids = selected.map((s) => s.variant_id)
  for (let i = 0; i < ids.length; i += VARIANT_CHUNK) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "metadata"],
      filters: { id: ids.slice(i, i + VARIANT_CHUNK) },
    })
    for (const v of data as { id: string; sku?: string | null; metadata?: Record<string, unknown> | null }[]) {
      current.set(v.id, { sku: v.sku ?? null, metadata: v.metadata ?? null })
    }
  }

  const counts = { write: 0, unchanged: 0, overwrite: 0, missing: 0, sku_changed: 0 }
  for (const s of selected) {
    const v = current.get(s.variant_id)
    if (!v) {
      counts.missing++
      logger.warn(`[parasut-apply] ATLA varyant yok variant=${s.variant_id} sku=${s.sku}`)
      continue
    }
    if ((v.sku || null) !== (s.sku || null)) {
      counts.sku_changed++
      logger.warn(
        `[parasut-apply] ATLA SKU değişmiş variant=${s.variant_id} rapor=${s.sku} şimdi=${v.sku} — raporu yeniden üretin`
      )
      continue
    }
    const existing = parasutProductIdFromMetadata(v.metadata)
    if (existing === s.parasut_product_id) {
      counts.unchanged++
      continue
    }
    if (existing) {
      counts.overwrite++
      logger.warn(
        `[parasut-apply] DEĞİŞECEK sku=${s.sku} ${existing} → ${s.parasut_product_id}`
      )
    }
    counts.write++
    logger.info(
      `[parasut-apply] ${confirm ? "YAZ" : "YAZILACAK"} sku=${s.sku} → ${s.parasut_product_id} "${s.parasut_name}" (${s.method}/${s.tier})`
    )
    if (confirm) {
      await productModule.updateProductVariants(s.variant_id, {
        metadata: { ...(v.metadata || {}), [PARASUT_PRODUCT_META_KEY]: s.parasut_product_id },
      })
    }
  }

  for (const k of skipped) {
    logger.info(`[parasut-apply] UYGULANMAYAN sku=${k.sku} — ${k.reason}`)
  }
  logger.info(
    `[parasut-apply] ÖZET seçilen=${selected.length} ${confirm ? "yazılan" : "yazılacak"}=${counts.write} (üzerine=${counts.overwrite}) zaten_aynı=${counts.unchanged} varyant_yok=${counts.missing} sku_değişmiş=${counts.sku_changed} uygulanmayan=${skipped.length}${confirm ? "" : " — DENEME: yazmak için PARASUT_APPLY_CONFIRM=yes"}`
  )
}
