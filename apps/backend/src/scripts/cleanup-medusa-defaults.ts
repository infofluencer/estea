/**
 * Idempotent Medusa default-seed cleanup for Es Çay.
 *
 * Soft-deletes Medusa demo categories/products/options/shipping leftovers and
 * renames English default infra names (IDs unchanged).
 *
 * Run: npm run cleanup:medusa-defaults
 *      (medusa exec ./src/scripts/cleanup-medusa-defaults.ts)
 *
 * DO NOT re-run initial-data-seed.ts. Take a DB backup before first run.
 */
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  deleteProductCategoriesWorkflow,
  deleteProductOptionsWorkflow,
  deleteProductsWorkflow,
  deleteShippingOptionsWorkflow,
  updateApiKeysWorkflow,
  updateSalesChannelsWorkflow,
  updateStockLocationsWorkflow,
} from "@medusajs/medusa/core-flows"

/** Known Medusa default IDs from this environment (also matched by handle/name). */
const DEFAULT_CATEGORY_IDS = [
  "pcat_01M22XTDS070T719Z4VPY1WE6D", // Shirts
  "pcat_01M22XTDS0728NY14A5DERNXRQ", // Sweatshirts
  "pcat_01M22XTDS0BCRV0J6CVD5NJNE1", // Pants
  "pcat_01M22XTDS1PANJJRR1R0SQRBSB", // Merch
] as const

const DEFAULT_CATEGORY_HANDLES = [
  "shirts",
  "sweatshirts",
  "pants",
  "merch",
] as const

const DEFAULT_PRODUCT_IDS = [
  "prod_01M22XTDSNGX6S0W6C7NTVRC4D", // Medusa T-Shirt
  "prod_01M22XTDSNX27BVEVWP9NVWBS5", // Medusa Sweatshirt
  "prod_01M22XTDSN4WQB5ZVAHHZX11S6", // Medusa Sweatpants
  "prod_01M22XTDSNQPGGPJV179HSCJ4A", // Medusa Shorts
] as const

const DEFAULT_PRODUCT_HANDLES = [
  "t-shirt",
  "sweatshirt",
  "sweatpants",
  "shorts",
] as const

const DEMO_SHIPPING_NAMES = ["Standard Shipping", "Express Shipping"] as const

const EUROPE_ZONE_ID = "serzo_01M22XTDPW1ZX3EJ5GW87VGZHT"
const EUROPE_ZONE_NAME = "Europe"

const RENAMES = {
  salesChannel: {
    id: "sc_01M22XTDMB5WBPF6TPVTTWTQM7",
    fromNames: ["Default Sales Channel"],
    to: "Es Çay",
  },
  apiKey: {
    id: "apk_01M22XTDMHVEM9JKM7XHGAQSZZ",
    fromTitles: ["Default Publishable API Key"],
    to: "Storefront",
  },
  stockLocation: {
    id: "sloc_01M22XTDPJ36KBSR6MEFTMB2YB",
    fromNames: ["European Warehouse"],
    to: "Es Çay Depo",
  },
  fulfillmentSet: {
    id: "fuset_01M22XTDPWZWRJ0RNY48ED4B5G",
    fromNames: ["European Warehouse delivery"],
    to: "Es Çay Kargo",
  },
  shippingProfile: {
    id: "sp_01M22XTDKGSXPWKHD8GQ7J6RC0",
    fromNames: ["Default Shipping Profile"],
    to: "Standart Profil",
  },
} as const

/** Never soft-delete / mutate these (beyond name renames above). */
const PROTECTED = {
  salesChannelId: RENAMES.salesChannel.id,
  regionName: "Türkiye",
  turkeyZoneName: "Türkiye",
  shippingName: "Standart Kargo",
  carrierProvider: "carrier_carrier",
  paytrProvider: "pp_paytr_paytr",
  collectionHandles: ["yeni", "cok-satanlar"],
} as const

function uniq(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))]
}

