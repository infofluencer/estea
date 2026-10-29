/**
 * WooCommerce CSV → Medusa katalog importu (idempotent, handle + SKU ile upsert).
 *
 *   npm run import:wc            (dev)   npm run import:wc:prod   (container)
 *   DRY_RUN=1 npm run import:wc  → yalnız planı yazdırır, DB'ye dokunmaz
 *
 * Env:
 *   WC_CSV      CSV yolu (varsayılan data/wc-products.csv)
 *   IMAGE_BASE  görsel kök URL'si (varsayılan `${STOREFRONT_URL}/urunler`);
 *               görseller apps/frontend/public/urunler altında, repoda.
 *
 * Yeniden çalıştırınca: ürün alanları, görseller, fiyatlar güncellenir;
 * mevcut stok seviyelerine DOKUNULMAZ (admin'de düzenlenen stok korunur).
 */
import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createProductVariantsWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  buildPlan,
  EXTRA_CATEGORIES,
  parseCsv,
  type PlanProduct,
} from "../lib/wc-import-plan"

const CURRENCY = "try"

export default async function importWcProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const csvPath = resolvePath(process.cwd(), process.env.WC_CSV || "data/wc-products.csv")
  const storefrontUrl = (process.env.STOREFRONT_URL || "http://localhost:3025").replace(/\/+$/, "")
  const imageBase = (process.env.IMAGE_BASE || `${storefrontUrl}/urunler`).replace(/\/+$/, "")
  const dryRun = process.env.DRY_RUN === "1"

  logger.info(`=== WooCommerce import: ${csvPath} ===`)
  const { products, warnings } = buildPlan(parseCsv(readFileSync(csvPath, "utf8")))
  for (const w of warnings) logger.warn(`[plan] ${w}`)
  logger.info(
    `[plan] ${products.length} ürün, ${products.reduce((n, p) => n + p.variants.length, 0)} varyant, görsel kökü ${imageBase}`
  )
  for (const p of products) {
    logger.info(
      `  ${p.handle} (${p.status}) → ${p.variants
        .map((v) => `${v.title} ${v.price} TL [${v.sku}${v.stock == null ? ", stok takipsiz" : `, stok ${v.stock}`}]`)
        .join(" | ")}`
    )
  }
  if (dryRun) {
    logger.info("DRY_RUN=1 — DB'ye yazılmadı.")
    return
  }

  // --- Altyapı kayıtları ----------------------------------------------------
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
    filters: { currency_code: CURRENCY },
  })
  if (!regions.length) {
    throw new Error("TRY bölgesi yok — önce `npm run setup:turkey:prod` çalıştırın.")
  }

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const salesChannel =
    channels.find((c) => c.name === "Es Çay") ?? channels[0]
  if (!salesChannel) throw new Error("Satış kanalı yok")

  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  })
  const shippingProfileId = profiles[0]?.id
  if (!shippingProfileId) throw new Error("Shipping profile yok")

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  const stockLocationId = locations[0]?.id
  if (!stockLocationId) throw new Error("Stock location yok")

  // --- Kategoriler (handle → id; eksikse oluştur) ---------------------------
  const neededHandles = Array.from(
    new Set(products.flatMap((p) => p.categoryHandles))
  )
  const { data: cats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const categoryByHandle = new Map<string, string>(
    cats.filter((c) => c.handle).map((c) => [c.handle as string, c.id as string])
  )
  for (const handle of neededHandles) {
    if (categoryByHandle.has(handle)) continue
    const def = EXTRA_CATEGORIES.find((c) => c.handle === handle)
    if (!def) {
      throw new Error(
        `Kategori "${handle}" DB'de yok ve EXTRA_CATEGORIES'te tanımlı değil (setup:turkey çalıştı mı?)`
      )
    }
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: [
          { name: def.name, handle: def.handle, is_active: true, is_internal: false },
        ],
      },
    })
    categoryByHandle.set(handle, result[0].id)
    logger.info(`Kategori oluşturuldu: ${handle}`)
  }

  // --- Ürünler ----------------------------------------------------------------
  let created = 0
  let updated = 0
  let variantsCreated = 0
  let levelsCreated = 0

  for (const p of products) {
    const images = p.images.map((f) => ({ url: `${imageBase}/${f}` }))
    const thumbnail = images[0]?.url ?? null
    const categoryIds = p.categoryHandles.map((h) => categoryByHandle.get(h)!)
    const productMetadata = {
      specifications: p.specifications,
      source: "woocommerce",
      wc_ids: p.wcIds.join(","),
    }
    const status = p.status === "published" ? ProductStatus.PUBLISHED : ProductStatus.DRAFT

    const { data: existing } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "variants.id", "variants.sku"],
      filters: { handle: p.handle },
    })
    const found = existing[0]

    if (!found) {
      await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: p.title,
              subtitle: p.subtitle ?? undefined,
              handle: p.handle,
              description: p.story ?? undefined,
              status,
              images,
              thumbnail: thumbnail ?? undefined,
              category_ids: categoryIds,
              sales_channels: [{ id: salesChannel.id }],
              shipping_profile_id: shippingProfileId,
              metadata: productMetadata,
              options: [{ title: p.optionTitle, values: p.variants.map((v) => v.title) }],
              variants: p.variants.map((v) => ({
                title: v.title,
                sku: v.sku,
                options: { [p.optionTitle]: v.title },
                manage_inventory: v.manageInventory,
                allow_backorder: false,
                prices: [{ amount: v.price, currency_code: CURRENCY }],
                metadata: { wc_id: v.wcId, wc_sku: v.wcSku },
              })),
            },
          ],
        },
      })
      created++
      logger.info(`+ ürün: ${p.handle} (${p.variants.length} varyant)`)
    } else {
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: found.id },
          update: {
            title: p.title,
            subtitle: p.subtitle,
            description: p.story,
            status,
            images,
            thumbnail,
            category_ids: categoryIds,
            metadata: productMetadata,
          },
        },
      })
      updated++

      const existingBySku = new Map<string, string>()
      for (const v of (found.variants ?? []) as { id?: string; sku?: string | null }[]) {
        if (v?.sku && v.id) existingBySku.set(v.sku, v.id)
      }
      const toUpdate = p.variants.filter((v) => existingBySku.has(v.sku))
      const toCreate = p.variants.filter((v) => !existingBySku.has(v.sku))

      if (toUpdate.length) {
        await updateProductVariantsWorkflow(container).run({
          input: {
            product_variants: toUpdate.map((v) => ({
              id: existingBySku.get(v.sku)!,
              title: v.title,
              manage_inventory: v.manageInventory,
              prices: [{ amount: v.price, currency_code: CURRENCY }],
              metadata: { wc_id: v.wcId, wc_sku: v.wcSku },
            })),
          },
        })
      }
      if (toCreate.length) {
        await createProductVariantsWorkflow(container).run({
          input: {
            product_variants: toCreate.map((v) => ({
              product_id: found.id,
              title: v.title,
              sku: v.sku,
              options: { [p.optionTitle]: v.title },
              manage_inventory: v.manageInventory,
              allow_backorder: false,
              prices: [{ amount: v.price, currency_code: CURRENCY }],
              metadata: { wc_id: v.wcId, wc_sku: v.wcSku },
            })),
          },
        })
        variantsCreated += toCreate.length
      }
      logger.info(
        `~ ürün: ${p.handle} (güncellendi; ${toUpdate.length} varyant fiyatı, ${toCreate.length} yeni varyant)`
      )
    }

    // --- Stok seviyeleri (yalnız eksikse; mevcut stok korunur) ---------------
    const { data: withInventory } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "sku",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
      ],
      filters: { sku: p.variants.map((v) => v.sku) },
    })
    const levels: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
    for (const v of p.variants) {
      if (v.stock == null) continue
      const row = withInventory.find((r) => r.sku === v.sku)
      const link = row?.inventory_items?.[0]
      const itemId = link?.inventory_item_id
      if (!itemId) {
        logger.warn(`${p.handle} ${v.sku}: inventory item yok, stok yazılamadı`)
        continue
      }
      const hasLevel = (link?.inventory?.location_levels ?? []).some(
        (l) => l?.location_id === stockLocationId
      )
      if (hasLevel) continue
      levels.push({ inventory_item_id: itemId, location_id: stockLocationId, stocked_quantity: v.stock })
    }
    if (levels.length) {
      await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: levels } })
      levelsCreated += levels.length
    }
  }

  logger.info(
    `=== Import bitti: ${created} yeni ürün, ${updated} güncellenen ürün, ${variantsCreated} yeni varyant, ${levelsCreated} stok seviyesi ===`
  )
  logger.info(`Görseller ${imageBase}/… adresinden servis edilir (apps/frontend/public/urunler).`)
  logger.info("Admin → Products altında fiyat/stok/metinleri kontrol edin; Paraşüt ürün kodları SKU'larla aynı olmalı.")
}
