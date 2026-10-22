import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  deleteProductCategoriesWorkflow,
  deleteProductsWorkflow,
  deleteRegionsWorkflow,
  deleteTaxRegionsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * One-shot demo/orphan cleanup. Approved by user.
 * Run: npx medusa exec ./src/scripts/cleanup-demo.ts
 */
export default async function cleanupDemo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const KEEP_HANDLES = new Set([
    "salacak-omuz-sal",
    "tarabya-desenli-sal",
    "gulcemal-desenli-sal",
  ])

  const productModule = container.resolve("product") as any
  let allProducts: any[]
  try {
    allProducts = await productModule.listProducts({}, { withDeleted: true })
  } catch {
    // fallback: query active + explicit soft-deleted ids
    const { data: active } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "deleted_at"],
    })
    allProducts = active as any[]
    // soft-deleted known ids
    const softIds = [
      "prod_01KZPA3TWFMZNC7WCYMBA6VJX6",
      "prod_01KZPA3TWFV5F28NQ9BPZ4P1X8",
    ]
    for (const id of softIds) {
      if (!allProducts.find((p) => p.id === id)) {
        allProducts.push({ id, handle: "soft-deleted", deleted_at: new Date() })
      }
    }
  }

  const toDeleteProducts = allProducts.filter((p: any) => {
    // Keep only ACTIVE Es Çay products
    if (KEEP_HANDLES.has(p.handle) && !p.deleted_at) return false
    return true
  })

  logger.info(
    `Products to delete (${toDeleteProducts.length}): ${toDeleteProducts
      .map((p: any) => `${p.handle}:${p.id}${p.deleted_at ? ":soft" : ""}`)
      .join(", ")}`
  )

  if (toDeleteProducts.length) {
    await deleteProductsWorkflow(container).run({
      input: { ids: toDeleteProducts.map((p: any) => p.id) },
    })
    logger.info("Products deleted.")
  }

  // Demo categories
  const DEMO_CAT_HANDLES = ["shirts", "sweatshirts", "pants", "merch"]
  const { data: cats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle", "name"],
    filters: { handle: DEMO_CAT_HANDLES },
  })
  if (cats.length) {
    logger.info(
      `Categories to delete: ${cats.map((c: any) => c.handle).join(", ")}`
    )
    await deleteProductCategoriesWorkflow(container).run({
      input: cats.map((c: any) => c.id as string),
    })
    logger.info("Demo categories deleted.")
  } else {
    logger.info("No demo categories found.")
  }

  // Europe region
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
    filters: { name: "Europe" },
  })
  if (regions.length) {
    logger.info(`Deleting region Europe: ${regions[0].id}`)
    try {
      await deleteRegionsWorkflow(container).run({
        input: { ids: [regions[0].id] },
      })
      logger.info("Europe region deleted.")
    } catch (e: any) {
      logger.error(`Europe region delete failed: ${e.message}`)
      throw e
    }
  }

  // EU tax regions (keep tr)
  const { data: taxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code"],
  })
  const euTax = (taxRegions as any[]).filter(
    (t) => t.country_code && t.country_code !== "tr"
  )
  if (euTax.length) {
    logger.info(
      `Deleting EU tax regions: ${euTax.map((t) => t.country_code).join(", ")}`
    )
    await deleteTaxRegionsWorkflow(container).run({
      input: { ids: euTax.map((t) => t.id) },
    })
    logger.info("EU tax regions deleted.")
  }

  logger.info("Cleanup complete.")
}
