import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import catalog from "../../data/catalog.json"

type CatalogProduct = {
  handle: string
  specifications?: Record<string, string>
}

/**
 * Fill empty metadata.specifications on live products from catalog.json.
 * Run: npx medusa exec ./src/scripts/backfill-product-specifications.ts
 */
export default async function backfillProductSpecifications({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const byHandle = new Map(
    (catalog.products as CatalogProduct[])
      .filter((p) => p.specifications && Object.keys(p.specifications).length)
      .map((p) => [p.handle, p.specifications!])
  )

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata"],
  })

  const updates: { id: string; metadata: Record<string, unknown> }[] = []

  for (const product of products as {
    id: string
    handle: string
    metadata?: Record<string, unknown> | null
  }[]) {
    const specs = byHandle.get(product.handle)
    if (!specs) continue

    const current = product.metadata?.specifications
    const currentKeys =
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      Object.keys(current as object).length

    if (currentKeys) continue

    updates.push({
      id: product.id,
      metadata: {
        ...(product.metadata || {}),
        specifications: specs,
      },
    })
  }

  if (!updates.length) {
    logger.info("backfill-product-specifications: güncellenecek ürün yok.")
    return
  }

  logger.info(
    `backfill-product-specifications: ${updates.length} ürün güncellenecek.`
  )

  const BATCH = 10
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    await updateProductsWorkflow(container).run({
      input: { products: batch },
    })
    logger.info(
      `Güncellendi ${Math.min(i + BATCH, updates.length)} / ${updates.length}`
    )
  }

  logger.info("backfill-product-specifications: tamamlandı.")
}