export default async function cleanupMedusaDefaults({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  // ── Plan / summary ──────────────────────────────────────────────
  const { data: cats } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle", "deleted_at"],
  })
  const demoCats = (cats as any[]).filter(
    (c) =>
      !c.deleted_at &&
      (DEFAULT_CATEGORY_IDS.includes(c.id) ||
        DEFAULT_CATEGORY_HANDLES.includes(c.handle))
  )

  let allProducts: any[] = []
  try {
    allProducts = await productModule.listProducts({}, { withDeleted: true })
  } catch {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "deleted_at"],
    })
    allProducts = data as any[]
  }

  const demoProducts = allProducts.filter(
    (p) =>
      DEFAULT_PRODUCT_IDS.includes(p.id) ||
      DEFAULT_PRODUCT_HANDLES.includes(p.handle) ||
      (typeof p.title === "string" && p.title.startsWith("Medusa "))
  )
  const demoProductsToSoftDelete = demoProducts.filter((p) => !p.deleted_at)

  const { data: shippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "provider_id",
      "deleted_at",
      "service_zone.id",
      "service_zone.name",
    ],
  })
  const demoShipping = (shippingOptions as any[]).filter(
    (o) =>
      !o.deleted_at &&
      DEMO_SHIPPING_NAMES.includes(o.name) &&
      o.provider_id !== PROTECTED.carrierProvider &&
      o.name !== PROTECTED.shippingName
  )

  const { data: zones } = await query.graph({
    entity: "service_zone",
    fields: ["id", "name", "deleted_at", "shipping_options.id", "shipping_options.deleted_at"],
  })
  const europeZone = (zones as any[]).find(
    (z) =>
      !z.deleted_at &&
      (z.id === EUROPE_ZONE_ID || z.name === EUROPE_ZONE_NAME) &&
      z.name !== PROTECTED.turkeyZoneName
  )
  const europeActiveOpts = (europeZone?.shipping_options || []).filter(
    (o: any) => !o.deleted_at
  )
  const canSoftDeleteEurope =
    !!europeZone && europeActiveOpts.length === 0

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  const { data: sets } = await query.graph({
    entity: "fulfillment_set",
    fields: ["id", "name"],
  })
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  })
  const { data: apiKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "type"],
  })

  const planRename = (
    rows: any[],
    id: string,
    fromNames: readonly string[],
    field: "name" | "title",
    to: string
  ) => {
    const row =
      rows.find((r) => r.id === id) ||
      rows.find((r) => fromNames.includes(r[field]))
    if (!row) return null
    if (row[field] === to) return { id: row.id, skip: true as const, current: row[field] }
    return { id: row.id, skip: false as const, current: row[field], to }
  }

  const renameSc = planRename(
    channels as any[],
    RENAMES.salesChannel.id,
    RENAMES.salesChannel.fromNames,
    "name",
    RENAMES.salesChannel.to
  )
  const renameKey = planRename(
    (apiKeys as any[]).filter((k) => k.type === "publishable"),
    RENAMES.apiKey.id,
    RENAMES.apiKey.fromTitles,
    "title",
    RENAMES.apiKey.to
  )
  const renameLoc = planRename(
    locations as any[],
    RENAMES.stockLocation.id,
    RENAMES.stockLocation.fromNames,
    "name",
    RENAMES.stockLocation.to
  )
  const renameSet = planRename(
    sets as any[],
    RENAMES.fulfillmentSet.id,
    RENAMES.fulfillmentSet.fromNames,
    "name",
    RENAMES.fulfillmentSet.to
  )
  const renameProfile = planRename(
    profiles as any[],
    RENAMES.shippingProfile.id,
    RENAMES.shippingProfile.fromNames,
    "name",
    RENAMES.shippingProfile.to
  )

  logger.info("======== cleanup-medusa-defaults PLAN ========")
  logger.info(
    `SOFT-DELETE categories (${demoCats.length}): ${demoCats
      .map((c) => `${c.name}/${c.handle}`)
      .join(", ") || "(none)"}`
  )
  logger.info(
    `SOFT-DELETE Medusa products still live (${demoProductsToSoftDelete.length}): ${
      demoProductsToSoftDelete.map((p) => p.handle).join(", ") || "(none — already soft-deleted or absent)"
    }`
  )
  logger.info(
    `Already soft-deleted Medusa products: ${
      demoProducts.filter((p) => p.deleted_at).length
    }`
  )
  logger.info(
    `SOFT-DELETE demo shipping (${demoShipping.length}): ${
      demoShipping.map((o) => o.name).join(", ") || "(none)"
    }`
  )
  logger.info(
    `SOFT-DELETE Europe zone: ${
      canSoftDeleteEurope
        ? `${europeZone!.name} (${europeZone!.id}) — 0 active options`
        : europeZone
          ? `SKIP (${europeActiveOpts.length} active option(s))`
          : "SKIP (not found / already gone)"
    }`
  )
  logger.info(
    `RENAME sales channel: ${
      renameSc
        ? renameSc.skip
          ? `already "${renameSc.current}"`
          : `"${renameSc.current}" → "${renameSc.to}" (${renameSc.id})`
        : "not found"
    }`
  )
  logger.info(
    `RENAME publishable key: ${
      renameKey
        ? renameKey.skip
          ? `already "${renameKey.current}"`
          : `"${renameKey.current}" → "${renameKey.to}" (${renameKey.id})`
        : "not found"
    }`
  )
  logger.info(
    `RENAME stock location: ${
      renameLoc
        ? renameLoc.skip
          ? `already "${renameLoc.current}"`
          : `"${renameLoc.current}" → "${renameLoc.to}" (${renameLoc.id})`
        : "not found"
    }`
  )
  logger.info(
    `RENAME fulfillment set: ${
      renameSet
        ? renameSet.skip
          ? `already "${renameSet.current}"`
          : `"${renameSet.current}" → "${renameSet.to}" (${renameSet.id})`
        : "not found"
    }`
  )
  logger.info(
    `RENAME shipping profile: ${
      renameProfile
        ? renameProfile.skip
          ? `already "${renameProfile.current}"`
          : `"${renameProfile.current}" → "${renameProfile.to}" (${renameProfile.id})`
        : "not found"
    }`
  )
  logger.info(
    "PROTECTED (untouched): sales channel record, PK↔channel link, Türkiye region/zone, Standart Kargo, carrier/paytr, Es Çay catalog"
  )
  logger.info("=============================================")

  // ── 1) Soft-delete demo categories (0 live products required) ───
  const catIdsToDelete: string[] = []
  for (const cat of demoCats) {
    if (cat.id === PROTECTED.salesChannelId) continue
    const { data: linked } = await query.graph({
      entity: "product_category",
      fields: ["id", "products.id", "products.deleted_at"],
      filters: { id: cat.id },
    })
    const live = ((linked?.[0] as any)?.products || []).filter(
      (p: any) => p?.id && !p.deleted_at
    )
    // Ignore soft-deleted Medusa demo products still linked
    const liveNonDemo = live.filter(
      (p: any) =>
        !DEFAULT_PRODUCT_IDS.includes(p.id) &&
        !demoProducts.some((d) => d.id === p.id)
    )
    if (liveNonDemo.length) {
      logger.warn(
        `SKIP category ${cat.handle}: ${liveNonDemo.length} live non-demo product(s)`
      )
      continue
    }
    catIdsToDelete.push(cat.id)
  }
  if (catIdsToDelete.length) {
    await deleteProductCategoriesWorkflow(container).run({
      input: uniq(catIdsToDelete),
    })
    logger.info(`Soft-deleted categories: ${catIdsToDelete.join(", ")}`)
  } else {
    logger.info("No demo categories to soft-delete")
  }

  // ── 2) Soft-delete Medusa demo products ─────────────────────────
  const productIds = uniq(demoProductsToSoftDelete.map((p) => p.id as string))
  if (productIds.length) {
    await deleteProductsWorkflow(container).run({
      input: { ids: productIds },
    })
    logger.info(`Soft-deleted Medusa products: ${productIds.join(", ")}`)
  } else {
    logger.info("Medusa demo products already soft-deleted or absent")
  }

  // ── 3) Soft-delete Size/Color options only if solely on demo products ─
  const optionIdsToDelete: string[] = []
  let sizeColorOptions: any[] = []
  try {
    sizeColorOptions = await productModule.listProductOptions(
      { title: ["Size", "Color"] },
      { take: 20 }
    )
  } catch {
    const { data: opts } = await query.graph({
      entity: "product_option",
      fields: ["id", "title"],
      filters: { title: ["Size", "Color"] },
    })
    sizeColorOptions = opts || []
  }

  for (const opt of sizeColorOptions) {
    if (!opt?.id) continue
    // Products linked to this option (include soft-deleted)
    let linked: any[] = []
    try {
      linked = await productModule.listProducts(
        { options: { id: [opt.id] } },
        { withDeleted: true, take: 100 }
      )
    } catch {
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "handle", "deleted_at", "options.id"],
      })
      linked = (products as any[]).filter((p) =>
        (p.options || []).some((o: any) => o.id === opt.id)
      )
    }

    const liveNonDemo = linked.filter(
      (p) =>
        p?.id &&
        !p.deleted_at &&
        !DEFAULT_PRODUCT_IDS.includes(p.id) &&
        !DEFAULT_PRODUCT_HANDLES.includes(p.handle)
    )
    if (liveNonDemo.length) {
      logger.warn(
        `SKIP option ${opt.title} (${opt.id}): linked to live Es Çay product(s)`
      )
      continue
    }
    optionIdsToDelete.push(opt.id)
  }

  if (optionIdsToDelete.length) {
    await deleteProductOptionsWorkflow(container).run({
      input: { ids: uniq(optionIdsToDelete) },
    })
    logger.info(
      `Soft-deleted Size/Color options: ${uniq(optionIdsToDelete).join(", ")}`
    )
  } else {
    logger.info("No orphan Size/Color options to soft-delete")
  }

  // ── 4) Soft-delete Standard/Express shipping ────────────────────
  const shippingIds = uniq(
    demoShipping
      .filter((o) => o.id && o.name !== PROTECTED.shippingName)
      .map((o) => o.id as string)
  )
  if (shippingIds.length) {
    await deleteShippingOptionsWorkflow(container).run({
      input: { ids: shippingIds },
    })
    logger.info(`Soft-deleted demo shipping options: ${shippingIds.join(", ")}`)
  } else {
    logger.info("No live demo shipping options to soft-delete")
  }

  // ── 5) Soft-delete empty Europe service zone ────────────────────
  if (canSoftDeleteEurope && europeZone?.id) {
    // Re-check active options via fulfillment module
    const opts = await fulfillment.listShippingOptions(
      { service_zone_id: europeZone.id },
      { take: 50 }
    )
    const active = (opts || []).filter((o: any) => !o.deleted_at)
    if (active.length === 0) {
      await fulfillment.softDeleteServiceZones([europeZone.id])
      logger.info(`Soft-deleted Europe service zone: ${europeZone.id}`)
    } else {
      logger.warn(
        `SKIP Europe zone: ${active.length} active shipping option(s) remain`
      )
    }
  }

  // ── 6) Renames (ID stable) ──────────────────────────────────────
  if (renameSc && !renameSc.skip) {
    await updateSalesChannelsWorkflow(container).run({
      input: {
        selector: { id: renameSc.id },
        update: {
          name: RENAMES.salesChannel.to,
          description: "Es Çay storefront",
        },
      },
    })
    logger.info(
      `Renamed sales channel ${renameSc.id}: "${renameSc.current}" → "${RENAMES.salesChannel.to}"`
    )
  } else if (renameSc?.skip) {
    logger.info(`Sales channel already named "${renameSc.current}"`)
  }

  if (renameKey && !renameKey.skip) {
    await updateApiKeysWorkflow(container).run({
      input: {
        selector: { id: renameKey.id },
        update: { title: RENAMES.apiKey.to },
      },
    })
    logger.info(
      `Renamed API key ${renameKey.id}: "${renameKey.current}" → "${RENAMES.apiKey.to}"`
    )
  } else if (renameKey?.skip) {
    logger.info(`API key already titled "${renameKey.current}"`)
  }

  if (renameLoc && !renameLoc.skip) {
    await updateStockLocationsWorkflow(container).run({
      input: {
        selector: { id: renameLoc.id },
        update: { name: RENAMES.stockLocation.to },
      },
    })
    logger.info(
      `Renamed stock location ${renameLoc.id}: "${renameLoc.current}" → "${RENAMES.stockLocation.to}" (address unchanged — Copenhagen/DK until TR address provided)`
    )
  } else if (renameLoc?.skip) {
    logger.info(`Stock location already named "${renameLoc.current}"`)
  }

  if (renameSet && !renameSet.skip) {
    await fulfillment.updateFulfillmentSets({
      id: renameSet.id,
      name: RENAMES.fulfillmentSet.to,
    })
    logger.info(
      `Renamed fulfillment set ${renameSet.id}: "${renameSet.current}" → "${RENAMES.fulfillmentSet.to}"`
    )
  } else if (renameSet?.skip) {
    logger.info(`Fulfillment set already named "${renameSet.current}"`)
  }

  if (renameProfile && !renameProfile.skip) {
    await fulfillment.updateShippingProfiles(renameProfile.id, {
      name: RENAMES.shippingProfile.to,
    })
    logger.info(
      `Renamed shipping profile ${renameProfile.id}: "${renameProfile.current}" → "${RENAMES.shippingProfile.to}"`
    )
  } else if (renameProfile?.skip) {
    logger.info(`Shipping profile already named "${renameProfile.current}"`)
  }

  logger.info("cleanup-medusa-defaults DONE (idempotent — safe to re-run)")
}
