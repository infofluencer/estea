/**
 * Medusa varyant → Parasut ürün eşleştirme RAPORU. SALT OKUMA.
 *
 *   npx medusa exec ./src/scripts/parasut-product-match.ts
 *   (Docker: ./src/scripts/parasut-product-match.js)
 *
 * - Parasut: yalnızca GET /products (sayfalı). Ürün oluşturmaz / değiştirmez.
 * - Medusa: yalnızca query.graph. Metadata yazmaz.
 * - Çıktı: PARASUT_MATCH_OUT (varsayılan ./product-mapping.json)
 *   PARASUT_MATCH_STDOUT=1 → tam JSON log'a da basılır.
 */

import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  matchVariantsToParasut,
  type MedusaVariantRow,
} from "../lib/parasut-product-match"
import { PARASUT_MODULE, isMockMode } from "../modules/parasut"
import { ParasutError, retryAfterMs } from "../modules/parasut/client"
import ParasutModuleService from "../modules/parasut/service"
import type { ParasutProductRecord } from "../modules/parasut/types"

const MAX_PAGES = 200
const MEDUSA_PAGE = 100
const PAGE_DELAY_MS = 400
const RATE_LIMIT_ATTEMPTS = 4

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Client kendi retry'ını tüketse de 429'da Parasut'un istediği kadar bekleyip sayfayı yeniden dene. */
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  logger: { info: (m: string) => void }
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!(err instanceof ParasutError) || err.status !== 429 || attempt >= RATE_LIMIT_ATTEMPTS) {
        throw err
      }
      const wait = retryAfterMs(err) ?? 10000
      logger.info(`[parasut-match] 429 — ${wait}ms bekleniyor (deneme ${attempt}/${RATE_LIMIT_ATTEMPTS - 1})`)
      await sleep(wait)
    }
  }
}

function asNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === "object" && "value" in (value as object)) {
    return asNumber((value as { value: unknown }).value)
  }
  const n = Number(typeof value === "object" ? String(value) : value)
  return Number.isFinite(n) ? n : null
}

async function fetchParasutProducts(
  parasut: ParasutModuleService,
  logger: { info: (m: string) => void }
): Promise<ParasutProductRecord[]> {
  const client = parasut.getClient()
  const all: ParasutProductRecord[] = []
  let totalPages = 1
  for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS)
    const res = await withRateLimitRetry(() => client.listProductsPage(page, 25), logger)
    totalPages = res.totalPages || totalPages
    all.push(...res.products)
    logger.info(
      `[parasut-match] Parasut sayfa ${page}/${totalPages} +${res.products.length} (toplam ${all.length}/${res.totalCount})`
    )
    if (!res.products.length) break
  }
  const seen = new Set<string>()
  return all.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
}

async function fetchMedusaVariants(
  query: { graph: (args: Record<string, unknown>) => Promise<{ data: unknown[] }> }
): Promise<MedusaVariantRow[]> {
  const rows: MedusaVariantRow[] = []
  for (let skip = 0; ; skip += MEDUSA_PAGE) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "status",
        "metadata",
        "variants.id",
        "variants.sku",
        "variants.title",
        "variants.prices.amount",
        "variants.prices.currency_code",
      ],
      pagination: { skip, take: MEDUSA_PAGE, order: { created_at: "ASC" } },
    })
    const products = data as {
      id: string
      title?: string | null
      handle?: string | null
      status?: string | null
      metadata?: Record<string, unknown> | null
      variants?: {
        id: string
        sku?: string | null
        title?: string | null
        prices?: { amount?: unknown; currency_code?: string | null }[] | null
      }[] | null
    }[]
    for (const p of products) {
      const variants = p.variants || []
      for (const v of variants) {
        const tryPrice = (v.prices || []).find(
          (pr) => (pr.currency_code || "").toLowerCase() === "try"
        )
        rows.push({
          variantId: v.id,
          sku: v.sku || null,
          variantTitle: v.title || null,
          productId: p.id,
          productTitle: p.title || "",
          productHandle: p.handle || null,
          productStatus: p.status || null,
          priceTry: asNumber(tryPrice?.amount),
          variantCount: variants.length,
        })
      }
    }
    if (products.length < MEDUSA_PAGE) break
  }
  return rows
}

export default async function parasutProductMatch({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const parasut = container.resolve(PARASUT_MODULE) as ParasutModuleService
  const opts = parasut.getOptions()

  if (isMockMode(opts)) {
    throw new Error(
      "REDDEDİLDİ: Parasut kimliği yok (mock). PARASUT_CLIENT_ID/SECRET/USERNAME/PASSWORD/COMPANY_ID gerekli."
    )
  }

  logger.info(
    `[parasut-match] SALT OKUMA start company=${opts.companyId} — Parasut'a yazma yok, Medusa'ya yazma yok`
  )

  const [products, variants] = await Promise.all([
    fetchParasutProducts(parasut, logger),
    fetchMedusaVariants(query as never),
  ])
  logger.info(
    `[parasut-match] Parasut ürün=${products.length} Medusa varyant=${variants.length}`
  )

  const report = matchVariantsToParasut(variants, products)
  const out = resolve(process.env.PARASUT_MATCH_OUT || "product-mapping.json")
  const file = {
    generated_at: new Date().toISOString(),
    company_id: opts.companyId,
    read_only: true,
    applied_to_medusa: false,
    ...report,
  }
  writeFileSync(out, JSON.stringify(file, null, 2), "utf8")

  const c = report.census
  const s = report.summary
  logger.info(
    `[parasut-match] ALAN SAYIMI parasut=${c.parasut_total} code_dolu=${c.code_filled} barcode_dolu=${c.barcode_filled} arşivli=${c.archived} code=sku=${c.code_matches_medusa_sku} barcode=sku=${c.barcode_matches_medusa_sku}`
  )
  logger.info(`[parasut-match] ÖRNEK ${JSON.stringify(c.samples)}`)
  logger.info(
    `[parasut-match] ÖZET varyant=${s.medusa_variants} kesin=${s.exact} yüksek=${s.high} şüpheli=${s.suspicious} eşleşmeyen=${s.unmatched} yöntem=${JSON.stringify(s.by_method)}`
  )
  logger.info(
    `[parasut-match] KARGO adayları ${JSON.stringify(report.shipping_candidates)}`
  )
  for (const e of report.suspicious) {
    logger.info(
      `[parasut-match] ŞÜPHELİ sku=${e.sku} "${e.product_title} / ${e.variant_title}" → ${e.parasut_product_id ?? "-"} "${e.parasut_name ?? ""}" ${e.method} ${e.confidence} | ${e.reasons.join("; ")}${e.alternatives ? ` | adaylar=${JSON.stringify(e.alternatives)}` : ""}`
    )
  }
  for (const e of report.unmatched) {
    logger.info(
      `[parasut-match] EŞLEŞMEYEN sku=${e.sku} "${e.product_title} / ${e.variant_title}" status=${e.product_status}`
    )
  }
  logger.info(
    `[parasut-match] Kullanılmayan Parasut ürünü=${report.unused_parasut_products.length} (ilk 20) ${JSON.stringify(report.unused_parasut_products.slice(0, 20))}`
  )
  if (process.env.PARASUT_MATCH_STDOUT === "1") {
    logger.info(`[parasut-match] JSON\n${JSON.stringify(file)}`)
  }
  logger.info(
    `[parasut-match] Rapor yazıldı: ${out} — mapping (kesin+yüksek)=${Object.keys(report.mapping).length}. Medusa'ya UYGULANMADI.`
  )
}
